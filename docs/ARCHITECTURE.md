# Navigation Engine — Architecture & Design

The netlist-navigation engine (added in 0.3.0, Spectre support in 0.3.5, scoped
connectivity in 0.4.0) gives the extension IDE-style Go-to-Definition / Hover /
References / Highlight / Inlay Hints / Outline / Diagnostics for **both HSPICE
and Spectre (`.scs`)** netlists. This document captures the architecture and the
non-obvious design decisions so future contributors don't re-derive them.

## High-level design

The engine runs **entirely in the VS Code extension host process** — there is no
language-server (no `vscode-languageclient`/`vscode-languageserver`, no child
process, no IPC). Providers are registered with the standard
`vscode.languages.register*Provider` API.

```
src/parser.ts    preprocess → tokenize → parseFile  →  FileModel
src/index.ts     SymbolIndex: caches FileModels, resolves .INCLUDE graphs,
                  answers symbol lookups + live lexical-net lookups
src/connectivity.ts pure formal-port/range/reference policy helpers
src/extension.ts registers 7 providers + diagnostics + scope commands,
                  converts internal {line,col} ↔ vscode.Position
```

This mirrors the structure of `vladimir-aptekar/hspice-intellisense` (whose
parser logic was ported and simplified — see `LICENSE` Third-Party Notice), but
that extension runs the same logic inside a separate language-server process;
we run it in-process to avoid the dependency and complexity.

### Why no language server?
All of the upstream provider logic (definition/hover/references/outline) sits on
top of a single-pass `parseFile()` + an in-memory `SymbolIndex`. There is no need
for incremental document synchronization, multi-client support, or out-of-process
isolation — so the LSP process adds cost without benefit. The in-process model is
simpler, has one fewer failure mode, and keeps the extension dependency-free.

## Parser pipeline (`src/parser.ts`)

`parseFile(filePath, source, opts)` does three things in one pass (O(n)):

1. **`preprocess`** — normalizes newlines, joins HSPICE `+`, Spectre trailing
   `\\`, and open `{ ... }` continuations, strips inline comments outside
   quotes, drops blank/full-line comments, and tracks `simulator lang=` per
   logical statement. The same normalization is reused by token and offset
   mapping so physical ranges remain exact.
2. **`tokenize`** — splits each logical line into tokens classified as
   `dot-command` / `param` (`key=value`) / `number` / `identifier` / `string`.
3. **statement dispatch** — `.SUBCKT`/`.ENDS`, `.MODEL`, `.param`, `.LIB`,
   `.ENDL`, `.INCLUDE`/`.INC`, `X`-instances, device instances.

### `.lib` dual syntax (the critical correctness fix)

HSPICE `.lib` has two unrelated meanings. The 0.3.0 code treated every `.lib`
as a file include, which on a real process library misread all of its `.LIB section`
definitions as includes and broke navigation entirely.

Distinguished by the **first token after `.lib`**:

| Form | Example | Meaning | Stored as |
|---|---|---|---|
| reference | `.lib 'filepath' section` (1st token is a quoted **string**) | include a file's section | `LibRef` (path + section) |
| definition | `.LIB section … .ENDL section` (1st token is an identifier) | define a section block | `SectionDef` (push/pop section stack) |

This is the single most important rule in the parser. Verified on a large
real-world process library: `sectionDefs` ≈ number of `.ENDL`, `libRefs` = real
references, `includes` no longer polluted.

### `.param` variable parsing

A `.param` line is **not** parsed from tokenizer `param` tokens, because the
tokenizer splits `name = 'expr'` (spaces around `=`) into three tokens and
leaves quotes on `name='expr'` values. Instead `parseParamDefs` scans the merged
logical-line text directly with a `name = value` regex that tolerates:
- `=` with surrounding whitespace,
- single-quoted expressions `'...'` (quotes consumed, value stored without them),
- bare expressions / function calls,
- multiple definitions per line.

Name/value character offsets are mapped back to `(line, character)` ranges via
`offsetRange`, which walks the logical line's physical lines.

