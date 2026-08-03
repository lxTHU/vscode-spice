// Synthetic-only scoped connectivity regression suite.
// Run after compilation: node test/connectivity.test.js

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  netOccurrenceAtPosition,
  netOccurrencesInScope,
  parseFile,
  preprocess,
  tokenAtPosition,
} = require("../out/parser.js");
const {
  collectOccurrencesInRange,
  formalPortTargets,
  formalSubcktCandidates,
  netReferenceOccurrences,
  uniqueFormalPortHint,
} = require("../out/connectivity.js");
const { SymbolIndex } = require("../out/index.js");

let passed = 0;
function ok(name, condition) {
  assert.ok(condition, name);
  passed++;
  console.log("  ok -", name);
}

function allOccurrences(model) {
  return [...(model.connectivity?.byLine.values() ?? [])].flat();
}

function occurrence(model, predicate) {
  const found = allOccurrences(model).find(predicate);
  assert.ok(found, "missing expected occurrence");
  return found;
}

function posOf(source, needle, delta = 0) {
  const offset = source.indexOf(needle);
  assert.ok(offset >= 0, `missing needle: ${needle}`);
  const before = source.slice(0, offset + delta);
  const lines = before.split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}

const hspiceSource = [
  ".model qbjt npn",
  ".model jmod njf",
  ".model smod sw",
  ".model zmod nmf",
  ".global VDD",
  ".subckt Leaf A B C D",
  "Rleaf A B 1k",
  ".ends Leaf",
  ".subckt One IN OUT VSS",
  "R1 IN n<3> 1k",
  "C1 n<3> 0 1p",
  "L1 OUT n<3> 1n",
  "M1 OUT IN 0 SUB nmos",
  "D1 OUT 0 dmod",
  "V1 OUT 0 1",
  "E1 CTRL 0 IN 0 1",
  "Q1 OUT IN 0 SUB qbjt",
  "J1 OUT IN 0 jmod",
  "S1 OUT 0 IN 0 smod",
  "Z1 OUT IN 0 zmod",
  "T1 OUT 0 IN 0 Z0=50",
  "W1 OUT 0 V1 swmod",
  "Rvdd VDD OUT 1k",
  "Xshort IN OUT Leaf gain = 1",
  "Xlong IN",
  "+ n<3> 0",
  "+ SUB Leaf gain=2",
  ".ends One",
  ".subckt Two IN OUT VSS",
  "R2 IN n<3> 2k",
  ".ends Two",
  "Rtop NetCase 0 3k",
  "Rvddtop VDD topaux 1k",
  "Ctop netcase n<3> 4p",
  "Xtop NetCase 0 Leaf",
  "Rdigital 101 102 5k",
].join("\n") + "\n";

const defaultModel = parseFile("synthetic.cir", hspiceSource);
ok("connectivity is opt-in for direct/disk-style parsing", defaultModel.connectivity === undefined);

const hspice = parseFile("synthetic.cir", hspiceSource, { indexConnectivity: true });
ok("connectivity index is built when requested", !!hspice.connectivity);

const oneIn = occurrence(hspice, (item) =>
  item.name === "in" && item.scope.originalSubcktName === "One" && item.endpoint.kind === "port");
const oneInOccurrences = netOccurrencesInScope(hspice, oneIn.scope.id, "IN");
ok("subckt header port and local endpoints share a case-insensitive net",
  oneInOccurrences.length >= 4 && oneInOccurrences.every((item) => item.scope.id === oneIn.scope.id));
ok("References includes the header declaration when requested",
  netReferenceOccurrences(oneInOccurrences, true).some((item) => item.endpoint.kind === "port"));
ok("References excludes only the header declaration when requested",
  netReferenceOccurrences(oneInOccurrences, false).every((item) => item.endpoint.kind !== "port"));

const twoIn = occurrence(hspice, (item) =>
  item.name === "in" && item.scope.originalSubcktName === "Two" && item.endpoint.kind === "port");
ok("same spelling in two subckts has distinct scope ids", oneIn.scope.id !== twoIn.scope.id);
ok("same spelling in two subckts never cross-links",
  !netOccurrencesInScope(hspice, oneIn.scope.id, "in").some((item) => item.scope.id === twoIn.scope.id));

const topNet = occurrence(hspice, (item) => item.name === "netcase" && item.scope.kind === "top");
const topNetOccurrences = netOccurrencesInScope(hspice, topNet.scope.id, "NETCASE");
ok("top-level mixed-case spellings normalize but preserve source spelling",
  topNetOccurrences.length === 3 && topNetOccurrences.some((item) => item.originalName === "NetCase"));
