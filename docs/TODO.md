# Known Limitations & TODO

Tracked, non-blocking items for the netlist-navigation engine. Items here are
either known design limits or lower-priority improvements.

## Parser / navigation correctness
- **Expression variable extraction is best-effort.** Variable references are
  found by scanning identifiers in `'...'` expressions and excluding function
  calls (`name(`), a hardcoded HSPICE built-in function list
  (`HSPICE_BUILTIN_FUNCS` in `src/parser.ts`), user `.func` names (collected per
  file since 0.3.6), and identifiers glued to a digit or decimal point (a
  negative lookbehind that strips the `e`/`E` exponent marker of scientific
  notation like `1.6e-08`, since 0.3.6). Since 0.3.7 the parser, `.param`
  cursor hit-testing, and provider fallback share the same identifier boundary
  helper for operator-adjacent names such as `a-noiseflagn`. Since 0.3.8,
  references in `.param` values, model-card `key='expr'` values, and
  X/device/Spectre instance parameter expressions are indexed with exact ranges.
  Unknown simulator built-in functions may still be mis-classified. Affects
  reference completeness only, never jump correctness.
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
- The Outline for very large PDKs (thousands of symbols, hundreds of sections)
  is built in a single synchronous `provideDocumentSymbols` call. Acceptable
  today; if it stalls, consider a `DocumentSymbolProvider` with `workDoneToken`
  or lazy section expansion.
- Disk-cache invalidation for include files is mtime-based; if an included file
  changes externally while closed, navigation may be stale until it is reopened
  or the includer is edited.

## HSPICE vs Spectre scope
- Navigation supports **both** HSPICE and Spectre (`.scs`) as of 0.3.5 —
  subckt/model/param/section navigation, `.include` links, and section scope
  resolution work in either dialect, including mixed-dialect files switched via
  `simulator lang=`. See `docs/SYNTAX.md` for the dialect comparison.
- **Not indexed (by design):** `statistics` / `process` / `mismatch` Monte-Carlo
  blocks, `alter`, and testbench `analysis`/`save`/`print`/`plot` statements
  (matching the long-standing policy of not parsing `.measure`/`.data` semantics).
- **2-node Spectre model-reference instances** (e.g. a diode model on
  `dio ( a k ) ndio`) are dropped by the `minXInstanceNodes` filter (default 2)
  and so do not offer a jump from that line. Widen via `ParseOptions` if needed.

## Build / release
- `out/` is git-ignored and rebuilt by `vscode:prepublish`; ensure
  `npm run compile` succeeds before `vsce package`.
- `package-lock.json` is intentionally git-ignored because the extension has no
  runtime npm dependencies; revisit if reproducible dev dependency installs
  become important.