### Expression variable references

`extractVarRefs(expr)` returns identifiers in an expression, excluding:
- identifiers immediately followed by `(` (function calls),
- a hardcoded HSPICE built-in function list (`HSPICE_BUILTIN_FUNCS`: `max`,
  `pwr`, `agauss`, `sqrt`, `log`, `v`, `i`, …),
- user `.func` / `define` function names collected per file (`FileModel.funcNames`),
- identifiers glued to a digit or `.` — strips the `e`/`E` exponent marker of
  scientific notation (e.g. `1.6e-08`) via a `(?<![\w.])` lookbehind.

This is best-effort (see `docs/TODO.md`). Var refs are stored with exact ranges
on `ParamDef`, `ModelDef`, `XInstance`, and `DeviceInstance` expression metadata
(`.param` values, model-card `key='expr'` strings, and instance/device parameter
expressions). A backfill pass recomputes `ParamDef.varRefs` once all `.func`
names are known, so functions defined after a `.param` are still excluded.

### Section stack

A stack tracks open `.LIB section` blocks; every `paramDef` / `modelDef` /
`subcktDef` is tagged with the innermost `section` name (lowercased).
Unterminated `.SUBCKT` and `.LIB` blocks are still kept (so navigation works on
malformed/partial files).

### Instance indexing strategy

Three `ParseOptions` control which instances are stored or indexed (memory vs.
coverage):

- **`indexedDeviceTypes`** — device letters whose full instances are retained. Defaults
  to `M Q D J S Z V I E G F H`. Including modeled devices is essential for the common
  pattern of wrapping a primitive (MOSFET/BJT/diode) plus parasitics inside a
  `.subckt` — without them, model references in those bodies are not navigable.
  High-volume passives (`R`/`C`/`L`) are excluded from full retention by default.
- **`minXInstanceNodes`** — HSPICE `X`-instances with this many nodes or fewer are
  skipped. Default 2: drops degenerate ≤2-node lines while keeping the minimum
  MOSFET-subckt case of 3+ nodes (source/drain/gate, optionally bulk).
- **`minSpectreModelNodes`** — minimum node count for Spectre model/subckt
  references. Default 2: keeps legitimate 2-node diode/model references.
  Built-in Spectre primitives are classified separately and never become false
  model jumps.
- **`indexConnectivity`** — builds the lexical net index for an open document.
  It defaults off and is forced off for disk include-cache models.

The retention filters are overridable. Connectivity is deliberately independent
of them: an open document records lightweight endpoints for recognized X and
device statements before the full-instance retention gate, so R/C/L and short X
calls remain inspectable without expanding the disk cache.

### Lexical connectivity model (0.4.0)

`FileModel.connectivity` is optional and has two maps:

- `byLine`: exact physical-line occurrences for cursor hits and visible-range
  Inlay Hints;
- `byScopeAndName`: scope id → lowercased net name → occurrences, for O(1)
  same-net lookup.

A `NetOccurrence` preserves the source spelling/range and points to a
`NetEndpoint` (subckt header port, X actual port, or primitive device terminal).
`NetScope` is either file top level or one specific subckt definition. Its id
includes the definition position, so two same-named definitions do not merge.

This is not a hierarchy graph. Same-name nets in other files/subcircuits are not
connected, and `0`, `.global`, and Spectre `global` receive no special
cross-scope semantics in 0.4.0. X-node F12 and Inlay labels may reuse the
existing subckt-definition resolver to name the positional formal port; that
does not broaden the set returned by net Highlight or References.

Both dialects use lowercased lookup keys while retaining source spelling and
ranges. This is an intentional 0.4.0 navigation rule; Spectre case-only-distinct
nets are a documented limit rather than simulator-equivalence semantics.

## Symbol index (`src/index.ts`)

`SymbolIndex` holds two caches:
- **`live`** — FileModels from open editors (re-parsed on change, debounced),
  with connectivity enabled.