ok("top-level and subckt nets remain independent", topNet.scope.id !== oneIn.scope.id);

const localGround = occurrence(hspice, (item) =>
  item.name === "0" && item.scope.originalSubcktName === "One");
const topGround = occurrence(hspice, (item) => item.name === "0" && item.scope.kind === "top");
ok("ground node 0 remains lexical in 0.4.0", localGround.scope.id !== topGround.scope.id);
const localGlobal = occurrence(hspice, (item) =>
  item.name === "vdd" && item.scope.originalSubcktName === "One");
const topGlobal = occurrence(hspice, (item) => item.name === "vdd" && item.scope.kind === "top");
ok("an explicit .global name remains separated by lexical scope in 0.4.0",
  localGlobal.scope.id !== topGlobal.scope.id);

ok("R/C/L are indexed without expanding retained deviceInstances",
  ["r1", "c1", "l1"].every((name) => allOccurrences(hspice).some((item) =>
    item.endpoint.kind === "device" && item.endpoint.instanceName === name)) &&
  !hspice.deviceInstances.some((item) => ["r1", "c1", "l1"].includes(item.instanceName)));
ok("M/Q/D, source, and controlled-source endpoints are indexed",
  ["m1", "q1", "d1", "v1", "e1"].every((name) => allOccurrences(hspice).some((item) =>
    item.endpoint.kind === "device" && item.endpoint.instanceName === name)));
const additionalDeviceCounts = new Map([
  ["j1", 3], ["s1", 4], ["z1", 3], ["t1", 4], ["w1", 2],
]);
ok("J/S/Z/W/T positional node counts exclude model and control tokens",
  [...additionalDeviceCounts].every(([name, count]) =>
    allOccurrences(hspice).filter((item) =>
      item.endpoint.kind === "device" && item.endpoint.instanceName === name).length === count));
ok("J/S/Z model targets retain legacy model-reference navigation",
  [["J1 OUT IN 0 jmod", "jmod"], ["S1 OUT 0 IN 0 smod", "smod"], ["Z1 OUT IN 0 zmod", "zmod"]]
  .every(([line, name]) => {
    const position = posOf(hspiceSource, line, line.indexOf(name));
    return tokenAtPosition(hspice, position)?.kind === "modelRef";
  }));
ok("numeric digital-style nodes are indexed exactly",
  ["101", "102"].every((name) => allOccurrences(hspice).some((item) => item.name === name)));

const shortX = occurrence(hspice, (item) =>
  item.endpoint.kind === "xinstance" && item.endpoint.instanceName === "xshort" && item.endpoint.nodeIndex === 0);
ok("filtered two-node HSPICE X still participates in connectivity",
  !hspice.xInstances.some((item) => item.instanceName === "xshort") && shortX.endpoint.nodeCount === 2);
ok("spaced X parameters do not replace the target name",
  shortX.endpoint.kind === "xinstance" && shortX.endpoint.targetName === "leaf");

const qSubstrate = occurrence(hspice, (item) =>
  item.originalName === "SUB" && item.endpoint.kind === "device" && item.endpoint.instanceName === "q1");
ok("four-terminal Q substrate is an electrical endpoint", qSubstrate.endpoint.nodeIndex === 3);
const qAreaModel = parseFile("q-area.cir", ".model qmod npn\nQarea C B E qmod 2\n", { indexConnectivity: true });
const qArea = qAreaModel.deviceInstances.find((item) => item.instanceName === "qarea");
ok("three-terminal Q positional area is not mistaken for a substrate",
  qArea?.nodes.length === 3 && qArea.modelName === "qmod" &&
  !allOccurrences(qAreaModel).some((item) => item.originalName === "qmod" || item.originalName === "2"));
const qSymbolicModel = parseFile(
  "q-symbolic.cir",
  ".model qmod npn\nQsym C B E qmod AREA_SCALE\nQoff C B E qmod OFF\nQic C B E qmod ic=0.1,0.2\n",
  { indexConnectivity: true },
);
ok("symbolic Q area, OFF, and IC forms remain three-terminal",
  qSymbolicModel.deviceInstances
    .filter((item) => ["qsym", "qoff", "qic"].includes(item.instanceName))
    .every((item) => item.nodes.length === 3 && item.modelName === "qmod"));
const qLateModel = parseFile(
  "q-late-model.cir",
  "Qlate C B E SUB late_model\n.model late_model npn\n",
  { indexConnectivity: true },
);
ok("a later local model declaration still disambiguates a four-terminal Q",
  qLateModel.deviceInstances.find((item) => item.instanceName === "qlate")?.nodes.length === 4);
