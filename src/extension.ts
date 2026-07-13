// VS Code extension entry point: registers netlist navigation providers.
// Ported (simplified) from vladimir-aptekar/hspice-intellisense (MIT).
// Runs entirely in the extension host — no language-server process.
// Providers are dialect-neutral: they operate on the parser's FileModel and
// work for both HSPICE and Spectre (`.scs`) netlists.

import * as vscode from "vscode";
import {
  tokenAtPosition,
  containsPosition,
  identifierAtText,
  type Range,
  type Pos,
  type SubcktDef,
  type ModelDef,
  type ParamDef,
} from "./parser";
import { SymbolIndex, resolveInclude } from "./index";

const DEBOUNCE_MS = 300;

const SPICE_SELECTOR: vscode.DocumentSelector = [{ scheme: "file", language: "spice" }];

/** Device terminal names for hover on device nodes (HSPICE device letters). */
const DEVICE_TERMINALS: Record<string, string[]> = {
  r: ["term1", "term2"],
  c: ["term1", "term2"],
  l: ["term1", "term2"],
  m: ["drain", "gate", "source", "bulk"],
  q: ["collector", "base", "emitter"],
  d: ["anode", "cathode"],
  v: ["+", "−"],
  i: ["+", "−"],
  e: ["out+", "out−", "in+", "in−"],
  g: ["out+", "out−", "in+", "in−"],
  f: ["out+", "out−"],
  h: ["out+", "out−"],
  b: ["+", "−"],
  t: ["port1+", "port1−", "port2+", "port2−"],
};

/**
 * Terminal labels for Spectre primitive instances, keyed by the primitive type
 * name that appears as the instance target (`name ( nodes ) <type> ...`).
 * Falls back to `DEVICE_TERMINALS` (HSPICE letters) and finally `term{i}`.
 */
const SPECTRE_TERMINALS: Record<string, string[]> = {
  resistor: ["plus", "minus"],
  capacitor: ["plus", "minus"],
  inductor: ["plus", "minus"],
  mosfet: ["d", "g", "s", "b"],
  bsim1: ["d", "g", "s", "b"], bsim2: ["d", "g", "s", "b"], bsim3: ["d", "g", "s", "b"],
  bsim4: ["d", "g", "s", "b"], bsim6: ["d", "g", "s", "b"], bsimsoi: ["d", "g", "s", "b"],
  diode: ["positive", "negative"],
  bjt: ["collector", "base", "emitter"], bipolar: ["c", "b", "e"],
  jfet: ["drain", "gate", "source"],
  vsource: ["plus", "minus"], isource: ["plus", "minus"],
  vcvs: ["op", "om", "ip", "im"], vccs: ["op", "om", "ip", "im"],
  ccvs: ["op", "om", "ip", "im"], cccs: ["op", "om", "ip", "im"],
  switch: ["plus", "minus"],
};

const index = new SymbolIndex();
const reindexTimers = new Map<string, NodeJS.Timeout>();
const diagnosticCollection = vscode.languages.createDiagnosticCollection("spice");

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(SPICE_SELECTOR, new SpiceDocumentSymbolProvider()),
    vscode.languages.registerDefinitionProvider(SPICE_SELECTOR, new SpiceDefinitionProvider()),
    vscode.languages.registerHoverProvider(SPICE_SELECTOR, new SpiceHoverProvider()),
    vscode.languages.registerReferenceProvider(SPICE_SELECTOR, new SpiceReferenceProvider()),
    vscode.languages.registerDocumentLinkProvider(SPICE_SELECTOR, new SpiceDocumentLinkProvider()),
    diagnosticCollection,

    // Manually pin the active `.LIB section` for the current file (scenario B:
    // analyzing a generic PDK with multiple upstream references).
    vscode.commands.registerCommand("spice.selectScope", selectScopeCommand),
    vscode.commands.registerCommand("spice.clearScope", clearScopeCommand),

    vscode.workspace.onDidOpenTextDocument(onDocumentChanged),
    vscode.workspace.onDidChangeTextDocument((e) => onDocumentChanged(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.languageId !== "spice" || doc.uri.scheme !== "file") return;
      const filePath = uriToPath(doc.uri);
      index.invalidateLive(filePath);
      diagnosticCollection.delete(doc.uri);
    }),
  );

  // Index already-open documents when the extension activates.
  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === "spice" && doc.uri.scheme === "file") {
      onDocumentChanged(doc);
    }
  }
}