- **`disk`** — FileModels for include files not open, keyed by absolute path,
  invalidated by `mtime`, with connectivity disabled.

`getModel(path)` prefers live, else reads disk (caching). `indexWithIncludes`
recursively follows `.INCLUDE`/`.INC`/`.LIB`-reference edges, with a visited set
to handle cyclic include graphs.

### Multi-definition lookups

A name can be defined in several `.LIB section` corners, so lookups return arrays:
`findParamDefs`, `findAllModelDefs`, `findAllSubcktDefs`. Single-value helpers
(`findSubckt`, `findModel`) are retained for the legacy diagnostics path.

### Section scope resolution (`resolveScope`)

HSPICE `.lib 'file' section` activates one section of `file`. The active scope
for a file is resolved as:

1. **Manual override** (highest priority) — `setManualScope`, set by the
   `spice.selectScope` command (scenario B: a user analyzing a shared PDK
   directly picks a corner).
2. **Reverse edge** — find a parent file that references this file via
   `.lib '<thisFile>' section`; if exactly one section name is referenced,
   the scope is determined (scenario A: an upstream netlist already selected it).
3. Otherwise **undetermined**.

In the definition provider, `scopedDefs(defs, filePath)`:
- if scope is determined → return only in-scope defs (jump straight, no picker),
- if undetermined → return **all** defs, letting VS Code's native Peek list them.

This is **structural** scope (which section a definition lives in), **not**
numerical HSPICE corner evaluation — see `docs/TODO.md`.

## Providers (`src/extension.ts`)

| Provider | Behavior notes |
|---|---|
| `DocumentSymbolProvider` | Hierarchical: `.LIB section` (Namespace) → nested model/subckt/param. |
| `DefinitionProvider` | Multi-result → native Peek picker. Scope-aware via `scopedDefs`. Has a word-under-cursor fallback for unmarked tokens. |
| `HoverProvider` | subckt ports, model type, node→port/terminal, param value(s), resolved env vars on `.INCLUDE`/`.lib` paths. |
| `ReferenceProvider` | subckt/model instances; param expression references; same-scope net endpoints on a net token. |
| `DocumentHighlightProvider` | same-file, same-scope occurrences of the net under the cursor. |
| `InlayHintsProvider` | visible-range-only clickable formal-port labels for unique, count-matched X calls; one caller-bounded definition snapshot per request, cancellation-aware. |
| `DocumentLinkProvider` | `.INCLUDE`/`.INC` and `.lib 'file'` paths → clickable file links. |
| Diagnostics | Unknown subckt + port-count mismatch (X-instances only; `.param` is not diagnosed). |

Two commands: `spice.selectScope` / `spice.clearScope` (registered in
`package.json` `contributes.commands` + editor context menu).

### Coordinate conversion

The parser/index use `{line, character}` 0-based positions identical to VS Code
`Position`, so conversion is direct — the only wrinkle is `clampLine` (provider
edge) so a range never references a line beyond the document's current length
(matters when a doc is mid-edit).

## Capability comparison vs `vladimir-aptekar/hspice-intellisense`

| Capability | Upstream | This extension |
|---|---|---|
| subckt/model/node F12, Hover, References | ✅ | ✅ |
| Outline | flat | ✅ hierarchical under `.LIB section` |
| `.lib` dual syntax | ❌ (same bug) | ✅ fixed |
| `.param` variable navigation | ❌ | ✅ |
| `.LIB section` navigation + scope | ❌ | ✅ |
| Runtime model | language-server process | in-process |

The `.lib` dual-syntax bug, `.param` support, `.LIB section` scope, and the
multi-definition resolver are **original additions**; the upstream FileModel has
no `.param`/section concept.

## Performance & robustness

Single-pass O(n) parsing with bounded in-memory indexing. Re-parse on edit is
debounced (300 ms); closing a document cancels its pending timer. Include-graph
crawling is on-demand with mtime-cached disk reads. Net fanout lookup is O(1)
before returning the endpoints. Inlay Hints touch only requested lines, build
one caller-bounded definition snapshot, and cache target/scope resolution for
the request. A reachable model/subckt name collision deliberately yields no
formal-port hint or jump.