const headerParams = parseFile("header.cir", ".subckt WithParams A B params: gain=1\n.ends\n", { indexConnectivity: true });
ok("subckt header params are not indexed as ports",
  headerParams.subcktDefs.get("withparams").ports.map((port) => port.name).join(",") === "a,b");
ok("punctuated bus-like net names remain exact", allOccurrences(hspice).some((item) => item.originalName === "n<3>"));

const portHit = tokenAtPosition(hspice, oneIn.range.start);
ok("token hit prefers lexical net semantics on live models", portHit && portHit.kind === "netRef");
ok("net occurrence ranges are half-open", netOccurrenceAtPosition(hspice, oneIn.range.end) === undefined);

const leaf = hspice.subcktDefs.get("leaf");
const longX = occurrence(hspice, (item) =>
  item.endpoint.kind === "xinstance" && item.endpoint.instanceName === "xlong" && item.endpoint.nodeIndex === 0);
const formalTargets = formalPortTargets(longX, [leaf]);
ok("X-node F12 target remains the positional formal port",
  formalTargets.length === 1 && formalTargets[0].port.originalName === "A");
ok("unique exact subckt call yields an inlay formal-port target",
  uniqueFormalPortHint(longX, [leaf])?.port.originalName === "A");
ok("port-count mismatch yields no inlay hint", uniqueFormalPortHint(shortX, [leaf]) === undefined);
ok("missing definition yields no inlay hint", uniqueFormalPortHint(longX, []) === undefined);
ok("ambiguous definitions yield no inlay hint", uniqueFormalPortHint(longX, [leaf, { ...leaf }]) === undefined);
const qbjt = hspice.modelDefs.get("qbjt");
ok("a reachable model/subckt name collision suppresses formal-port candidates",
  formalSubcktCandidates([leaf], [...hspice.modelDefs.values()].filter((def) => def.name === "leaf")).length === 1 &&
  qbjt && formalSubcktCandidates([leaf], [qbjt]).length === 0);

const longSecondLine = occurrence(hspice, (item) =>
  item.endpoint.kind === "xinstance" && item.endpoint.instanceName === "xlong" && item.endpoint.nodeIndex === 1).range.start.line;
const visibleContinuation = collectOccurrencesInRange(
  (line) => hspice.connectivity.byLine.get(line) ?? [],
  { start: { line: longSecondLine, character: 0 }, end: { line: longSecondLine + 1, character: 0 } },
  () => false,
);
ok("Inlay candidate collection is limited to the requested physical range",
  visibleContinuation && visibleContinuation.length === 2 &&
  visibleContinuation.every((item) => item.range.start.line === longSecondLine));
const shortXSecond = occurrence(hspice, (item) =>
  item.endpoint.kind === "xinstance" && item.endpoint.instanceName === "xshort" && item.endpoint.nodeIndex === 1);
const sameLinePartial = collectOccurrencesInRange(
  (line) => hspice.connectivity.byLine.get(line) ?? [],
  { start: shortX.range.start, end: shortXSecond.range.start },
  () => false,
);
ok("same-line partial Inlay ranges remain half-open",
  sameLinePartial?.length === 1 && sameLinePartial[0] === shortX);
let cancellationChecks = 0;
ok("Inlay candidate collection discards partial output on cancellation",
  collectOccurrencesInRange(
    (line) => hspice.connectivity.byLine.get(line) ?? [],
    { start: { line: 0, character: 0 }, end: { line: 19, character: 0 } },
    () => ++cancellationChecks > 2,
  ) === undefined);

const spectreSource = [
  "simulator lang=spectre",
  "global VSS",
  "subckt Trio ( A B C )",
  "ends Trio",
  "subckt Wrap ( IN OUT )",
  "Xcont ( IN \\ // synthetic continuation",
  "    Mid \\",
  "    OUT ) Trio",
  "Rmid ( Mid 0 ) resistor",
  "Rcase ( NetCase netcase ) resistor",
  "RlocalGlobal ( VSS OUT ) resistor",
  "Dmod ( OUT 0 ) ndio",
  "ends Wrap",
  "RtopGlobal ( VSS 0 ) resistor",
].join("\n") + "\n";

const spectre = parseFile("synthetic.scs", spectreSource, { indexConnectivity: true });
const continuedMid = occurrence(spectre, (item) =>
  item.originalName === "Mid" && item.endpoint.kind === "xinstance");
ok("Spectre trailing-backslash continuation preserves the second physical line",
  continuedMid.range.start.line === posOf(spectreSource, "Mid").line &&
  continuedMid.range.start.character === posOf(spectreSource, "Mid").character);
