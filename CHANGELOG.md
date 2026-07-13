# Change Log
All notable changes to the "spice" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.3.7] - 2026-07-12
### Fixed
- **Expression identifier boundaries are now consistent.** Go-to-Definition
  fallback no longer treats `-` as part of a parameter name, so operator-adjacent
  variables such as `a-noiseflagn` / `(-noiseflagn)` resolve to `noiseflagn`
  instead of `a-noiseflagn` or `-noiseflagn`.
- The provider fallback now uses the parser's shared identifier boundary helper
  rather than VS Code's broad word-under-cursor result. The language
  `wordPattern` also treats `-` as a boundary for double-click selection.

### Changed
- Release packaging guidance and `0.3.x` versioning notes are now consistent
  with the current HSPICE+Spectre extension line.

## [0.3.6] - 2026-07-11
### Fixed
- **Scientific-notation exponent no longer read as a variable.** Inside `.param`
  / model-card expressions, the `e`/`E` of values like `1.6e-08+dl` was scanned
  as a variable reference named `e`, polluting Find References. Identifiers are
  now required to not be glued to a digit or `.`.
- **User `.func` names no longer read as variables.** `.func name(...)` (HSPICE)
  / `define` (Spectre) function names are now collected and excluded from
  variable-reference extraction, so calling a user function no longer creates a
  spurious reference to a non-existent parameter. Function names defined after a
  `.param` are handled via a backfill pass.

## [0.3.5] - 2026-07-11
### Added
- **Spectre (`.scs`) netlist navigation.** Go-to-Definition, Hover, Find
  References, Outline, `include` links, and `section` scope resolution now also
  work on Spectre model libraries — previously navigation was HSPICE-only. Spectre
  `subckt` / `inline subckt` / `model` / `parameters` / `section` / `library` /
  `include` definitions are indexed; instances in the `name ( nodes ) target`
  form are navigated (subckt/model references jump; built-in primitive types such
  as `resistor` / `mosfet` are recognised as non-navigable). Tested on real PDK
  model libraries of varying structure; please report any construct that
  mis-parses.
- **Mixed-dialect files.** `simulator lang=spectre` / `simulator lang=spice`
  directives are tracked per logical line, so a file that switches dialect
  mid-stream is parsed in the right dialect for each statement in a single pass.
- **Spectre syntax in the parser:** `//` comments, `{ … }` block joining for
  `model` cards, parenthesised node/port lists, and numeric node names.
- **`docs/SYNTAX.md`** — a reference comparing the SPICE/HSPICE and Spectre
  dialect families, with a navigation-capability matrix.

### Changed
- Preprocessing now joins Spectre `{ … }` blocks in addition to HSPICE `+`
  continuations. Hover on a primitive-instance node shows the appropriate
  terminal name (e.g. `d`/`g`/`s`/`b` for `mosfet`).
- **Code folding now recognises Spectre block keywords and `{ … }` blocks.**
  `subckt` / `inline subckt` / `section` / `library` (and their `ends` /
  `endsection` / `endlibrary` closers) fold correctly, and Spectre `model { … }`
  / `statistics { … }` / `if () { … }` blocks fold via balanced `{ }` pairing
  (lines that open and close a brace on the same line, e.g. `} value if () {`,
  are skipped so the stack stays correct). This is in addition to the existing
  HSPICE markers. HSPICE folding (`.subckt` / `.lib` / `.control` / `.if` /
  `.data` / `.model`) is byte-for-byte unchanged from 0.3.3 (verified on large
  `.l` process libraries).

### Fixed
- A brace-block continuation path could make large Spectre files take
  disproportionately long to parse; depth is now tracked incrementally (with a
  safety cap against an unclosed `{`), so large files parse in ~1–2 s again.

## [0.3.3] - 2026-07-11
### Fixed
- **MOSFET/BJT/diode model names are now navigable.** The default indexed device
  types now include `M`/`Q`/`D`, so model references inside `.subckt` bodies —
  the common pattern of wrapping a primitive plus its parasitics into a
  user-callable device — support F12 / Hover / Find References.
