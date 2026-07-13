# SPICE support for VSCode

> SPICE syntax highlighting reference [leoheck/sublime-spice](https://github.com/leoheck/sublime-spice) TextMate rules.
> 
> Other useful rules reference see: [1995parham/vim-spice](https://github.com/1995parham/vim-spice)
> 
> Snippets reference: [bzisjo/vscode-spice-support](https://github.com/bzisjo/vscode-spice-support)

> Maintained by Xuan Li, Wiener Technology, Beijing.

## GitHub repos
[lxTHU/vscode-spice](https://github.com/lxTHU/vscode-spice)

## See also
[Seeing SPICE in VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=xuanli.spice)

## Docs
- [CHANGELOG.md](CHANGELOG.md) — release history
- [docs/SYNTAX.md](docs/SYNTAX.md) — SPICE/HSPICE vs Spectre dialect comparison & navigation matrix
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — navigation engine design (`.lib` dual syntax, `.param`/section scope, Spectre support)
- [docs/RELEASE.md](docs/RELEASE.md) — build, package, and publish guide
- [docs/TODO.md](docs/TODO.md) — known limitations and backlog

# Features

## Code Folding
Folding is supported for the following block structures:
- `.subckt` / `.ends`
- `.lib` / `.endl` — only the section **definition** form `.lib NAME` … `.endl NAME` starts a fold; the file **reference** form `.lib 'file' NAME` does **not** start a fold block.
- `.control` / `.endc`
- `.if` / `.endif`
- `.data` / `.enddata`
- `.model` blocks (parameter list opened by `(` and closed by `)`)
- `.statistics` / `.endstatistics`
- `.section` / `.endsection`
- Spectre: `subckt` / `ends`, `if` / `endif`, `statistics`, `process`, `section` / `endsection`

`.param` / `.options` are single statements (parameters may use `+` continuation) and are **not** treated as fold blocks.

### Folding Shortcuts
These are all VS Code **default** shortcuts (no configuration needed) and work well for process-library files that contain many `.lib` / `.model` blocks:

| Action | Windows / Linux | macOS | Notes |
|---|---|---|---|
| Fold innermost block at cursor | `Ctrl+Shift+[` | `⌥⌘[` | Press repeatedly to fold outward layer by layer (`.model` first, then the enclosing `.lib`, …) |
| Unfold block at cursor | `Ctrl+Shift+]` | `⌥⌘]` | Press repeatedly to unfold inward |
| Recursively fold block + children | `Ctrl+K Ctrl+[` | `⌘K ⌘[` | Folds the current block and everything nested inside |
| Recursively unfold | `Ctrl+K Ctrl+]` | `⌘K ⌘]` | |
| Toggle fold at cursor | `Ctrl+K Ctrl+L` | `⌘K ⌘L` | |
| **Fold by level** | `Ctrl+K Ctrl+1`…`7` | `⌘K ⌘1`…`7` | `1` = only outermost (e.g. all `.lib`), `2` = also `.model`, … |
| Fold all | `Ctrl+K Ctrl+0` | `⌘K ⌘0` | |
| Unfold all | `Ctrl+K Ctrl+J` | `⌘K ⌘J` | |

**Recommended workflow for browsing a process library**: press `Ctrl+K Ctrl+1` to collapse every top-level `.lib` section to a single line so you can survey all corners at a glance; expand the corner you need, then use `Ctrl+Shift+[` to drill down layer by layer.

> To view or customize all folding shortcuts: open the Command Palette (`Ctrl+Shift+P`) and type `fold`.

## Syntax Highlighting

### SPICE Standard
- **Comments**: `*`, `//`, `;`, `$`
- **Hierarchical Blocks**: `.subckt/.ends`, `.lib/.endl`, `.control/.endc`, `.if/.endif`
- **Simulation Commands**: `.ac`, `.dc`, `.tran`, `.op`, `.noise`, `.tf`, `.disto`, `.four`
- **Configuration Commands**: `.include`, `.model`, `.param`, `.global`, `.options`, `.temp`, `.step`, `.func`
- **Measurement Commands**: `.meas/.measure`
- **Output Commands**: `.save`, `.print`, `.plot`, `.probe`
- **Circuit Elements**:
  - Passive: `R` (Resistor), `C` (Capacitor), `L` (Inductor), `K` (Coupling)
  - Active: `D` (Diode), `Q` (BJT), `J` (JFET), `M` (MOSFET), `Z` (MESFET)
  - Sources: `V` (Voltage), `I` (Current), `B` (Behavioral), `E` (VCVS), `F` (CCCS), `G` (VCCS), `H` (CCVS)
  - Other: `T` (Transmission Line), `S/W` (Switch), `X` (Subcircuit Instance)
- **Functions**: Math functions (`abs`, `sin`, `cos`, `log`, etc.) and source functions (`pulse`, `pwl`, `sin`, `exp`)
- **Numbers**: 
  - Scientific notation (e.g., `1.5e+09`, `2.3E-12`) — the exponent is colored distinctly
  - Engineering notation (e.g., `1k`, `100n`, `2.2u`) — the scale suffix is colored distinctly
- **Operators**: Comparison and logical operators
- **Keywords**: Sweep parameters (`SWEEP`, `START`, `STOP`, `STEP`), analysis types (`dec`, `oct`, `lin`)

### Spectre (Cadence)
- **Keywords**: `parameters`, `simulator`, `analysis`, `design`, `model`, `instance`, `global`, `include`, `info`, `save`, `plot`, `print`, `assert`, `alter`, `statistics`, `process`, `section`, `connect`, `options`, `temp`, `lib`, `if/else/endif`, `end`
- **Analysis Types**: `ac`, `dc`, `tran`, `noise`, `stb`, `pss`, `pac`, `pnoise`, `xf`, `dcmatch`, `acmatch`, `sens`
- **Devices**: `resistor`, `capacitor`, `inductor`, `diode`, `bipolar`, `mosfet`, `jfet`, `vsource`, `isource`, `vcvs`, `vccs`, `ccvs`, `cccs`, `tline`, `switch`
- **Blocks**: `subckt/ends`, `if/endif`, `statistics`, `process`, `section/endsection`

## Code Snippets

### SPICE Structure
- `.sub` - Subcircuit definition
- `.lib` - Library declaration
- `.con` - Control block
- `.if` / `.ifelse` / `.elseif` - Conditional statements
- `.inc` - Include file
- `.mod` - Model definition
- `.glob` - Global node
- `.opt` - Options
- `.temp` - Temperature
- `.func` - Function definition
- `.data` - Data block
- `.end` - End of netlist

### SPICE Analysis Commands
- `.ac` - AC analysis (basic, sweep, data-driven)
- `.dc` - DC analysis (basic, sweep, data-driven)
- `.tran` - Transient analysis (basic, with start, sweep, data-driven)
- `.op` - Operating point
- `.noise` - Noise analysis
- `.tf` - Transfer function
- `.four` - Fourier analysis
- `.disto` - Distortion analysis
- `.step` - Parameter sweep
- `.node` - Nodeset

### SPICE Measurement Commands
- `.meas` - Measure rise/fall/delay
- `.measwhen` - Measure when condition
- `.measfind` - Measure find at value
- `.measavg` - Measure average
- `.measrms` - Measure RMS
- `.measpp` - Measure peak-to-peak
- `.measmin` - Measure minimum
- `.measmax` - Measure maximum

### SPICE Output Commands
- `.save` - Save signal
- `.print` - Print output
- `.plot` - Plot output
- `.probe` - Probe output

### SPICE Circuit Elements
- `R` - Resistor
- `C` - Capacitor
- `L` - Inductor
- `D` - Diode
- `Q` - BJT Transistor
- `M` - MOSFET
- `J` - JFET
- `X` - Subcircuit instance
- `Vdc` / `Vac` - Voltage source (DC/AC)
- `Idc` - Current source DC
- `Vpulse` / `Vsin` - Pulse/Sinusoidal voltage source
- `T` - Transmission line
- `S` - Switch
- `E` / `F` / `G` / `H` - Controlled sources

### SPICE Source Functions
- `pulse` - Pulse waveform
- `sin` - Sinusoidal waveform
- `exp` - Exponential waveform
- `pwl` - Piece-wise linear
- `sffm` - Single FM
- `am` - AM modulated

### SPICE Templates
- `tranfull` - Complete transient analysis template
- `acfull` - Complete AC analysis template
- `dcfull` - Complete DC analysis template

### Spectre Commands
- `subckt` - Subcircuit definition
- `parameters` - Parameter definition
- `simulator` - Simulator language
- `include` - Include file
- `global` - Global node
- `save` - Save signal
- `options` - Simulation options
- `info` - Information
- `design` - Design specification
- `model` - Model definition
- `assert` - Assertion
- `statistics` - Statistics block
- `process` - Process block
- `section` / `endsection` - Section block
- `if` / `ifelse` / `endif` - Conditional statements
- `end` - End of netlist

### Spectre Analysis
- `ac` - AC analysis
- `dc` - DC analysis
- `tran` - Transient analysis
- `noise` - Noise analysis
- `stb` - Stability analysis
- `pss` - Periodic steady state
- `pac` - Periodic AC
- `pnoise` - Periodic noise

### Spectre Devices
- `resistor` - Resistor
- `capacitor` - Capacitor
- `inductor` - Inductor
- `diode` - Diode
- `mosfet` - MOSFET
- `bipolar` - BJT
- `jfet` - JFET
- `vsource` - Voltage source
- `isource` - Current source
- `vcvs` / `vccs` / `ccvs` / `cccs` - Controlled sources
- `tline` - Transmission line
- `switch` - Switch

## Language Features
- **Comment Toggle**: Use `Ctrl+/` to toggle comments
- **Bracket Matching**: Automatic bracket matching for `.subckt/.ends`, `.lib/.endl`, etc.
- **Auto Closing**: Automatic closing of brackets, parentheses, and quotes
- **Indentation**: Smart indentation for hierarchical blocks
- **Code Folding**: Fold/unfold block structures

## Netlist Navigation
IDE-style navigation across HSPICE and Spectre netlists, including process libraries (PDKs) linked via `.INCLUDE` / `.INC` / `.LIB` (HSPICE) or `include` / `section` (Spectre). The navigation engine runs entirely in-process — no language-server dependency. See [docs/SYNTAX.md](docs/SYNTAX.md) for what each dialect supports.

> Navigation works in both dialects in any `.sp` / `.scs` / `.lib` file. The examples below use HSPICE dot-command syntax; the Spectre equivalents (bare `subckt`/`model`/`parameters`/`include`/`section`) work the same way.

### Go to Definition (`F12`)
- From an `X` instance name → its `.SUBCKT` definition.
- From a `M` / `Q` / `D` device model name → its `.MODEL` definition.
- From a node on an `X` instance → the matching port in the `.SUBCKT` header.
- From a **variable reference inside an expression** (e.g. `dL` in `lmin = 'L0-(dL+dmis)'`) → its `.param` definition.
- From a section name in `.lib 'file' section` → the corresponding `.LIB section … .ENDL` definition.
- Works **across files** via `.INCLUDE` / `.INC` / `.LIB` chains — included files do not need to be open.

When the same name is defined in multiple places (e.g. a model/param defined in several `.LIB section` corners), VS Code's native Peek picker lists all definitions to choose from.

### Hover (`Ctrl+K Ctrl+I`)
- Over a subcircuit name → its **port list**.
- Over a model name → its **type** (e.g. `nmos`, `pnp`).
- Over a node on an `X` instance → the matching **port name**; over a node on a device → the **terminal name** (`drain` / `gate` / `source` / …).
- Over a `.param` variable → its **value(s)** (all definitions when multiple corners exist).
- Over an environment variable (`$VAR` / `${VAR}`) inside an `.INCLUDE` path → its resolved value.

### Find All References (`Shift+F12`)
- All `X` instances referencing a subcircuit, or all device instances referencing a model.
- All expression sites referencing a `.param` variable (inside other params and model cards).

### Outline
The Outline panel lists every `.SUBCKT`, `.MODEL`, and `.param`, **nested under their containing `.LIB section`**, with click-to-navigate.

### `.INCLUDE` / `.LIB` file links
File paths in `.INCLUDE` / `.INC` and `.lib 'file' section` statements are `Ctrl+Click` links that open the target file; environment variables in paths are resolved.

### `.LIB section` scope (corner selection)
HSPICE `.lib 'file' section` selects which definitions inside `file` are active. The extension resolves the active scope automatically when possible, and lets you pin it manually otherwise:

- **Automatic (determined scope)** — if the current file is included by an upstream netlist via `.lib 'thisFile' section`, that section is used; F12 jumps straight to the in-scope definition with no ambiguity.
- **Manual (ambiguous scope)** — when a file is opened directly (e.g. a shared PDK that many top-level netlists could include), run **`SPICE: Select Active .LIB Section`** from the Command Palette or editor context menu to pin a section for the session; **`SPICE: Clear Manual Section Scope`** resets it. When no scope is pinned and the scope is ambiguous, F12 returns all definitions so you can pick.

> Scope resolution is structural (which `.LIB section` a definition lives in), **not** a full HSPICE corner-value evaluation — it does not compute the numerically effective parameter values of a simulator run.

### Diagnostics
Warnings (yellow squiggle) for:
- **Unknown subcircuit** — an `X` instance references a name not found in the file or its include graph.
- **Port-count mismatch** — an `X` instance provides a different number of nodes than its `.SUBCKT` declares ports.

### Design notes & limitations
- Case-insensitive symbol lookup (HSPICE semantics); original case is preserved for display.
- HSPICE `+` line continuation and `$` / `;` inline comments are handled during parsing.
- `.param` variable references inside expressions are extracted by scanning identifiers and excluding function calls (`name(`), user `.func` names, scientific-notation exponent markers, and HSPICE built-in functions (`max`, `pwr`, `agauss`, `v`, `i`, …). This covers `.param` values, model-card `key='expr'` values, and X/device/Spectre instance parameter expressions. It is best-effort and may produce false positives/negatives; it affects only reference completeness, never jump correctness.
- Nested `.SUBCKT` definitions are not supported (not valid HSPICE syntax).
- The navigation engine is derived from [HSPICE IntelliSense](https://marketplace.visualstudio.com/items?itemName=vladimir-aptekar.hspice-intellisense) (MIT) and substantially extended; see `LICENSE` (Third-Party Notice) and `src/` file headers.

## Supported File Extensions
`.ckt`, `.sp`, `.net`, `.cir`, `.scs`, `.mod`, `.mdl`, `.lib`, `.sub`, `.l` (HSPICE process library), `.lis` (SPICE output listing), `.dspf` (DSPF parasitic netlist)

## Roadmap
- [ ] Refine DSPF parasitic R/C grouping highlight
- [ ] More snippet coverage
- [x] `.param` variable references from inside X-instance / device / Spectre instance parameter expressions
- [x] Spectre (`.scs`) navigation — added in 0.3.5 (Go-to-Definition / Hover / References / Outline / `include` links / `section` scope)

## Contributing
1. Fork it ( [https://github.com/lxTHU/vscode-spice](https://github.com/lxTHU/vscode-spice) )
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create a new Pull Request


## Change Log
See [CHANGELOG.md](CHANGELOG.md) for the full history. Recent highlights:

- **[0.3.8]** Add exact `.param` references inside model-card and instance/device parameter expressions.
- **[0.3.7]** Fix expression identifier boundaries so F12 fallback resolves operator-adjacent params like `a-noiseflagn` / `(-noiseflagn)` to `noiseflagn`.
- **[0.3.6]** Fix expression reference extraction for scientific notation and user `.func` names.
- **[0.3.5]** Spectre (`.scs`) navigation: Go-to-Definition / Hover / References / Outline / `include` links / `section` scope now work on Spectre model libraries too, including mixed-dialect files. New [docs/SYNTAX.md](docs/SYNTAX.md) compares the two dialect families.
- **[0.3.1]** Fix `.lib` dual-syntax (definition vs file reference) — the root cause of navigation failure on large PDK files. Add `.param` variable navigation, `.LIB section` navigation, section-scope resolution (auto + manual), and hierarchical Outline.
- **[0.3.0]** Add IDE-style netlist navigation: Go to Definition, Hover, Find References, Outline, Diagnostics, and `.INCLUDE` file links. Runs in-process (no language server).
- **[0.2.4]** Fix `.lib` / `.model` folding semantics; add `.l` extension.
- **[0.2.3]** Fix `.model` folding; add `.enddata` highlight, `.lis` / `.dspf` extensions, Spectre snippets.
- **[0.2.1]** Fix code folding for all block structures; improve scientific/engineering notation highlighting.
- **[0.1.0]** Add basic snippets support (ref [bzisjo's great work](https://github.com/bzisjo/vscode-spice-support)).
- **[0.0.6]** Fix toggle-comment bug (`Ctrl+/` adds `*` comment toggle).

## License
MIT — Copyright (c) 2022-2026 Xuan Li, Wiener Technology, Beijing. See [LICENSE](LICENSE).
