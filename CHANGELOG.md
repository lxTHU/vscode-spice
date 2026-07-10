# Change Log
All notable changes to the "spice" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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