Committed validation and public release evidence use generated/synthetic
netlists only. Optional private local canaries remain outside Git, CI, VSIX, and
published performance evidence.

MOSFET/BJT/diode model references inside `.subckt` bodies are navigable
(`M`/`Q`/`D` indexed by default since 0.3.3).

## Spectre support (0.3.5)

Spectre is parsed by the **same single-pass engine** that handles HSPICE — there
is no parallel parser. The provider layer is dialect-agnostic (every provider
calls `tokenAtPosition` + `index.findXxx`), so the only Spectre-aware code lives
in `parser.ts`. The key mechanisms:

### Per-line dialect tracking
`LogicalLine` carries a `dialect: "hspice" | "spectre"` tag. `preprocess`
maintains a `currentLang` state initialised from the file extension (`.scs` →
Spectre) and updated whenever a `simulator lang=spectre|spice` directive is seen;
that line is consumed (not indexed) and subsequent lines inherit the new dialect.
This makes a mixed-dialect file parse correctly in one pass.

### Dialect-aware tokenization & preprocessing
- `stripInlineComment` strips `$` / `;` (HSPICE) and `//` (both) outside quotes.
- Parentheses `(` / `)` are emitted as standalone tokens so Spectre's
  `name ( nodes ) target` instance form and `subckt NAME ( ports )` definitions
  are positional. `{` / `}` are separators only.
- `+`, trailing `\\`, and open `{ … }` continuations are joined line-by-line.
  Brace depth is tracked **incrementally** (`braceDelta` scans only the newly
  joined line, never the growing whole string) with a per-statement cap of 4000
  lines as a safety valve against an unclosed `{`. This is what keeps large
  files linear — an earlier whole-string rescan was O(n²) (tens of seconds).

### Head matching across dialects
`isHead(first, "subckt")` matches both `.subckt` (HSPICE) and `subckt` (Spectre),
so the same statement body serves both. The main loop adds Spectre branches:
`subckt` / `inline subckt` (ports extracted from `( )` via `extractPorts`),
`ends`, `model`, `parameters` (reuses `parseParamDefs`), `include` (quoted path),
`section`/`library` (push a `SectionDef`), `endsection`/`endlibrary` (pop).
`global` / `statistics` / `process` / `mismatch` / `connect` / `options` /
`alter` are consumed but not indexed.

### Spectre instances (`parseSpectreInstance`)
A Spectre instance is `name ( nodes… ) target params…`. The target token is the
first identifier/number after the matching `)`:
- If `target ∈ PRIMITIVE_TYPES` → stored as a `DeviceInstance` with
  `deviceType = target` and **no `modelName`/`modelNameRange`** (a built-in
  primitive has no Definition target, so the provider must never treat its name
  as a navigable reference).
- Otherwise → stored as an `XInstance` (`subcktName = target`); the existing
  `findSubcktOrModel` resolver (subckt-first, then model) handles the jump.

`PRIMITIVE_TYPES` is a deliberately over-inclusive superset of Spectre built-in
primitives (`resistor`, `capacitor`, `inductor`, `mosfet`, `bsim3`/`bsim4`/…,
`diode`, `bjt`, `jfet`, `vsource`, `isource`, `vcvs`/`vccs`/`ccvs`/`cccs`,
`tline`, `switch`, …). `SPECTRE_KEYWORDS` keeps the instance branch off control
statements (`ac`/`dc`/`tran`/`save`/`print`/…).

### Hover terminals for primitives
`extension.ts` keeps `SPECTRE_TERMINALS` (primitive name → terminal labels,
e.g. `mosfet → [d,g,s,b]`); the `nodeInDevice` hover looks it up first, falling
back to the HSPICE-letter `DEVICE_TERMINALS`, then `term{i}`.

Validation uses synthetic Spectre corpora; private source material and
dataset-specific measurements are not published.
