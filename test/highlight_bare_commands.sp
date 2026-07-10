* Test file: dot-command highlighting and continuation lines
*
* Covers cases that were fixed or verified during grammar work:
*  - case-insensitive keywords (inline (?i))
*  - .ends with no subcircuit name
*  - .data / .enddata block end now highlighted
*  - + continuation lines inside .lib / .subckt blocks

* === .ends with no name (subcircuit end) ===
.subckt inv in out
mn1 out in 0 0 nch w=1u l=1u
.ends

* === .LIB / .ENDL pairing, mixed case ===
.LIB stat
.param
+ a=1 b=2
+ c='x+y'
.ENDL stat

* === .DATA / .ENDDATA block (end keyword must highlight) ===
.DATA input_data
v1 v2
0 1
5 2
.ENDDATA

* === Case-insensitive keywords ===
.PARAM vdd=1.2
.Param temp=25
.OPTIONS post=2
.MODEL nmos nmos (

* === Negative: these keep [\s]+, the bare form is not a real pattern ===
.tran
.ac

.end
