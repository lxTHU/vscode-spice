# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A VS Code extension (`publisher: xuanli`, single language id `spice`) providing syntax highlighting, code folding, snippets, and IDE-style netlist navigation for **both HSPICE and Cadence Spectre (`.scs`)**. It ships zero runtime npm dependencies — only dev `@types/*` + `typescript`. The compiled `out/` ships inside the VSIX; `src/` does not.

## Commands

```bash
npm ci                   # clean install from the committed lockfile
npm run compile          # tsc -p ./ → out/*.js (strict mode)
npm run check            # compile + all synthetic/public-boundary assertions
npm run package:vsix     # verified VSIX build with pinned VSCE
npm run watch            # incremental recompile during dev
```

- **Debug in VS Code**: F5 (`Launch Extension` config opens an Extension Host dev window with this extension loaded).
- **Install a local build**: `code --install-extension spice-<version>.vsix` (then **restart VS Code** — icon + grammar are cached).
- **Regression data**: committed tests and public evidence are generated or
  synthetic only; see `docs/RELEASE.md`.

There is **no lint step**. Parser/connectivity tests are plain Node.js assertion
scripts; the public-boundary test is Bash. All are wired into `npm run check`.

## Architecture

The navigation engine is the non-obvious part. Read `docs/ARCHITECTURE.md` for the full design; the essentials:

**Four files, one in-process pipeline** (no language server, no IPC):
```
src/parser.ts    preprocess → tokenize → parseFile → FileModel
src/index.ts     SymbolIndex: caches FileModels, resolves .INCLUDE graphs, section scope
src/connectivity.ts pure formal-port/range/reference policies
src/extension.ts registers 7 providers + diagnostics + 2 scope commands
```

**The provider layer is dialect-agnostic.** Cursor providers resolve the shared
`FileModel` through `tokenAtPosition` or the lexical connectivity index; symbol,
link, highlight, and Inlay Hint providers consume the same parser/index model.
They do not branch on HSPICE versus Spectre. Add syntax recognition in
`parser.ts`, keep cross-file lookup in `index.ts`, and keep UI policy in the
smallest applicable provider or pure `connectivity.ts` helper.

**`FileModel` is the shared dialect-neutral container** — `subcktDefs` /
`modelDefs` / `paramDefs` / `sectionDefs` / includes / instances, plus optional
live-document `connectivity`. Disk include models must not build connectivity.

**Dialect is tracked per logical line**, not per file. `LogicalLine.dialect: "hspice" | "spectre"` is set in `preprocess` (initial value from `.scs` extension, then updated by `simulator lang=spectre|spice` directives). This lets a single mixed-dialect file parse correctly in one pass. `isHead(first, "subckt")` matches both `.subckt` (HSPICE) and `subckt` (Spectre) so one statement body serves both.

**The two instance forms are fundamentally different** and live in separate parsers:
- HSPICE: `Xname nodes subckt` (prefix letter, bare nodes, target last) → `parseXInstance` / `parseDeviceInstance`.
- Spectre: `name ( nodes ) target params` (name first, nodes in parens, target after) → `parseSpectreInstance`. A target in `PRIMITIVE_TYPES` (resistor/mosfet/diode/…) becomes a `DeviceInstance` **with no `modelName`** (built-in primitives have no Definition to jump to); otherwise it's an `XInstance` resolved subckt-first-then-model.

**Section scope** (HSPICE `.lib 'file' section` / Spectre `section`): a stack tracks open sections; every def is tagged with its section. `resolveScope` picks the active section via manual-override → reverse `.lib` edge → undetermined (then Peek lists all defs). This is structural scope, not HSPICE corner-value evaluation.

## Code folding — gotchas

Folding is driven by `language-configuration.json` `folding.markers` (start/end regex stack), **independent of the parser**. The regexes are hand-tuned and have subtle, hard-won properties — re-validate any change against real files:

- **HSPICE markers must not regress.** The `.lib` branch carries a negative lookahead `(?!\s*['"])` to distinguish `.LIB section` (definition, folds) from `.lib 'file' section` (file reference, must NOT fold). Dropping it re-introduces the 0.2.4 bug.
- **Spectre `{ }` blocks** (`model { … }`, `statistics { … }`, `if () { … }`) fold via balanced braces: start = line ending in `{` with no `{`/`}` earlier on the line; end = a line that is only `}`. Lines like `} value if () {` (open+close on one line) are deliberately matched by **neither** so the stack stays balanced. Spectre `model NAME diode` cards (no braces, single statement) are intentionally not foldable.
- **`model`/`if`/`statistics` appear in both dialects with different closers**: HSPICE `.model`/`.if`/`.statistics` (closed by `+)` / `.endif`) vs Spectre bare `model`/`statistics`/`if` (closed by `}`). The start regex has a **dotted group** (HSPICE, `\.`-prefixed, all keywords) and a **dotless group** (Spectre, excludes `model`/`if`/`statistics` — those ride the `{ }` rule instead). Do not collapse them into one `\.?`-optional group; it corrupts the fold stack on Spectre files.

When changing folding, verify with generated `.scs` and `.l` samples: the stack
must return to depth 0 at EOF and existing synthetic counts must remain stable.

## Snippets & highlighting

- **Snippets** (`snippets/*.json`) and **grammar** (`syntaxes/SPICE.tmLanguage`, flat patterns, no repository) are **not** dialect-split — all four snippet files and one grammar serve the single `spice` language id. Both dialects' keywords/devices/analyses are already covered.
- **Do not split into a separate `spectre` language id.** It would break the unified provider model and require a parallel grammar.

## Security constraints

- `docs/internal/` is forbidden by the public-boundary gate. Never commit,
  package, or push private notes, source material, screenshots, or logs. The
  reviewed root `icon.png` is the only allowlisted binary.
- **Public artifacts** must use generated/synthetic examples only. Never include
  private hostnames, paths, domains/IPs, emails, source identities, netlists,
  screenshots, raw logs, or private measurements—even in redacted form.
- The Marketplace PAT is a secret — never committed, logged, or passed on a logged command line. Publishing is the only step that needs it (see `docs/RELEASE.md`).

## Docs map

- `docs/ARCHITECTURE.md` — navigation engine internals, design decisions, capability vs upstream.
- `docs/SYNTAX.md` — HSPICE vs Spectre dialect comparison + navigation capability matrix.
- `docs/RELEASE.md` — build/package/publish steps.
- `docs/TODO.md` — known limitations.
- `CHANGELOG.md` — release history (keep entries concise, non-duplicative; past duplicate `[0.3.0]` blocks were a cleanup target).
