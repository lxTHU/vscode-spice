# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A VS Code extension (`publisher: xuanli`, single language id `spice`) providing syntax highlighting, code folding, snippets, and IDE-style netlist navigation for **both HSPICE and Cadence Spectre (`.scs`)**. It ships zero runtime npm dependencies — only dev `@types/*` + `typescript`. The compiled `out/` ships inside the VSIX; `src/` does not.

## Commands

```bash
npm install              # first time: typescript, @types/vscode, @types/node
npm run compile          # tsc -p ./  → out/{extension,parser,index}.js  (strict mode)
npm run watch            # incremental recompile during dev
node test/parser_spectre.test.js   # parser unit tests (no test framework; node assertions, run after compile)
npx @vscode/vsce@latest package --no-dependencies --allow-missing-repository   # build VSIX
```

- **Debug in VS Code**: F5 (`Launch Extension` config opens an Extension Host dev window with this extension loaded).
- **Install a local build**: `code --install-extension spice-<version>.vsix` (then **restart VS Code** — icon + grammar are cached).
- **Parser smoke-test on a real PDK** (no VS Code needed): `node -e 'const {parseFile}=require("./out/parser.js"); ...'` — see `docs/RELEASE.md` step 2.

There is **no lint step** and **no test runner** — `test/parser_spectre.test.js` is a plain node script with inline assertions.

## Architecture

The navigation engine is the non-obvious part. Read `docs/ARCHITECTURE.md` for the full design; the essentials:

**Three files, one in-process pipeline** (no language server, no IPC):
```
src/parser.ts    preprocess → tokenize → parseFile → FileModel
src/index.ts     SymbolIndex: caches FileModels, resolves .INCLUDE graphs, section scope
src/extension.ts registers 5 providers + diagnostics + 2 scope commands
```

**The provider layer is dialect-agnostic.** Every provider (`Definition`/`Hover`/`References`/`DocumentSymbol`/`DocumentLink`) calls `tokenAtPosition(model, pos)` then `index.findXxx()`. They do not know or care whether the `FileModel` came from HSPICE or Spectre. **So: to add navigable constructs, extend `parser.ts` to populate the shared `FileModel`; do not touch provider logic.** `SymbolIndex` (`src/index.ts`) is also dialect-neutral and rarely needs changes.

**`FileModel` is the shared dialect-neutral container** — `subcktDefs` / `modelDefs` / `paramDefs` (multi-map) / `sectionDefs` / `includes` / `libRefs` / `xInstances` / `deviceInstances`. Both dialects populate the same structure.

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

When changing folding, verify with a stack-simulation script (see git history / `test/`) against a large `.scs` and a large `.l`: the stack must return to depth 0 at EOF on both, and HSPICE counts must match the pre-change baseline exactly.

## Snippets & highlighting

- **Snippets** (`snippets/*.json`) and **grammar** (`syntaxes/SPICE.tmLanguage`, flat patterns, no repository) are **not** dialect-split — all four snippet files and one grammar serve the single `spice` language id. Both dialects' keywords/devices/analyses are already covered.
- **Do not split into a separate `spectre` language id.** It would break the unified provider model and require a parallel grammar.

## Security constraints

- `docs/internal/` is git-ignored and `.vscodeignore`d — it holds vendor/PDK-specific, commercially sensitive notes (e.g. `build_icon.py`, logo source). Never commit, package, or push it. The `icon.png` at repo root **is** public (ships in the VSIX).
- **Public artifacts** (`src/` comments, `docs/*.md` except `internal/`, `README.md`, `CHANGELOG.md`) must never contain real PDK vendor names, process nodes, exact file names, or exact structural counts (e.g. "~525 models"). Use generic labels ("PDK-A", "a high-voltage BCD process library").
- The Marketplace PAT is a secret — never committed, logged, or passed on a logged command line. Publishing is the only step that needs it (see `docs/RELEASE.md`).

## Docs map

- `docs/ARCHITECTURE.md` — navigation engine internals, design decisions, capability vs upstream.
- `docs/SYNTAX.md` — HSPICE vs Spectre dialect comparison + navigation capability matrix.
- `docs/RELEASE.md` — build/package/publish steps.
- `docs/TODO.md` — known limitations.
- `CHANGELOG.md` — release history (keep entries concise, non-duplicative; past duplicate `[0.3.0]` blocks were a cleanup target).
