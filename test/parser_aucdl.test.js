// Synthetic Cadence auCdl parser smoke test (no test framework).
// Run after `npm run compile`.

const assert = require("assert");
const { parseFile, tokenAtPosition } = require("../out/parser.js");
const { normalizeAucdlSource } = require("../out/aucdl.js");

let passed = 0;
function ok(name, condition) {
  assert.ok(condition, name);
  passed++;
  console.log("  ok -", name);
}

const aucdl = `* Cadence auCdl example
.GLOBAL VDD VSS
.SUBCKT INV A Y VDD VSS
.PININFO A:I Y:O VDD:B VSS:B
MM0 Y A VSS VSS $[nch_svt] $W=1u $L=180n $M=2
MM1 Y A VDD VDD $[pch_svt] $W=2u $L=180n
.ENDS INV

.SUBCKT TOP IN OUT VDD VSS
XI0 IN OUT VDD VSS / INV
.ENDS TOP
`;

const normalised = normalizeAucdlSource(aucdl, "sample.cdl");
ok("normalisation preserves source length", normalised.length === aucdl.length);
ok(
  "normalisation preserves line count",
  normalised.split("\n").length === aucdl.split("\n").length,
);
ok(
  "AUCDL model annotation becomes positional model",
  /MM0 Y A VSS VSS\s+nch_svt\s+W=1u/.test(normalised),
);
ok(
  "AUCDL hierarchy separator is removed",
  /XI0 IN OUT VDD VSS\s+INV/.test(normalised),
);
ok(
  "ordinary HSPICE dollar comment is untouched",
  normalizeAucdlSource("R1 a b 1k $ comment\n", "sample.cdl").includes("$ comment"),
);
ok(
  "non-CDL files are not normalised",
  normalizeAucdlSource("M0 d g s b $[nch]\n", "sample.sp").includes("$[nch]"),
);

const model = parseFile("sample.cdl", aucdl, {
  indexConnectivity: true,
  minXInstanceNodes: 0,
});

ok("INV subcircuit indexed", model.subcktDefs.has("inv"));
ok("TOP subcircuit indexed", model.subcktDefs.has("top"));

const inv = model.subcktDefs.get("inv");
ok(
  "INV ports indexed",
  inv.ports.map((port) => port.name).join(",") === "a,y,vdd,vss",
);

const nmos = model.deviceInstances.find(
  (device) => device.instanceName === "mm0",
);
ok("AUCDL MOS instance indexed", !!nmos);
ok("AUCDL MOS model indexed", nmos && nmos.modelName === "nch_svt");
ok(
  "AUCDL MOS nodes indexed",
  nmos && nmos.nodes.join(",") === "y,a,vss,vss",
);
ok(
  "AUCDL $W/$L/$M properties indexed",
  nmos &&
    nmos.params.get("w") === "1u" &&
    nmos.params.get("l") === "180n" &&
    nmos.params.get("m") === "2",
);

const xi0 = model.xInstances.find(
  (instance) => instance.instanceName === "xi0",
);
ok("AUCDL X instance indexed", !!xi0);
ok("AUCDL X target indexed", xi0 && xi0.subcktName === "inv");
ok(
  "AUCDL X nodes exclude slash",
  xi0 && xi0.nodes.join(",") === "in,out,vdd,vss",
);

const sourceLines = aucdl.split("\n");
const targetRange = xi0.subcktNameRange;
ok(
  "target range remains aligned to original source",
  sourceLines[targetRange.start.line].slice(
    targetRange.start.character,
    targetRange.end.character,
  ) === "INV",
);

const targetHit = tokenAtPosition(model, {
  line: targetRange.start.line,
  character: targetRange.start.character,
});
ok(
  "definition lookup recognises AUCDL X target",
  targetHit &&
    targetHit.kind === "subcktRef" &&
    targetHit.subcktName === "inv",
);

console.log(`AUCDL parser tests passed: ${passed}`);
