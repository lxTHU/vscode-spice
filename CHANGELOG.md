# Change Log
All notable changes to the "spice" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.3.3] - 2026-07-11
### Fixed
- **MOSFET/BJT/diode model names are now navigable.** The default indexed device types now include `M`/`Q`/`D`, so model references inside `.subckt` bodies — the common pattern of wrapping a primitive plus its parasitics into a user-callable device — support F12 / Hover / Find References. Previously only `V`/`I`/`E`/`G`/`F`/`H` were indexed, so a `M1 ... nmos` inside a subckt could not be navigated.
- **`X`-instance node-count filter aligned with real usage.** The `minXInstanceNodes` default stays at 2 (drop ≤2-node lines), which already covers the minimum MOSFET-subckt case of 3+ nodes (source/drain/gate, optionally bulk). Documented the rationale. Both this and the device-type set remain overridable via `ParseOptions` for very large industrial netlists where memory matters.

## [0.3.2] - 2026-07-11
### Fixed
- **Hover on `.lib 'file' section` file path** now resolves `$VAR` / `${VAR}` environment variables, matching the behavior already available on `.INCLUDE` paths (previously returned no hover).
- Removed a redundant ternary in the section hover branch.

### Changed
- **`out/` build output is now git-ignored.** It is rebuilt by `npm run compile` / `vscode:prepublish` and ships only inside the VSIX; the repo tracks source, not compiled artifacts.
- Tightened package metadata for the Marketplace: richer `description`, added `hspice` / `spectre` / `navigation` / `netlist` / `pdk` keywords, and the `Snippets` category.

### Added
- **`LICENSE` Third-Party Notice** attributing the derived-from HSPICE IntelliSense (MIT) engine, with a precise description of what was ported vs. added.
- **`docs/TODO.md`** tracking known limitations and lower-priority improvements (expression-variable edge cases, Spectre navigation scope, large-PDK outline performance, etc.).
- README rewritten in English: a full **Netlist Navigation** section (Go-to-Definition, Hover, References, Outline, `.INCLUDE`/`.LIB` links, `.LIB section` scope, Diagnostics, limitations), English folding section, `.l` extension, and an up-to-date change-log summary.

## [0.3.1] - 2026-07-11
### Fixed
- **`.lib` dual-syntax (the root cause of PDK navigation failure).** HSPICE `.lib` has two meanings that 0.3.0 conflated, so on a large real-world process library every `.LIB section` definition was misread as a file include and no `.model`/`.param` inside library sections was usable. Now distinguished by syntax: `.lib 'filepath' section` (first token is a quoted string → file reference) vs `.LIB section_name … .ENDL section_name` (→ section definition).

### Added
- **`.param` variable navigation.** `.param name=value` definitions are now indexed. F12 on a variable name — including one inside a single-quoted expression like `lmin = 'L0-(dL+dmis)'` — jumps to its `.param` definition; hover shows the value; Shift+F12 lists all expression sites that reference it. Function calls (`max(`, `pwr(`, `agauss(`, `v(`, …) are excluded via a builtin-function list + "identifier followed by `(`" rule.
- **`.LIB section` navigation.** `.lib 'file' section` section names are F12-clickable to their `.LIB section … .ENDL` definition (same or included file).
- **Multi-definition + section scope.** The same model/param can be defined in several `.LIB section` blocks (corner selection). When the active section is determined by an upstream `.lib 'thisFile' section` reference (scenario A), F12 jumps to the in-scope definition directly. When ambiguous (scenario B — analyzing a generic PDK directly), F12 returns all definitions and VS Code's native Peek lets you choose; the new **SPICE: Select Active .LIB Section** command (`spice.selectScope`) pins a section manually for the session, **Clear Manual Section Scope** resets it.
- **Hierarchical Outline.** The Outline panel now nests `.model` / `.subckt` / `.param` under their containing `.LIB section` (SymbolKind.Namespace), instead of a flat list.
- **`.lib` file links.** `.lib 'file' section` paths are now Ctrl+Clickable (previously only `.include`/`.inc` were).

### Notes
- These capabilities are **beyond** what `vladimir-aptekar/hspice-intellisense` provides — its FileModel has no `.param`/section concept and it has the same `.lib` dual-syntax bug. See `docs/prompts-nav-enhance-round2.md` for the diagnosis and `src/parser.ts` / `src/index.ts` for attribution.
- Full process-library parse time stays well under a second even for very large files; scope resolution is in-memory.