- **`X`-instance node-count filter aligned with real usage.** `minXInstanceNodes`
  default stays at 2 (drop ≤2-node lines), covering the minimum MOSFET-subckt
  case of 3+ nodes. Both this and the device-type set remain overridable via
  `ParseOptions` for very large industrial netlists.

## [0.3.2] - 2026-07-11
### Fixed
- **Hover on `.lib 'file' section` file path** now resolves `$VAR` / `${VAR}`
  environment variables, matching `.INCLUDE` paths.
- Removed a redundant ternary in the section hover branch.

### Changed
- **`out/` build output is now git-ignored.** It is rebuilt by
  `npm run compile` / `vscode:prepublish` and ships only inside the VSIX.
- Tightened package metadata for the Marketplace: richer `description`, added
  `hspice` / `spectre` / `navigation` / `netlist` / `pdk` keywords, and the
  `Snippets` category.

### Added
- **`LICENSE` Third-Party Notice** attributing the derived-from HSPICE
  IntelliSense (MIT) engine, describing what was ported vs. added.
- **`docs/TODO.md`** tracking known limitations.
- README rewritten in English: a full **Netlist Navigation** section, English
  folding section, `.l` extension, and an up-to-date change-log summary.

## [0.3.1] - 2026-07-11
### Fixed
- **`.lib` dual-syntax (the root cause of PDK navigation failure).** HSPICE
  `.lib` has two meanings that 0.3.0 conflated, so on a large real-world process
  library every `.LIB section` definition was misread as a file include. Now
  distinguished by syntax: `.lib 'filepath' section` (first token is a quoted
  string → file reference) vs `.LIB section_name … .ENDL section_name` (→ section
  definition).

### Added
- **`.param` variable navigation.** `.param name=value` definitions are indexed.
  F12 on a variable — including one inside a quoted expression like
  `lmin = 'L0-(dL+dmis)'` — jumps to its `.param` definition; hover shows the
  value; Shift+F12 lists expression sites referencing it. Function calls
  (`max(`, `pwr(`, `agauss(`, `v(`, …) are excluded.
- **`.LIB section` navigation.** `.lib 'file' section` section names are
  F12-clickable to their `.LIB section … .ENDL` definition.
- **Multi-definition + section scope.** When the active section is determined by
  an upstream `.lib 'thisFile' section` reference, F12 jumps to the in-scope
  definition directly; when ambiguous, F12 returns all definitions and VS Code's
  Peek lets you choose. The **SPICE: Select Active .LIB Section** command pins a
  section manually; **Clear Manual Section Scope** resets it.
- **Hierarchical Outline.** The Outline panel nests `.model` / `.subckt` /
  `.param` under their containing `.LIB section`.
- **`.lib` file links.** `.lib 'file' section` paths are Ctrl+Clickable.

## [0.3.0] - 2026-07-10
### Added
- **Go to Definition (F12)**: X-instance name → `.SUBCKT` definition;
  device-model name → `.MODEL` definition; node → matching port. Works across
  `.INCLUDE`/`.INC`/`.LIB` file chains (disk-read, mtime-cached).
- **Hover (Ctrl+K Ctrl+I)**: subckt → port list; model → type; X-instance node →
  port name; device node → terminal name (drain/gate/source/…); env-var in an
  include path → resolved value.
- **Find All References (Shift+F12)**: all X-instances referencing a subckt, or
  all device instances referencing a model.
- **Outline panel (Ctrl+Shift+O)**: `.SUBCKT` and `.MODEL` symbols, click to jump.
- **Document Links**: `.INCLUDE`/`.INC`/`.LIB` paths are Ctrl+Clickable.
- **Diagnostics**: warnings for unknown subcircuits and port-count mismatches.
- TypeScript build chain (`src/` → `out/`); runtime runs entirely in the
  extension host (no language-server process).

### Changed
- Minimum VS Code version raised from `^1.15.0` to `^1.60.0` (1.15 was a mislabel;
  0.2.4 already used 1.60+ features).

