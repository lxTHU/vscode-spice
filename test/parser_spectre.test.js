// Synthetic Spectre/HSPICE parser smoke test (no test framework; node assertions).
// Run: node test/parser_spectre.test.js   (after `npm run compile`)
//
// Covers: spectre subckt ( ports ), inline subckt, model with { }, model with +
// continuation, parameters, section/endsection, library, include "f", primitive
// instance, subckt call instance, // comments, numeric nodes, mixed dialect
// (simulator lang= switching), and an HSPICE regression sample.

const assert = require("assert");
const fs = require("fs");
const { parseFile, tokenize, preprocess, extractVarRefs, identifierAtText, tokenAtPosition } = require("../out/parser.js");

let passed = 0;
function ok(name, cond) {
  if (!cond) throw new Error("FAIL: " + name);
  passed++;
  console.log("  ok -", name);
}

// ── 1. Pure Spectre model library ──────────────────────────────────────────
const spectre = `
simulator lang=spectre insensitive=yes
// top-level comment
include "models.scs"

section tt
parameters vdd=1.8 toxn=5e-9 lmin='1e-6-(dxln+dlmisn)'

model nch bsim4 {
  tnom=27
  lmin=1e-6
  wmin=1e-6
}

subckt inv ( in out vdd vss )
parameters wp=2u wn=1u
mp1 ( out in vdd vdd ) nch w=wp l=1u
mn1 ( out in vss vss ) nch w=wn l=1u
ends inv

inline subckt cap ( p m )
c1 ( p m ) capacitor c=1p
ends cap

rgate ( 1 2 ) resistor r=100
lgate ( gate 1 ) inductor l=1n
dio ( 5 3 ) ndio_rf area=1u pj=1u
mn ( d g s b ) nch_rf w=2u l=1u
xinv ( a b vdd vss ) inv wp=3u
endsection tt
`;

const m = parseFile("test.scs", spectre);
console.log("PDK-A-like spectre sample:", {
  subckt: m.subcktDefs.size, model: m.modelDefs.size, param: m.paramDefs.size,
  section: m.sectionDefs.size, x: m.xInstances.length, dev: m.deviceInstances.length,
  inc: m.includes.length,
});

ok("model nch indexed", m.modelDefs.has("nch"));
ok("model type bsim4", m.modelDefs.get("nch").modelType === "bsim4");
// model card `model nch bsim4 { ... }` spans multiple physical lines once the
// `{ }` block is joined into one logical line.
const nch = m.modelDefs.get("nch");
ok("model { } block joined (range spans >1 line)", nch.range.end.line > nch.range.start.line);
ok("subckt inv indexed", m.subcktDefs.has("inv"));
const inv = m.subcktDefs.get("inv");
ok("subckt ports parsed from ( )", inv.ports.length === 4 && inv.ports[0].name === "in");
ok("inline subckt cap indexed", m.subcktDefs.has("cap"));
ok("section tt indexed", m.sectionDefs.has("tt"));
ok("parameters vdd/toxn indexed", m.paramDefs.has("vdd") && m.paramDefs.has("toxn"));
ok("param lmin expr varRefs include dxln", m.paramDefs.has("lmin"));
const lmin = m.paramDefs.get("lmin")[0];
ok("param lmin varRefs has dxln+dlmisn", lmin.varRefs && lmin.varRefs.includes("dxln") && lmin.varRefs.includes("dlmisn"));
ok("include models.scs indexed", m.includes.length === 1 && m.includes[0].path === "models.scs");

// Instances: mp1/mn1/c1 are primitives (DeviceInstance); xinv is an XInstance.
const xinst = m.xInstances.find((x) => x.instanceName === "xinv");
ok("subckt call xinv -> XInstance", !!xinst);
ok("xinv target is inv", xinst && xinst.subcktName === "inv");
ok("xinv 4 nodes", xinst && xinst.nodes.length === 4);

const rgate = m.deviceInstances.find((d) => d.instanceName === "rgate");
ok("primitive resistor -> DeviceInstance", !!rgate && rgate.deviceType === "resistor");
ok("primitive has no modelName (no spurious jump)", rgate && rgate.modelName === undefined);

const dio = m.deviceInstances.find((d) => d.instanceName === "dio");
// A model-reference instance with ≥3 nodes is kept as an XInstance (navigable).
const mn = m.xInstances.find((x) => x.instanceName === "mn");
ok("model-ref instance mn -> XInstance (nch_rf not primitive)", !!mn);
ok("mn target nch_rf", mn && mn.subcktName === "nch_rf");
ok("mn 4 nodes", mn && mn.nodes.length === 4);
// A model-reference instance with only 2 nodes (dio) is dropped by the
// minXInstanceNodes gate (default 2), matching HSPICE X-instance behaviour.
ok("2-node model-ref dio dropped by minXInstanceNodes gate",
  !m.xInstances.find((x) => x.instanceName === "dio") && !m.deviceInstances.find((d) => d.instanceName === "dio"));

