# SPICE/HSPICE vs Spectre — Syntax Reference

This document compares the two netlist dialect families this extension supports,
and notes how the navigation engine treats each. It is a quick reference for
reading and writing netlists, not a simulator manual.

## The two families

| | **SPICE / HSPICE** | **Spectre (Cadence)** |
|---|---|---|
| File extensions | `.ckt` `.sp` `.net` `.cir` `.mod` `.mdl` `.lib` `.sub` `.l` | `.scs` |
| Statement keyword | leading **dot**: `.subckt`, `.model`, `.param`, `.lib` | **bare** keyword: `subckt`, `model`, `parameters`, `section` |
| Line comment | `*` (full line), `$` / `;` (inline) | `//` (inline); `*` is *not* a comment in pure Spectre |
| Continuation | `+` at start of next line | bare newline, or `{ ... }` block (real-world `.scs` also uses `+`) |
| Instance form | `Xname nodes subckt` — name prefix letter, no parens | `name ( nodes ) target` — name first, nodes in parens, target after |
| Subckt ports | after the name, bare | inside `( ... )` |
| Case sensitivity | insensitive (HSPICE) | sensitive by default (`insensitive=yes` to switch) |
| Corner grouping | `.LIB section … .ENDL` | `section … endsection` / `library … endlibrary` |

> Both dialects share a single VS Code language id (`spice`), so highlighting,
> folding, snippets, and navigation all work in any `.sp` / `.scs` / `.lib` file.
> A file that mixes the two via `simulator lang=…` switching is parsed
> line-by-line in the right dialect (see [Mixed files](#mixed-files)).

## Comments

```spice
* HSPICE full-line comment
.param x=1 $ inline comment
.param y=2 ; also inline
```
```spectre
// Spectre line comment (// works in both dialects here)
parameters x=1  // inline comment
```

The parser strips `$`, `;`, and `//` inline (outside quotes) in both dialects,
and treats a leading `*` as a full-line comment. Real-world Spectre model
libraries often use `*` block-comment banners at the top of the file — these are
honoured too.

## Continuation lines

**HSPICE** joins lines starting with `+`:
```spice
.model nm nmos
+ level=1
+ vth0=0.5
```

**Spectre** joins either by bare newline or by a `{ … }` block:
```spectre
model nch bsim4 {
  vth0=0.5
  u0=0.06
}
```
Many PDK `.scs` files use HSPICE-style `+` continuation inside `model` cards;
both forms are supported and may be mixed.

## Instance statements (the big difference)

**HSPICE** — the first letter is the device class, nodes follow bare, the
subckt/model name is last:
```spice
X1   a b c    mysub          ; X = subckt instance, 3 nodes, subckt "mysub"
M1   d g s b  nch  w=1u l=1u  ; M = MOSFET, model "nch"
R1   n1 n2    1k              ; R = resistor
```

**Spectre** — the instance name comes first (no prefix letter), nodes are listed
inside `( … )`, and the **target** (primitive type, model, or subckt name)
follows the parens:
```spectre
xinv  ( a b vdd vss )  inv   wp=2u        ; subckt instance -> "inv"
mp1   ( d g s b )      nch   w=1u l=1u    ; model reference -> "nch"
rgate ( n1 n2 )        resistor r=1k      ; primitive -> "resistor" (no jump target)
dio   ( a k )          ndio  area=1u      ; model reference -> "ndio"
```

Navigation targets:
- **subckt name** (`inv`) and **model name** (`nch`, `ndio`) → Go-to-Definition,
  Hover, References work.
- **primitive type** (`resistor`, `capacitor`, `mosfet`, `diode`, `vsource`, …)
  is a built-in, not a definition — hovering a node still shows its terminal,
  but the type name itself has no jump target.

> Spectre node names may be purely numeric (`1`, `2`, …); these are accepted.

## Definitions

```spectre
subckt inv ( in out vdd vss )       // ports inside parens
parameters wp=2u wn=1u              // local params
mp1 ( out in vdd vdd ) nch w=wp
ends inv

inline subckt cap ( p m )           // inline variant: flattened at instantiation
c1 ( p m ) capacitor c=1p
ends cap

model nch bsim4 { … }               // model card with { } body
model ndio diode                    // model card with + continuation
```

## Corner / library grouping

```spice
.LIB tt                      ; HSPICE section definition
.model nch_tt nmos …
.ENDL tt
.lib 'corners.l' tt          ; HSPICE section reference (include a file's "tt")
```
```spectre
section tt                   ; Spectre section
model nch bsim4 { … }
endsection tt

library mylib                 ; Spectre library wrapper
section corner1
…
endsection corner1
endlibrary
```

Both map to the same internal *section* concept, so Outline nests symbols under
their section, and the active-section resolver (`Select Active .LIB Section`
command) works for either dialect.

## Statistical / Monte-Carlo blocks (Spectre)

```spectre
statistics {
  process { vary vth0 dist=gauss std=0.02 }
  mismatch { vary dl dist=gauss std=0.01 }
}
```

`statistics` / `process` / `mismatch` blocks are consumed for parsing but **not**
indexed (no navigation target), matching the HSPICE policy of not parsing
`.measure` / `.data` semantics.

## Mixed files

A netlist can switch dialect mid-file:
```
.subckt top a b c          // HSPICE
x1 a b c sub
.ends
simulator lang=spectre     // switch to Spectre from here
subckt sub ( p q r )
r1 ( p q ) resistor r=1
ends sub
simulator lang=spice       // switch back to HSPICE
.model d1 d
```

The parser tracks `simulator lang=spectre` / `simulator lang=spice` directives
per logical line and parses each statement in the right dialect within a single
pass.

## Navigation capability matrix

| Feature | HSPICE | Spectre |
|---|:---:|:---:|
| Go-to-Definition (subckt/model) | ✅ | ✅ |
| Go-to-Definition (`.param` / `parameters` variable) | ✅ | ✅ |
| Hover (ports, model type, node terminal, param value) | ✅ | ✅ |
| Find All References | ✅ | ✅ |
| Outline (symbols nested under section) | ✅ | ✅ |
| `.include` / `include` file links | ✅ (`.INCLUDE`/`.INC`) | ✅ (`include "f"`) |
| `.lib`/`section` scope resolution | ✅ (`.LIB`/`.ENDL`) | ✅ (`section`/`endsection`) |
| Diagnostics (unknown subckt, port-count) | ✅ | ✅ |
| Folding & syntax highlighting | ✅ | ✅ |

## Known limits

- A **2-node** Spectre instance that references a model (e.g. a diode model on
  `dio ( a k ) ndio`) is dropped by the degenerate-instance filter
  (`minXInstanceNodes`, default 2) and will not offer a jump from that line.
  Widen it via `ParseOptions.minXInstanceNodes` if you need those.
- Variable-reference extraction inside expressions is best-effort (see
  `docs/TODO.md`); it affects reference completeness, never jump correctness.
- `analysis` statements (`ac`, `tran`, `pss`, …) and testbench output commands
  (`save`, `print`, `plot`) are not indexed — process model libraries rarely
  contain them.
