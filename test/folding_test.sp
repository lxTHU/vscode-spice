* Test file for code folding and syntax highlighting

* Test .LIB/.ENDL folding
.LIB MOS_CAP
.subckt nmoscap ng nds lr=5e-6 wr=5e-6 scale='scale_cap' multi=1
.param toxa='toxm_var*0.88+0.5'
.param weff='wr*scale+0.8E-9+dxw_var'
.param leff='lr*scale-6.5E-8+1.0E-14/wr/scale+dxl_var'
.ends nmoscap
.ENDL MOS_CAP

.LIB BJT_MODELS
.model npn npn (
+ level=1
+ is=1e-15
+ bf=100
+ )
.model pnp pnp (
+ level=1
+ is=1e-15
+ bf=50
+ )
.ENDL BJT_MODELS

* Test .subckt/.ends folding
.subckt test_subckt in out
R1 in out 1k
C1 out 0 100n
.ends test_subckt

* Test .control/.endc folding
.control
run
plot v(out)
print v(in) v(out)
.endc

* Test .if/.endif folding
.if (temperature > 25)
.param scale=1.1
.else
.param scale=0.9
.endif

* Test .data/.enddata folding
.data input_data
v1 v2
0 1
5 2
.enddata

* Test .model folding
.model nmos nmos (
+ level=1
+ vto=0.7
+ kp=110u
+ )

.model pmos pmos (
+ level=1
+ vto=-0.7
+ kp=50u
+ )

* Spectre test - subckt/ends
subckt nmoscap_spectre (ng nds)
parameters lr=5e-6 wr=5e-6 scale=scale_cap multi=1
parameters toxa=toxm_var*0.88+0.5
parameters weff=wr*scale+0.8E-9+dxw_var
parameters leff=lr*scale-6.5E-8+1.0E-14/wr/scale+dxl_var
ends nmoscap_spectre

* Spectre test - control/endc
control
run
plot v(out)
endc

* Spectre test - if/endif
if (temperature > 25)
parameters scale=1.1
else
parameters scale=0.9
endif

* Spectre test - model
model nmos_spectre nmos (
+ level=1
+ vto=0.7
+ kp=110u
+ )

* Scientific notation test
.param val1=5e-6
.param val2=1.5E+09
.param val3=2.3E-12
.param val4=100n
.param val5=1k
.param val6=2.2u
.param val7=4.7p

* Functions test
.param sin_val=sin(3.14)
.param cos_val=cos(3.14)
.param log_val=log(100)
.param sqrt_val=sqrt(144)
.param abs_val=abs(-5)
.param max_val=max(1,2,3)
.param min_val=min(1,2,3)

* Expression test
.param expr1='wr*scale+0.8E-9+dxw_var'
.param expr2='(temper+273.0)/11606.0'
.param expr3='sqrt(ndep0_var*(1.0+3.0E-7/lr/scale)*3.8850499/(temper+273.0))*toxa/3.399936'

* Test .lib reference vs definition (PDK-style, structure only)
* The outer .LIB NAME ... .ENDL NAME is a section DEFINITION (folds).
* The inner .lib 'file' NAME lines are file REFERENCES (must NOT fold).
* The bare .param + continuation lines are a single statement (must NOT fold),
* including a function-call line like +pname=agauss(0,1,1) whose trailing ')'
* must NOT be mistaken for a .model block end.
.LIB corner_ss
.lib 'typical_pdk.l' setup
.param
+pname=agauss(0,1,1)
+pname2=agauss(0,1,1)
+fac1='0.5*pname'
.lib 'typical_pdk.l' mos_models
.ENDL corner_ss

.end