// ── 2. // comment stripping ────────────────────────────────────────────────
const lines = preprocess("x.scs", "mp1 ( out in vdd ) nch w=1u // trailing comment\n");
ok("// comment stripped", !/trailing/.test(lines[0].text));

// ── 3. Numeric nodes accepted ──────────────────────────────────────────────
const mNum = parseFile("n.scs", "simulator lang=spectre\nr1 ( 1 2 ) resistor r=1k\n");
const r1 = mNum.deviceInstances[0];
ok("numeric nodes 1,2 accepted", r1 && r1.nodes[0] === "1" && r1.nodes[1] === "2");

// ── 4. Mixed dialect: HSPICE file with embedded spectre segment ────────────
const mixed = `
.subckt top a b c
x1 a b c sub
.ends
simulator lang=spectre
subckt sub ( p q r )
r1 ( p q ) resistor r=1
ends sub
simulator lang=spice
.model diod dm d
`;
const mm = parseFile("mix.cir", mixed);
ok("HSPICE .subckt indexed in mixed file", mm.subcktDefs.has("top"));
ok("spectre subckt indexed in mixed file", mm.subcktDefs.has("sub"));
ok("HSPICE .model indexed after lang switch back", mm.modelDefs.has("diod"));
const topSub = mm.subcktDefs.get("top");
ok("HSPICE x1 subckt call present", mm.xInstances.some((x) => x.instanceName === "x1" && x.subcktName === "sub"));
const subDef = mm.subcktDefs.get("sub");
ok("spectre subckt ports parsed (p q r)", subDef.ports.length === 3 && subDef.ports[0].name === "p");

// ── 5. HSPICE regression (no spectre contamination) ────────────────────────
const hsp = `
.param x=1
.LIB tt
.model nm nmos
mn1 d g s nm w=1u l=1u
.ENDL tt
.lib 'other.l' corner
.INCLUDE 'inc.l'
.subckt inv a b y c
xa a b y c sub
.ends
`;
const hm = parseFile("h.cir", hsp);
ok("HSPICE .param indexed", hm.paramDefs.has("x"));
ok("HSPICE .model indexed", hm.modelDefs.has("nm"));
ok("HSPICE .LIB section definition indexed", hm.sectionDefs.has("tt"));
ok("HSPICE .lib 'file' sec -> libRef", hm.libRefs.length === 1 && hm.libRefs[0].sectionName === "corner");
ok("HSPICE .INCLUDE indexed", hm.includes.length === 1 && hm.includes[0].path === "inc.l");
ok("HSPICE mn1 not parsed as spectre instance (device by letter m)", hm.deviceInstances.some((d) => d.instanceName === "mn1"));
ok("HSPICE xa X-instance present", hm.xInstances.some((x) => x.instanceName === "xa"));

// ── 6. Expression identifier boundaries ────────────────────────────────────
const boundaryExpr = "a-noiseflagn+b1fn*(abs(x)-noiseflagn)+1.6e-08+dl";
const boundaryRefs = extractVarRefs(boundaryExpr);
ok("expression refs split at minus operator",
  boundaryRefs.includes("a") && boundaryRefs.includes("noiseflagn") && !boundaryRefs.includes("a-noiseflagn"));
ok("scientific notation exponent still excluded",
  boundaryRefs.includes("dl") && !boundaryRefs.includes("e"));
ok("identifierAtText splits binary minus",
  identifierAtText("a-noiseflagn", "a-noiseflagn".indexOf("noiseflagn")) === "noiseflagn");
ok("identifierAtText splits unary minus",
  identifierAtText("(-noiseflagn)", "(-noiseflagn)".indexOf("noiseflagn")) === "noiseflagn");
ok("identifierAtText skips function call names",
  identifierAtText("abs(noiseflagn)", 1) === undefined);

const boundarySrc = ".param noiseflagn=1\n.param x='a-noiseflagn+b1fn*(abs(a)-noiseflagn)'\n";
const boundaryModel = parseFile("boundary.sp", boundarySrc);
const boundaryLine = boundarySrc.split("\n")[1];
const boundaryChar = boundaryLine.indexOf("noiseflagn") + 1;
const boundaryHit = tokenAtPosition(boundaryModel, { line: 1, character: boundaryChar });
ok("tokenAtPosition returns paramRef at minus-adjacent identifier",
  boundaryHit && boundaryHit.kind === "paramRef" && boundaryHit.name === "noiseflagn");

const wordPattern = JSON.parse(fs.readFileSync("language-configuration.json", "utf8")).wordPattern;
function wordAt(text, offset) {
  const re = new RegExp(wordPattern, "g");
  let match;
  while ((match = re.exec(text)) !== null) {
    if (offset >= match.index && offset <= match.index + match[0].length) return match[0];
  }
}
ok("wordPattern treats minus as identifier boundary",
  wordAt("a-noiseflagn", "a-noiseflagn".indexOf("noiseflagn")) === "noiseflagn");

console.log("\nAll " + passed + " assertions passed.");
