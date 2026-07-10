# Change Log
All notable changes to the "spice" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.2.2] - 2026-07-09
### Added
- Added `.lis` file extension association (SPICE output listing) — closes #8
- Added Spectre snippets (`snippets/snippets_spectre.json`)
- Added DSPF netlist support to the roadmap

### Changed
- Version 0.2.2 (minor feature release)

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