const continuedOut = occurrence(spectre, (item) =>
  item.originalName === "OUT" && item.endpoint.kind === "xinstance");
ok("chained Spectre continuation preserves the third physical line",
  continuedOut.range.start.line === posOf(spectreSource, "OUT ) Trio").line);
ok("continuation marker is not tokenized as a net",
  !allOccurrences(spectre).some((item) => item.name === "\\"));
const spectreCase = occurrence(spectre, (item) => item.originalName === "NetCase");
ok("Spectre net navigation intentionally uses case-insensitive lexical names",
  netOccurrencesInScope(spectre, spectreCase.scope.id, "NETCASE").length === 2);
const spectreLocalGlobal = occurrence(spectre, (item) =>
  item.name === "vss" && item.scope.originalSubcktName === "Wrap");
const spectreTopGlobal = occurrence(spectre, (item) => item.name === "vss" && item.scope.kind === "top");
ok("a Spectre global name remains separated by lexical scope in 0.4.0",
  spectreLocalGlobal.scope.id !== spectreTopGlobal.scope.id);

const crlf = parseFile("synthetic.scs", spectreSource.replace(/\n/g, "\r\n"), { indexConnectivity: true });
const crlfMid = occurrence(crlf, (item) => item.originalName === "Mid" && item.endpoint.kind === "xinstance");
ok("CRLF continuation keeps the same physical range", crlfMid.range.start.line === continuedMid.range.start.line && crlfMid.range.start.character === continuedMid.range.start.character);

const quotedTerminalSlash = String.raw`parameters marker="literal\
parameters next=1
`;
ok("terminal backslash inside an open quote does not join the next statement",
  preprocess(quotedTerminalSlash, "quoted.scs").length === 2);

const primitiveEndpoint = occurrence(spectre, (item) =>
  item.endpoint.kind === "device" && item.endpoint.instanceName === "rmid");
const modelEndpoint = occurrence(spectre, (item) =>
  item.endpoint.kind === "xinstance" && item.endpoint.instanceName === "dmod");
ok("two-node primitive has no false formal-port target", formalPortTargets(primitiveEndpoint, [leaf]).length === 0);
ok("two-node model reference is indexed but has no invented subckt target",
  modelEndpoint.endpoint.targetName === "ndio" && formalPortTargets(modelEndpoint, []).length === 0);

const duplicateScopeSource = [
  ".LIB fast",
  ".subckt Cell A B",
  ".ends Cell",
  ".ENDL fast",
  ".LIB slow",
  ".subckt Cell A B",
  ".ends Cell",
  ".ENDL slow",
  "Xcell n1 n2 Cell",
].join("\n") + "\n";
const duplicateScopes = parseFile("sections.lib", duplicateScopeSource, { indexConnectivity: true });
const cellPortScopes = allOccurrences(duplicateScopes)
  .filter((item) => item.endpoint.kind === "port" && item.endpoint.subcktName === "cell")
  .map((item) => item.scope.id);
ok("same-named subckts in different sections retain unique lexical scopes",
  new Set(cellPortScopes).size === 2);
const duplicateCall = occurrence(duplicateScopes, (item) =>
  item.endpoint.kind === "xinstance" && item.endpoint.instanceName === "xcell" && item.endpoint.nodeIndex === 0);
ok("same-name section definitions suppress ambiguous inlay hints",
  duplicateScopes.subcktDefList.length === 2 &&
  uniqueFormalPortHint(duplicateCall, duplicateScopes.subcktDefList) === undefined);
ok("both duplicate subckt headers remain exact definition hits",
  duplicateScopes.subcktDefList.every((definition) =>
    tokenAtPosition(duplicateScopes, definition.nameRange.start)?.kind === "subcktDef"));

const symbolIndex = new SymbolIndex();
symbolIndex.indexLive("first.cir", "R1 local 0 1k\n");
symbolIndex.indexLive("second.cir", "R2 local 0 1k\n");
const firstLocal = symbolIndex.findNetOccurrence("first.cir", { line: 0, character: 3 });
ok("unrelated live files never share a net result",
  firstLocal && symbolIndex.findNetOccurrences("first.cir", firstLocal.scope.id, "local").length === 1);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "spice-synthetic-"));