export function deactivate(): void {
  for (const t of reindexTimers.values()) clearTimeout(t);
  reindexTimers.clear();
}

// ── Manual scope selection (scenario B: analyzing a generic PDK file) ───────

/** QuickPick of `.LIB section` names defined in (or referenced by) the active file. */
async function selectScopeCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "spice") {
    vscode.window.showWarningMessage("Open a SPICE file first.");
    return;
  }
  const filePath = uriToPath(editor.document.uri);
  const model = index.getModel(filePath);
  if (!model) return;

  // Gather section names: those defined here, plus those referenced via `.lib 'file' sec`.
  const sections = new Map<string, string>(); // lowercased → original
  for (const sd of model.sectionDefs.values()) sections.set(sd.name, sd.originalName);
  for (const ref of model.libRefs) {
    if (ref.sectionName && ref.originalSectionName) sections.set(ref.sectionName, ref.originalSectionName);
  }
  if (sections.size === 0) {
    vscode.window.showInformationMessage("No `.LIB section` found in this file.");
    return;
  }

  const current = index.getManualScope(filePath);
  const items: (vscode.QuickPickItem & { section: string })[] = [];
  for (const [lower, orig] of sections) {
    items.push({
      label: orig,
      description: lower === current ? "$(check) active" : undefined,
      section: lower,
    });
  }
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Select active .LIB section for ${vscode.Uri.file(filePath).fsPath}`,
  });
  if (picked) {
    index.setManualScope(filePath, picked.section);
    vscode.window.setStatusBarMessage(`SPICE scope: ${picked.label}`, 4000);
  }
}

/** Clear the manual scope override for the active file. */
function clearScopeCommand(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const filePath = uriToPath(editor.document.uri);
  index.clearManualScope(filePath);
  vscode.window.setStatusBarMessage("SPICE scope: auto", 3000);
}

// ── Document change / reindex orchestration ────────────────────────────────

function onDocumentChanged(doc: vscode.TextDocument): void {
  if (doc.languageId !== "spice" || doc.uri.scheme !== "file") return;
  const filePath = uriToPath(doc.uri);
  const existing = reindexTimers.get(filePath);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    reindexTimers.delete(filePath);
    const oldIncludes = index.transitiveIncludes(filePath);
    const openPaths = new Set(vscode.workspace.textDocuments.filter(d => d.uri.scheme === "file").map(d => uriToPath(d.uri)));
    index.indexWithIncludes(filePath, doc.getText());
    const newIncludes = index.transitiveIncludes(filePath);
    // Drop disk-cached includes that are no longer reachable and not open.
    for (const old of oldIncludes) {
      if (!newIncludes.has(old) && !openPaths.has(old)) {
        index.invalidate(old);
      }
    }
    publishDiagnostics(doc);
  }, DEBOUNCE_MS);
  reindexTimers.set(filePath, timer);
}

function publishDiagnostics(doc: vscode.TextDocument): void {
  const filePath = uriToPath(doc.uri);
  const model = index.getModel(filePath);
  if (!model) {
    diagnosticCollection.delete(doc.uri);
    return;
  }
  const diagnostics: vscode.Diagnostic[] = [];
  for (const inst of model.xInstances) {
    const def = index.findSubcktOrModel(inst.subcktName);
    if (!def) {
      diagnostics.push(
        new vscode.Diagnostic(
          toRange(doc, inst.subcktNameRange),
          `Unknown subcircuit: '${inst.originalSubcktName}'`,
          vscode.DiagnosticSeverity.Warning,
        ),
      );
    } else if (isSubckt(def) && inst.nodes.length !== def.ports.length) {
      diagnostics.push(
        new vscode.Diagnostic(
          toRange(doc, inst.nameRange),
          `Port count mismatch: '${inst.originalSubcktName}' expects ${def.ports.length} port(s), got ${inst.nodes.length}`,
          vscode.DiagnosticSeverity.Warning,
        ),
      );
    }
  }
  diagnosticCollection.set(doc.uri, diagnostics);
}

function isSubckt(def: { kind: string }): def is SubcktDef {
  return def.kind === "subckt";
}

// ── Coordinate conversion ──────────────────────────────────────────────────

function uriToPath(target: vscode.Uri): string {
  return target.fsPath;
}

function toPos(doc: vscode.TextDocument, p: Pos): vscode.Position {
  return new vscode.Position(clampLine(doc, p.line), p.character);
}

function clampLine(doc: vscode.TextDocument, line: number): number {
  return Math.max(0, Math.min(line, Math.max(0, doc.lineCount - 1)));
}

function toRange(doc: vscode.TextDocument, r: Range): vscode.Range {
  return new vscode.Range(toPos(doc, r.start), toPos(doc, r.end));
}

function toLocation(doc: vscode.TextDocument, r: Range): vscode.Location {
  return new vscode.Location(doc.uri, toRange(doc, r));
}

/** Build a Location pointing into a (possibly different) file on disk. */
function locationForFile(filePath: string, r: Range): vscode.Location | undefined {
  const target = vscode.Uri.file(filePath);
  const targetDoc = vscode.workspace.textDocuments.find((d) => uriToPath(d.uri) === filePath);
  if (targetDoc) {
    return new vscode.Location(targetDoc.uri, toRange(targetDoc, r));
  }
  // File not open: synthesize a zero-width range at the start. VS Code opens the file on navigate.
  return new vscode.Location(target, new vscode.Range(r.start.line, r.start.character, r.start.line, r.start.character));
}

// ── Providers ──────────────────────────────────────────────────────────────

class SpiceDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(doc: vscode.TextDocument): vscode.DocumentSymbol[] {
    const model = index.getModel(uriToPath(doc.uri));
    if (!model) return [];
    const symbols: vscode.DocumentSymbol[] = [];

    // Group model/subckt/param symbols by their containing `.LIB section`.
    // Map defs to symbol builders.
    const buildSubckt = (def: SubcktDef): vscode.DocumentSymbol =>
      new vscode.DocumentSymbol(def.originalName, "subckt", vscode.SymbolKind.Module, toRange(doc, def.range), toRange(doc, def.nameRange));
    const buildModel = (def: ModelDef): vscode.DocumentSymbol =>
      new vscode.DocumentSymbol(def.originalName, def.modelType, vscode.SymbolKind.Class, toRange(doc, def.range), toRange(doc, def.nameRange));
    const buildParam = (def: ParamDef): vscode.DocumentSymbol =>
      new vscode.DocumentSymbol(def.originalName, def.valueExpr, vscode.SymbolKind.Variable, toRange(doc, def.range), toRange(doc, def.nameRange));

    // Collect each section's children. Use range-overlap to decide membership.
    // The parser already tags defs with `section` (lowercased name) when inside one.
    const sectionChildren = new Map<string, vscode.DocumentSymbol[]>();
    const topChildren: vscode.DocumentSymbol[] = [];

    const bucket = (sectionName: string | undefined): vscode.DocumentSymbol[] => {
      if (!sectionName) return topChildren;
      let arr = sectionChildren.get(sectionName);
      if (!arr) { arr = []; sectionChildren.set(sectionName, arr); }
      return arr;
    };

    for (const def of model.subcktDefs.values()) bucket(def.section).push(buildSubckt(def));
    for (const def of model.modelDefs.values()) bucket(def.section).push(buildModel(def));
    for (const arr of model.paramDefs.values()) for (const def of arr) bucket(def.section).push(buildParam(def));

    // Section nodes first (with their children), then top-level symbols.
    for (const sec of model.sectionDefs.values()) {
      const node = new vscode.DocumentSymbol(
        sec.originalName,
        "LIB section",
        vscode.SymbolKind.Namespace,
        toRange(doc, sec.range),
        toRange(doc, sec.nameRange),
      );
      const children = sectionChildren.get(sec.name) ?? [];
      // DocumentSymbol.children is read-only via constructor; assign via splice.
      node.children.splice(0, node.children.length, ...children);
      symbols.push(node);
    }
    symbols.push(...topChildren);
    return symbols;
  }
}

class SpiceDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(doc: vscode.TextDocument, pos: vscode.Position): vscode.ProviderResult<vscode.Definition> {
    const filePath = uriToPath(doc.uri);
    const model = index.getModel(filePath);
    if (!model) return null;
    const hit = tokenAtPosition(model, { line: pos.line, character: pos.character });

    // Resolve locations for a list of (filePath, range) defs, scoped to the
    // active section when determinable. When ambiguous, returns ALL so VS Code
    // shows its native Peek picker.
    const locate = (locs: { filePath: string; range: Range }[]): vscode.Location[] =>
      locs.map((l) => locationForFile(l.filePath, l.range)).filter((l): l is vscode.Location => !!l);

    if (!hit) {
      // Universal fallback: identifier under cursor → param/subckt/model lookup.
      // Use the parser's boundary rule instead of VS Code's broad word fallback,
      // so expression operators such as `-` never become part of the lookup name.
      const line = doc.lineAt(pos.line).text;
      const word = identifierAtText(line, pos.character);
      if (!word) return null;
      const pd = index.findParamDefs(word);
      if (pd.length) return locate(scopedDefs(pd, filePath));
      const def = index.findSubcktOrModel(word);
      return def ? locate([def]) : null;
    }

    switch (hit.kind) {
      case "subcktRef": {
        const all = index.findAllSubcktDefs(hit.subcktName);
        if (all.length) return locate(scopedDefs(all, filePath));
        const m = index.findModel(hit.subcktName);
        return m ? locate([m]) : null;
      }
      case "modelRef": {
        const all = index.findAllModelDefs(hit.modelName);
        if (all.length) return locate(scopedDefs(all, filePath));
        const s = index.findSubckt(hit.modelName);
        return s ? locate([s]) : null;
      }
      case "subcktDef": {
        const all = index.findAllSubcktDefs(hit.subcktName);
        return locate(scopedDefs(all, filePath));
      }
      case "modelDef": {
        const all = index.findAllModelDefs(hit.modelName);
        return locate(scopedDefs(all, filePath));
      }
      case "paramDef":
        return locate([hit.paramDef]);
      case "paramRef": {
        const all = index.findParamDefs(hit.name);
        return locate(scopedDefs(all, filePath));
      }
      case "sectionDef": {
        const sd = index.findSectionDef(hit.sectionName, filePath);
        return sd ? locate([sd]) : null;
      }
      case "libRefSection": {
        const sd = index.findSectionDef(hit.sectionName, filePath);
        return sd ? locate([sd]) : null;
      }
      case "libRefPath": {
        const resolved = resolveInclude(hit.path, filePath);
        return new vscode.Location(vscode.Uri.file(resolved), new vscode.Position(0, 0));
      }
      case "nodeInXInstance": {
        const def = index.findSubckt(hit.instance.subcktName);
        if (!def) return null;
        const port = def.ports[hit.nodeIndex];
        return port ? locate([{ filePath: def.filePath, range: port.range }]) : null;
      }
      case "nodeInDevice":
        return null;
      case "includeDirective": {
        const resolved = resolveInclude(hit.path, filePath);
        return new vscode.Location(vscode.Uri.file(resolved), new vscode.Position(0, 0));
      }
    }
    return null;
  }
}

/**
 * Filter a multi-definition list by the active section scope. If the scope is
 * determined, keep only defs in that section (fall back to all if none match).
 * If undetermined, return all defs so the user can pick via Peek.
 */
function scopedDefs<T extends { section?: string; filePath: string; range: Range }>(
  defs: T[],
  filePath: string,
): T[] {
  if (defs.length <= 1) return defs;
  const scope = index.resolveScope(filePath);
  if (scope.determined && scope.section) {
    const inScope = defs.filter((d) => (d.section ?? "").toLowerCase() === scope.section);
    if (inScope.length > 0) return inScope;
  }
  return defs; // ambiguous → return all, let Peek choose
}

class SpiceHoverProvider implements vscode.HoverProvider {
  provideHover(doc: vscode.TextDocument, pos: vscode.Position): vscode.Hover | undefined {
    const filePath = uriToPath(doc.uri);
    const model = index.getModel(filePath);
    if (!model) return undefined;
    const hit = tokenAtPosition(model, { line: pos.line, character: pos.character });
    if (!hit) return undefined;
    const range = doc.getWordRangeAtPosition(pos) ?? new vscode.Range(pos, pos);

    switch (hit.kind) {
      case "subcktRef":
      case "subcktDef": {
        const def = index.findSubckt(hit.subcktName);
        if (!def) return undefined;
        const n = def.ports.length;
        return mkHover(
          `**subckt** \`${def.originalName}\` — ${n} port${n !== 1 ? "s" : ""}\n\nPorts: ${formatPorts(def)}`,
          range,
        );
      }
      case "modelRef":
      case "modelDef": {
        const def = index.findModel(hit.modelName);
        if (!def) return undefined;
        return mkHover(`**model** \`${def.originalName}\`  —  type: \`${def.modelType}\``, range);
      }
      case "nodeInXInstance": {
        const def = index.findSubckt(hit.instance.subcktName);
        if (!def) return undefined;
        const port = def.ports[hit.nodeIndex];
        const portName = port?.originalName ?? `port${hit.nodeIndex + 1}`;
        return mkHover(`\`${portName}\``, range);
      }
      case "nodeInDevice": {
        const terminals = SPECTRE_TERMINALS[hit.instance.deviceType] ?? DEVICE_TERMINALS[hit.instance.deviceType];
        const termLabel = terminals?.[hit.nodeIndex] ?? `term${hit.nodeIndex + 1}`;
        return mkHover(`\`${termLabel}\``, range);
      }
      case "paramDef":
      case "paramRef": {
        const all = index.findParamDefs(hit.kind === "paramDef" ? hit.paramDef.name : hit.name);
        if (all.length === 0) return undefined;
        const scope = index.resolveScope(filePath);
        const shown = scope.determined && scope.section
          ? all.filter((d) => (d.section ?? "").toLowerCase() === scope.section)
          : all;
        const list = (shown.length ? shown : all);
        if (list.length === 1) {
          const d = list[0];
          return mkHover(`**param** \`${d.originalName}\` = \`${d.valueExpr}\`${d.section ? `  *(section \`${d.section}\`)*` : ""}`, range);
        }
        const lines = list.map((d) => `- \`${d.valueExpr}\`${d.section ? ` *(section \`${d.section}\`)*` : ""}`);
        return mkHover(`**param** \`${hit.kind === "paramDef" ? hit.paramDef.originalName : hit.name}\` — ${list.length} definitions (F12 to choose):\n${lines.join("\n")}`, range);
      }
      case "sectionDef":
      case "libRefSection": {
        const sd = index.findSectionDef(hit.sectionName, filePath);
        if (!sd) return undefined;
        return mkHover(`**LIB section** \`${sd.originalName}\``, range);
      }
      case "libRefPath": {
        const ref = model.libRefs.find((r) => containsPosition(r.pathRange, { line: pos.line, character: pos.character }));
        if (!ref) return undefined;
        const envVar = envVarAtIndex(ref.path, pos.character - ref.pathRange.start.character);
        if (!envVar) return undefined;
        const value = process.env[envVar];
        return mkHover(
          value !== undefined ? `\`$${envVar}\` = \`${value}\`` : `\`$${envVar}\` *(not set)*`,
          range,
        );
      }
      case "includeDirective": {
        const inc = model.includes.find((i) => containsPosition(i.pathRange, { line: pos.line, character: pos.character }));
        if (!inc) return undefined;
        const envVar = envVarAtIndex(inc.path, pos.character - inc.pathRange.start.character);
        if (!envVar) return undefined;
        const value = process.env[envVar];
        return mkHover(
          value !== undefined ? `\`$${envVar}\` = \`${value}\`` : `\`$${envVar}\` *(not set)*`,
          range,
        );
      }
    }
    return undefined;
  }
}

