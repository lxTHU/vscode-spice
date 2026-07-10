# SPICE support for VSCode

> SPICE syntax highlighting reference [leoheck/sublime-spice](https://github.com/leoheck/sublime-spice) TextMate rules.
> 
> Other useful rules reference see: [1995parham/vim-spice](https://github.com/1995parham/vim-spice)
> 
> Snippets reference: [bzisjo/vscode-spice-support](https://github.com/bzisjo/vscode-spice-support)

## GitHub repos
[lxTHU/vscode-spice](https://github.com/lxTHU/vscode-spice)

## See also
[Seeing SPICE in VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=xuanli.spice)

# Features

## Code Folding
支持以下块结构的代码折叠：
- `.subckt` / `.ends`
- `.lib` / `.endl`
- `.control` / `.endc`
- `.if` / `.endif`
- `.data` / `.enddata`
- `.statistics` / `.endstatistics`
- `.section` / `.endsection`
- Spectre: `subckt` / `ends`, `if` / `endif`, `statistics`, `process`, `section` / `endsection`

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
  - Scientific notation (e.g., `1.5e+09`, `2.3E-12`) - 指数部分使用不同颜色
  - Engineering notation (e.g., `1k`, `100n`, `2.2u`) - 单位使用不同颜色
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

## Supported File Extensions
`.ckt`, `.sp`, `.net`, `.cir`, `.scs`, `.mod`, `.mdl`, `.lib`, `.sub`, `.lis` (SPICE output listing)

## Roadmap
- [ ] Support DSPF netlist
- [ ] More snippet coverage

## Contributing
1. Fork it ( [https://github.com/lxTHU/vscode-spice](https://github.com/lxTHU/vscode-spice) )
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create a new Pull Request


## Change Log
[0.2.1]
- Fixed code folding for all block structures (.subckt/.ends, .lib/.endl, .control/.endc, .if/.endif, .data/.enddata)
- Fixed code folding for Spectre blocks (subckt/ends, control/endc, if/endif)
- Fixed code folding for .model blocks (using `)` as end marker)
- Used character classes for case-insensitive matching (JavaScript regex doesn't support (?i))
- Improved scientific notation highlighting (5e-6 shows base, exponent marker, and exponent value with different colors)
- Improved engineering notation highlighting (100n shows value and unit with different colors)

[0.2.0]
- Enhanced syntax highlighting with semantic scope names
- Added support for more SPICE commands
- Added device-specific highlighting
- Added number highlighting with engineering notation
- Added function highlighting
- Added operator and keyword highlighting
- Improved language configuration with smart indentation
- Added many new code snippets

[0.1.0]
- Add Basic Snippets Support. (ref [bzisjo's great work](https://github.com/bzisjo/vscode-spice-support))

[0.0.6]
- Fix **toggle comment bug**: you can use `Ctrl+/` to add `*` comment toggle.