try {
  const rootFile = path.join(tempRoot, "root.cir");
  const includeFile = path.join(tempRoot, "child.inc");
  fs.writeFileSync(includeFile, [
    ".LIB fast",
    ".subckt Cell A B",
    ".ends Cell",
    ".ENDL fast",
    ".LIB slow",
    ".subckt Cell A B C",
    ".ends Cell",
    ".ENDL slow",
  ].join("\n") + "\n", "utf8");
  symbolIndex.indexWithIncludes(rootFile, `.lib '${path.basename(includeFile)}' fast\nXroot n1 n2 Cell\n`);
  ok("disk include cache omits connectivity", symbolIndex.getModel(includeFile)?.connectivity === undefined);

  const reachable = symbolIndex.buildReachableDefinitionIndex(rootFile);
  const rootScope = symbolIndex.resolveScopeForReference(includeFile, rootFile);
  const rootCall = occurrence(symbolIndex.getModel(rootFile), (item) =>
    item.endpoint.kind === "xinstance" && item.endpoint.instanceName === "xroot" && item.endpoint.nodeIndex === 0);
  const selected = (reachable?.subckts.get("cell") ?? [])
    .filter((definition) => definition.section === rootScope.section);
  ok(".lib fast selects the unique matching formal-port definition",
    rootScope.determined && rootScope.section === "fast" &&
    uniqueFormalPortHint(rootCall, selected)?.port.originalName === "A");

  const plainRoot = path.join(tempRoot, "plain.cir");
  symbolIndex.indexWithIncludes(plainRoot, `.include '${path.basename(includeFile)}'\nXplain n1 n2 Cell\n`);
  const unrelatedRoot = path.join(tempRoot, "unrelated.cir");
  symbolIndex.indexWithIncludes(unrelatedRoot, [
    `.lib '${path.basename(includeFile)}' slow`,
    ".subckt Cell P N",
    ".ends Cell",
  ].join("\n") + "\n");
  const plainReachable = symbolIndex.buildReachableDefinitionIndex(plainRoot);
  const plainScope = symbolIndex.resolveScopeForReference(includeFile, plainRoot);
  ok("plain include scope is not inferred from an unrelated live selector",
    !plainScope.determined && plainReachable?.subckts.get("cell")?.length === 2);

  const ambiguousInclude = path.join(tempRoot, "ambiguous.inc");
  const ambiguousRoot = path.join(tempRoot, "ambiguous-root.cir");
  fs.writeFileSync(ambiguousInclude, [
    ".subckt Both A B",
    ".ends Both",
    ".model Both nmos",
  ].join("\n") + "\n", "utf8");
  symbolIndex.indexWithIncludes(ambiguousRoot, `.include '${path.basename(ambiguousInclude)}'\nXboth n1 n2 Both\n`);
  const ambiguousReachable = symbolIndex.buildReachableDefinitionIndex(ambiguousRoot);
  ok("reachable model/subckt ambiguity suppresses formal-port navigation",
    formalSubcktCandidates(
      ambiguousReachable?.subckts.get("both") ?? [],
      ambiguousReachable?.models.get("both") ?? [],
    ).length === 0);

  let definitionCancellationChecks = 0;
  ok("reachable-definition traversal discards partial work on cancellation",
    symbolIndex.buildReachableDefinitionIndex(
      rootFile,
      () => ++definitionCancellationChecks > 2,
    ) === undefined);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

const lifecycleIndex = new SymbolIndex();
lifecycleIndex.indexLive("lifecycle.cir", "R1 alive 0 1k\n");
ok("live connectivity is removed when a document cache entry is invalidated",
  !!lifecycleIndex.getModel("lifecycle.cir")?.connectivity &&
  (lifecycleIndex.invalidateLive("lifecycle.cir"), lifecycleIndex.getModel("lifecycle.cir") === undefined));

const denseLines = [".subckt Dense A B"];
for (let i = 0; i < 12000; i++) denseLines.push(`R${i} n${i % 64} n${(i + 1) % 64} 1k`);
denseLines.push(".ends Dense");
const denseIndex = new SymbolIndex();
denseIndex.indexLive("dense.cir", denseLines.join("\n") + "\n");
const probe = denseIndex.findNetOccurrence("dense.cir", { line: 6402, character: 6 });
const lookupStart = process.hrtime.bigint();
for (let i = 0; i < 1000; i++) {
  if (probe) denseIndex.findNetOccurrences("dense.cir", probe.scope.id, probe.name);
  denseIndex.netOccurrencesOnLine("dense.cir", 6000 + (i % 100));
}
const lookupMs = Number(process.hrtime.bigint() - lookupStart) / 1e6;
ok("large synthetic lookup and visible-line access stay bounded", !!probe && lookupMs < 200);

console.log(`\nAll ${passed} connectivity assertions passed.`);