## [0.3.0] - 2026-07-10
### Added
- **Outline panel**: `.SUBCKT` and `.MODEL` symbols appear in the sidebar Outline, click to jump.
- **Go to Definition (F12)**: jump from X-instance or device-model name to its `.SUBCKT`/`.MODEL` definition; works across `.INCLUDE`/`.INC`/`.LIB` file chains (disk-read, mtime-cached).
- **Hover**: hover over a subcircuit name to see its port list; hover over a node in an X-instance to see which port it maps to; hover over a model name to see its type; hover over a device node to see terminal name.
- **Find References (Shift+F12)**: list all X-instances (or device instances) referencing a subcircuit/model.
- **Document Links**: `.INCLUDE`/`.INC`/`.LIB` paths become Ctrl+Clickable links that open the target file.
- **Diagnostics**: warnings for unknown subcircuits (yellow squiggles) and port-count mismatches on X-instances.
- Added TypeScript build chain (`src/` → `out/`); runtime code runs entirely in the extension host (no language-server process).

### Changed
- Minimum VS Code version raised from `^1.15.0` to `^1.60.0` (1.15 was a mislabel; 0.2.4 already used 1.60+ features such as `colorizedBracketPairs`).

### Notes
- Navigation logic is ported (simplified, HSPICE-only) from [vladimir-aptekar/hspice-intellisense](https://marketplace.visualstudio.com/items?itemName=vladimir-aptekar.hspice-intellisense) (MIT). Spectre branches and case-sensitivity toggles removed. See `src/parser.ts` and `src/index.ts` headers for attribution.

## [0.3.0] - 2026-07-10
### Added
- **Outline panel** (`Ctrl+Shift+O`): `.SUBCKT` and `.MODEL` symbols listed in sidebar, click to jump.
- **Go to Definition** (`F12`): X-instance name → `.SUBCKT` definition; device model name → `.MODEL` definition. Node-level jump: hover/click a node in an X-instance to jump to the matching port in the subcircuit definition. Works across `.INCLUDE`/`.INC`/`.LIB` file chains (disk-cached).
- **Hover** (`Ctrl+K Ctrl+I`): subcircuit → port list; model → model type; X-instance node → port name; device node → terminal name (drain/gate/source/etc.); env-var in include path → resolved value.
- **Find All References** (`Shift+F12`): lists all X-instances referencing a subcircuit, or all device instances referencing a model.
- **Document Links**: `.INCLUDE`/`.INC`/`.LIB` file paths become clickable links (`Ctrl+Click` to open).
- **Diagnostics**: unknown subcircuit names and port-count mismatches in X-instances are flagged as warnings (yellow squiggles). Port-to-device mapping (`M`/`Q`/`D` devices with model references, `V`/`I`/`E`/`G`/`F`/`H` sources).
- Added TypeScript build chain (`src/` → `out/`); runtime code runs entirely in the extension host (no language-server process).

### Changed
- Minimum VS Code version raised from `^1.15.0` to `^1.60.0` (1.15 was a mislabel; 0.2.4 already used 1.60+ features such as `colorizedBracketPairs`).

### Notes
- Navigation logic is ported (simplified, HSPICE-only) from [vladimir-aptekar/hspice-intellisense](https://marketplace.visualstudio.com/items?itemName=vladimir-aptekar.hspice-intellisense) (MIT). Spectre support and case-sensitivity toggle removed. See `src/parser.ts` and `src/index.ts` headers for attribution.

## [0.3.0] - 2026-07-10
### Added
- **Outline panel** (`Ctrl+Shift+O`): `.SUBCKT` and `.MODEL` symbols listed in sidebar, click to jump.
- **Go to Definition** (`F12`): X-instance → subcircuit definition; M/Q/D device → `.MODEL`; node → port in subcircuit definition. Works across `.INCLUDE`/`.INC`/`.LIB` file chains (disk-cached).
- **Hover** (`Ctrl+K Ctrl+I`): subcircuit → port list; model → type; X-instance node → port name; M-device node → terminal name (drain/gate/source/bulk); env-var → resolved value.
- **Find All References** (`Shift+F12`): all X-instances referencing a subcircuit, or all device instances referencing a model.
- **Document Links**: `.INCLUDE`/`.INC`/`.LIB` paths are clickable (Ctrl+Click to open).
- **Diagnostics**: unknown subcircuit / port-count mismatch warnings on X-instances.
- Added TypeScript build chain (`src/` → `out/`); runtime code runs entirely in extension host (no language-server process).

### Changed
- Minimum VS Code version raised from `^1.15.0` to `^1.60.0` (1.15 was a mislabel; 0.2.4 already used 1.60+ features such as `colorizedBracketPairs`).

### Notes
- Navigation logic ported (simplified, HSPICE-only) from [vladimir-aptekar/hspice-intellisense](https://marketplace.visualstudio.com/items?itemName=vladimir-aptekar.hspice-intellisense) (MIT). Spectre branches and case-sensitivity toggle removed. See `src/parser.ts` and `src/index.ts` headers for attribution.

## [0.2.4] - 2026-07-10
### Fixed
- **`.lib` reference vs definition folding.** HSPICE `.lib` has two meanings: a section *definition* (`.lib NAME` … `.endl NAME`, should fold) and a file *reference* (`.lib 'file.l' NAME`, an include that must NOT start a fold). The fold-start marker treated every `.lib` as a block start, so reference lines were pushed onto the fold stack and mis-paired. The fold-start (and indent-increase) marker now excludes the reference form via a negative lookahead `[Ll][Ii][Bb](?!\s*['"])`. Verified against a large real HSPICE process library: reference lines no longer fold, definition lines still pair with `.endl` (zero false positives / negatives), and the full-netlist fold stack returns to zero with no mis-paired blocks across `.lib`/`.subckt`/`.control`/`.if`/`.data`/`.model`.
- **`.model` fold-end false matches on `.param` continuation lines.** The 0.2.3 fold-end branch `^\s*\+.*\)\s*$` (added to close `.model` blocks ending in `)` on a `+` line) also matched `.param` continuation lines that end with a function call, e.g. `+pname=agauss(0,1,1)`. This prematurely closed enclosing `.lib`/`.subckt` blocks. Tightened to `^\s*\+.*[\s'"]\)\s*$` — the `)` must be preceded by whitespace or a quote. This distinguishes the two `)` roles by HSPICE *syntax*, not by formatting habit: a `.model` block close is a top-level parenthesis that follows whitespace (parameter separator) or a closing quote (a string parameter), whereas a `.param` function-call `)` follows a function argument (digit/letter/underscore). All `.model` blocks still close; the `.param` false matches are gone. (Uses only basic regex constructs, no lookbehind.)
- `.param` is a single statement (not a block); its `+` continuation lines — including those ending in a function call — no longer start or end a fold.

### Added
- `.l` file extension association. `.l` is the standard HSPICE process-library suffix (the Spectre equivalent is `.scs`, already supported), so HSPICE `.l` netlists now open with SPICE highlighting by default.

## [0.2.3] - 2026-07-10
### Added
- Added `.lis` file extension association (SPICE output listing) — closes #8
- Added `.dspf` file extension association (DSPF parasitic netlist). DSPF uses HSPICE-style syntax, so it is covered by the existing SPICE grammar.
- Added Spectre snippets (`snippets/snippets_spectre.json`)

### Changed
- **Case-insensitive keyword matching.** All dot commands and block keywords (`.SUBCKT`, `.LIB`, `.TRAN`, `.MODEL`, `.control`, `.if`, …) now highlight and fold regardless of case, matching the behavior of HSPICE/SPICE3/NGSPICE/LTspice. Applied via an inline `(?i)` modifier on every keyword pattern (the grammar runs under oniguruma, where `(?i)` is honored — not a file-level `flags=i`). Spectre keywords are also matched case-insensitively for consistency.

### Fixed
- **`.model` block folding.** HSPICE `.model` blocks end with `)` on a `+` continuation line (e.g. `+tnoib='tnoibx' )`), but the fold-end marker only matched `)` at the start of a line, so `.model` blocks never closed and could mis-pair with later `.ends`/`.endl`. The fold-end marker now also matches a `+`-continuation line ending in `)`. Verified against a real multi-MB HSPICE PDK netlist; non-`.model` block nesting (`.lib`/`.subckt`/`.if`/`.data`/`.control`, including 3-level nesting and mixed case) is unchanged.
- **`.enddata` highlighting.** `.data`/`.enddata` was already a configured folding pair (`language-configuration.json`), but `.enddata` had no grammar rule and rendered as plain text. Added a dedicated `keyword.control.enddata.spice` rule.
- `.ends` alone (subcircuit end with no name) now matches; the `.subckt`/`.ends` pattern no longer forces a trailing name.
- Version 0.2.3 (minor feature release)

### Acknowledgements
- Code folding for unindented subcircuits/block structures is now built-in via `language-configuration.json` `folding.markers`. Thanks to @Peniaze (#6) and @riduan (#9) for the folding-marker proposals that informed the implementation.

## [0.2.1] - 2026-06-01
### Fixed
- Fixed code folding for all block structures (.subckt/.ends, .lib/.endl, .control/.endc, .if/.endif, .data/.enddata)
- Fixed code folding for Spectre blocks (subckt/ends, control/endc, if/endif)
- Fixed code folding for .model blocks (using `)` as end marker)
- Used character classes for case-insensitive matching (JavaScript regex doesn't support (?i))
- Improved scientific notation highlighting (5e-6 shows base, exponent marker, and exponent value with different colors)
- Improved engineering notation highlighting (100n shows value and unit with different colors)

### Changed
- Version 0.2.1 (minor bugfix release)

## [0.2.0] - 2026-06-01
### Added
- Enhanced syntax highlighting with semantic scope names
- Device-specific highlighting for passive components (R, C, L, K)
- Device-specific highlighting for active devices (D, Q, J, M, Z)
- Device-specific highlighting for sources (V, I, B, E, F, G, H)
- Subcircuit instance highlighting (X)
- Number highlighting with engineering notation (e.g., 1k, 100n, 1.5G)
- Math function highlighting (abs, sin, cos, log, etc.)
- Source function highlighting (pulse, pwl, sin, exp, sffm, am)
- Operator and keyword highlighting
- New simulation command highlighting:
  - `.noise` - Noise analysis
  - `.tf` - Transfer function
  - `.disto` - Distortion analysis
  - `.four` - Fourier analysis
  - `.model` - Model definition
  - `.global` - Global node
  - `.options` - Simulation options
  - `.temp` - Temperature
  - `.step` - Parameter sweep
  - `.func` - Function definition
  - `.data` - Data block
  - `.nodeset` - Nodeset
  - `.ic` - Initial condition
  - `.connect` - Connect nodes
  - `.alter` - Alter block
  - `.statistics` - Statistics block
- New measurement snippets:
  - `.measwhen` - Measure when condition
  - `.measfind` - Measure find at value
  - `.measavg` - Measure average
  - `.measrms` - Measure RMS
  - `.measpp` - Measure peak-to-peak
  - `.measmin` - Measure minimum
  - `.measmax` - Measure maximum
- New analysis snippets:
  - `.noise` - Noise analysis
  - `.tf` - Transfer function
  - `.four` - Fourier analysis
  - `.disto` - Distortion analysis
  - `.step` - Parameter sweep
  - `.steplist` - Step with list
- New circuit element snippets:
  - `R` - Resistor
  - `C` - Capacitor
  - `L` - Inductor
  - `D` - Diode
  - `Q` - BJT
  - `M` - MOSFET
  - `J` - JFET
  - `X` - Subcircuit instance
  - `Vdc`/`Vac` - Voltage source
  - `Idc` - Current source
  - `Vpulse`/`Vsin` - Pulse/Sinusoidal source
  - `T` - Transmission line
  - `S` - Switch
  - `E`/`F`/`G`/`H` - Controlled sources
- New source function snippets:
  - `sffm` - Single FM
  - `am` - AM modulated
  - `dc` - DC value
  - `ac` - AC value
- New template snippets:
  - `tranfull` - Complete transient analysis template
  - `acfull` - Complete AC analysis template
  - `dcfull` - Complete DC analysis template

### Changed
- Updated scopeName from `source.sp` to `source.spice`
- Improved scope names to be more semantic (e.g., `comment.line.asterisk.spice`)
- Improved language configuration with smart indentation rules
- Updated README with comprehensive documentation

### Fixed
- Improved comment toggling support

## [0.1.0] - 2024-07-14
### Added
- Basic snippets support (ref [bzisjo's great work](https://github.com/bzisjo/vscode-spice-support))
- AC analysis snippets (basic, sweep, data-driven)
- DC analysis snippets (basic, sweep, data-driven)
- Transient analysis snippets (basic, sweep, data-driven)
- Measurement snippets (rise/fall/delay, when)

## [0.0.6] - 2024-07-14
### Fixed
- Fix toggle comment bug: you can use `Ctrl+/` to add `*` comment toggle.