class SpiceReferenceProvider implements vscode.ReferenceProvider {
  provideReferences(doc: vscode.TextDocument, pos: vscode.Position): vscode.Location[] {
    const filePath = uriToPath(doc.uri);
    const model = index.getModel(filePath);
    if (!model) return [];
    const hit = tokenAtPosition(model, { line: pos.line, character: pos.character });
    if (!hit) return [];
    switch (hit.kind) {
      case "subcktDef":
      case "subcktRef":
      case "nodeInXInstance": {
        const name = hit.kind === "nodeInXInstance" ? hit.instance.subcktName : hit.subcktName;
        const def = index.findSubckt(name);
        const defLoc = def ? locationForFile(def.filePath, def.nameRange) : undefined;
        const instLocs = index.findXInstances(name).map((inst) => locationForFile(inst.filePath, inst.nameRange));
        return [defLoc, ...instLocs].filter((l): l is vscode.Location => !!l);
      }
      case "modelDef":
      case "modelRef": {
        const def = index.findModel(hit.modelName);
        const defLoc = def ? locationForFile(def.filePath, def.nameRange) : undefined;
        const devLocs = index
          .findDevicesByModel(hit.modelName)
          .map((dev) => locationForFile(dev.filePath, dev.modelNameRange ?? dev.nameRange));
        return [defLoc, ...devLocs].filter((l): l is vscode.Location => !!l);
      }
      case "paramDef":
      case "paramRef": {
        const name = hit.kind === "paramDef" ? hit.paramDef.name : hit.name;
        const defLocs = index.findParamDefs(name).map((d) => locationForFile(d.filePath, d.nameRange));
        const refLocs = index
          .findParamRefs(name)
          .map((r) => locationForFile(r.filePath, r.range));
        return [...defLocs, ...refLocs].filter((l): l is vscode.Location => !!l);
      }
      default:
        return [];
    }
  }
}

class SpiceDocumentLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(doc: vscode.TextDocument): vscode.DocumentLink[] {
    const model = index.getModel(uriToPath(doc.uri));
    if (!model) return [];
    const filePath = uriToPath(doc.uri);
    const links: vscode.DocumentLink[] = [];
    for (const inc of model.includes) {
      const resolved = resolveInclude(inc.path, filePath);
      const link = new vscode.DocumentLink(toRange(doc, inc.pathRange), vscode.Uri.file(resolved).with({ scheme: "file" }));
      link.tooltip = `Open ${resolved}`;
      links.push(link);
    }
    // `.lib 'file' section` path → clickable link to the included file.
    for (const ref of model.libRefs) {
      const resolved = resolveInclude(ref.path, filePath);
      const link = new vscode.DocumentLink(toRange(doc, ref.pathRange), vscode.Uri.file(resolved).with({ scheme: "file" }));
      link.tooltip = `Open ${resolved}`;
      links.push(link);
    }
    return links;
  }
}

// ── Small helpers ──────────────────────────────────────────────────────────

function formatPorts(def: SubcktDef): string {
  if (def.ports.length === 0) return "*(none)*";
  const names = def.ports.map((p) => `\`${p.originalName}\``);
  if (names.length <= 10) return names.join(" ");
  return [...names.slice(0, 7), "…", ...names.slice(-2)].join(" ");
}

function envVarAtIndex(p: string, charIdx: number): string | undefined {
  const re = /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p)) !== null) {
    if (charIdx >= m.index && charIdx < m.index + m[0].length) {
      return m[1] ?? m[2];
    }
  }
  return undefined;
}

/** Thin wrapper that builds a Markdown hover. */
function mkHover(md: string, range: vscode.Range): vscode.Hover {
  return new vscode.Hover(new vscode.MarkdownString(md), range);
}
