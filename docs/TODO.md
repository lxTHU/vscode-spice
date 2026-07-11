# Known Limitations & TODO

Tracked, non-blocking items for the netlist-navigation engine. Items here are
either known design limits or lower-priority improvements.

## Parser / navigation correctness
- **Expression variable extraction is best-effort.** Variable references are
  found by scanning identifiers in `'...'` expressions and excluding function
  calls (`name(`) plus a hardcoded HSPICE built-in function list
  (`HSPICE_BUILTIN_FUNCS` in `src/parser.ts`). Unknown simulator functions or
  user `.func` names may be mis-classified. Affects reference completeness
  only, never jump correctness. Improvement idea: also index `.func` definitions
  and treat their names as non-variables.
- **`tokenAtPosition` variable detection covers `.param` value expressions but
  not model-card `key='expr'` strings.** Clicking a variable inside a model card
  falls back to the word-under-cursor resolver (works, but does not return
  `paramRef` hit metadata). Storing per-string ranges on `ModelDef` would make
  this precise.
- **`.param` value ranges across physical lines** (`+` continuation with an
  expression split across lines) use single-line approximation in
  `identifierAtOffset`; multi-line value expressions may not resolve the clicked
  identifier.
- **Scope resolution is structural, not numerical.** It identifies *which*
  `.LIB section` a definition lives in; it does **not** evaluate HSPICE
  expression substitution to compute the simulator-effective parameter values.
- **`.data`, `.measure`, Monte-Carlo / statistical semantics** are not parsed.
- **Nested `.SUBCKT`** is unsupported (not valid HSPICE syntax).

## Performance / UX
- The Outline for very large PDKs (~5000 symbols, 196 sections) is built in a
  single synchronous `provideDocumentSymbols` call. Acceptable today; if it
  stalls, consider a `DocumentSymbolProvider` with `workDoneToken` or lazy
  section expansion.
- Disk-cache invalidation for include files is mtime-based; if an included file
  changes externally while closed, navigation may be stale until it is reopened
  or the includer is edited.

## Scope of HSPICE vs Spectre
- Navigation is HSPICE-only. Spectre `.scs` files still get syntax highlighting,
  folding, and snippets, but **not** Go-to-Definition / Hover / References.
  Spectre `subckt` / `model` / `include` navigation would need a parallel parser
  branch (the upstream extension supports it via `simulator lang=` switching).

## Build / release
- `out/` is git-ignored and rebuilt by `vscode:prepublish`; ensure
  `npm run compile` succeeds before `vsce package`.
- `package-lock.json` is currently git-ignored; revisit if reproducible
  dependency installs become important.