### Notes
- Navigation logic is ported (and substantially extended) from
  [vladimir-aptekar/hspice-intellisense](https://marketplace.visualstudio.com/items?itemName=vladimir-aptekar.hspice-intellisense)
  (MIT). See `src/parser.ts` and `src/index.ts` headers for attribution.

## [0.2.4] - 2026-07-10
### Fixed
- **`.lib` reference vs definition folding.** HSPICE `.lib` has two meanings: a
  section *definition* (`.lib NAME` … `.endl NAME`, should fold) and a file
  *reference* (`.lib 'file.l' NAME`, an include that must NOT start a fold). The
  fold-start marker now excludes the reference form via a negative lookahead.
  Verified against a large real HSPICE process library.
- **`.model` fold-end false matches on `.param` continuation lines.** The 0.2.3
  fold-end branch `^\s*\+.*\)\s*$` also matched `.param` lines ending in a
  function call (e.g. `+pname=agauss(0,1,1)`). Tightened to require the `)` to be
  preceded by whitespace or a quote.
- `.param` is a single statement (not a block); its `+` continuation lines no
  longer start or end a fold.

### Added
- `.l` file extension association (standard HSPICE process-library suffix).

## [0.2.3] - 2026-07-10
### Added
- Added `.lis` file extension association (SPICE output listing) — closes #8
- Added `.dspf` file extension association (DSPF parasitic netlist).
- Added Spectre snippets (`snippets/snippets_spectre.json`)

### Changed
- **Case-insensitive keyword matching.** All dot commands and block keywords now
  highlight and fold regardless of case, matching HSPICE/SPICE3/NGSPICE/LTspice.
  Applied via an inline `(?i)` modifier on each keyword pattern. Spectre keywords
  are also matched case-insensitively for consistency.

### Fixed
- **`.model` block folding.** `.model` blocks ending in `)` on a `+` line now
  close correctly. Verified against a real multi-MB HSPICE PDK netlist.
- **`.enddata` highlighting.** Added a dedicated grammar rule (was rendered as
  plain text).
- `.ends` alone (subcircuit end with no name) now matches.

### Acknowledgements
- Code folding for unindented subcircuits/block structures is built-in via
  `language-configuration.json` `folding.markers`. Thanks to @Peniaze (#6) and
  @riduan (#9) for the proposals that informed the implementation.

## [0.2.1] - 2026-06-01
### Fixed
- Fixed code folding for all block structures (.subckt/.ends, .lib/.endl,
  .control/.endc, .if/.endif, .data/.enddata), Spectre blocks, and .model blocks.
- Used character classes for case-insensitive matching (JavaScript regex doesn't
  support (?i)).
- Improved scientific and engineering notation highlighting (distinct colors for
  base/exponent and value/unit).

## [0.2.0] - 2026-06-01
### Added
- Enhanced syntax highlighting with semantic scope names; device-specific
  highlighting for passives (R/C/L/K), actives (D/Q/J/M/Z), sources
  (V/I/B/E/F/G/H), and subckt instances (X).
- Number highlighting with engineering notation; math and source-function
  highlighting; operator and keyword highlighting.
- New simulation command highlighting (.noise/.tf/.disto/.four/.model/.global/
  .options/.temp/.step/.func/.data/.nodeset/.ic/.connect/.alter/.statistics).
- New measurement, analysis, circuit-element, source-function, and template
  snippets.

### Changed
- Updated scopeName from `source.sp` to `source.spice`; more semantic scope
  names; smart indentation rules; comprehensive README.

### Fixed
- Improved comment toggling support.

## [0.1.0] - 2024-07-14
### Added
- Basic snippets support (ref [bzisjo's great work](https://github.com/bzisjo/vscode-spice-support))
- AC/DC/transient analysis snippets (basic, sweep, data-driven).
- Measurement snippets (rise/fall/delay, when).

## [0.0.6] - 2024-07-14
### Fixed
- Fix toggle comment bug: you can use `Ctrl+/` to add `*` comment toggle.
