// HSPICE netlist parser.
// Ported (simplified, HSPICE-only) from vladimir-aptekar/hspice-intellisense (MIT).
// Spectre branches, simulator-lang switching and case-sensitivity toggles removed;
// HSPICE semantics assumed (case-insensitive names, `+` continuation, `$`/`;` inline comments).

/** 0-based position aligned with VS Code's `line`/`character`. */
export interface Pos {
  line: number;
  character: number;
}

/** Half-open range [start, end). */
export interface Range {
  start: Pos;
  end: Pos;
}

export type TokenType = "dot-command" | "param" | "number" | "identifier" | "string";

export interface Token {
  text: string; // normalised (lowercased) for lookups
  originalText: string;
  line: number; // physical line index (0-based)
  character: number; // column on that physical line (0-based)
  type: TokenType;
  paramKey?: string;
  paramValue?: string;
}

export interface Port {
  name: string; // lowercased
  originalName: string;
  index: number;
  range: Range;
}

export interface SubcktDef {
  kind: "subckt";
  name: string;
  originalName: string;
  ports: Port[];
  range: Range; // header line range (start) .. `.ENDS` (end)
  nameRange: Range;
  filePath: string;
  /** Containing `.LIB section` name, if defined inside one. Lowercased. */
  section?: string;
}

export interface ModelDef {
  kind: "model";
  name: string;
  originalName: string;
  modelType: string;
  range: Range;
  nameRange: Range;
  filePath: string;
  /** Containing `.LIB section` name, if defined inside one. Lowercased. */
  section?: string;
  /** Parameter names referenced inside this model card's `'...'` expressions. */
  exprVarRefs?: string[];
}

export interface IncludeRef {
  path: string;
  pathRange: Range;
  range: Range;
  filePath: string;
}

/** `.param` variable definition. */
export interface ParamDef {
  kind: "param";
  name: string; // lowercased
  originalName: string;
  /** Raw value text (expression or literal), without surrounding quotes. */
  valueExpr: string;
  valueRange: Range;
  range: Range;
  nameRange: Range;
  filePath: string;
  /** Containing `.LIB section` name, if defined inside one. Lowercased. */
  section?: string;
  /** Parameter names referenced inside valueExpr. */
  varRefs?: string[];
}

/** `.LIB name` ... `.ENDL name` section definition. */
export interface SectionDef {
  kind: "section";
  name: string; // lowercased
  originalName: string;
  range: Range;
  nameRange: Range;
  filePath: string;
}

/** `.lib 'file' section` file+section reference (HSPICE library include). */
export interface LibRef {
  kind: "libref";
  path: string;
  sectionName?: string; // lowercased
  originalSectionName?: string;
  pathRange: Range;
  sectionRange?: Range;
  range: Range;
  filePath: string;
}

export interface XInstance {
  kind: "xinstance";
  instanceName: string;
  originalInstanceName: string;
  subcktName: string;
  originalSubcktName: string;
  nodes: string[];
  nodeRanges: Range[];
  params: Map<string, string>;
  range: Range;
  nameRange: Range;
  subcktNameRange: Range;
  filePath: string;
}

export interface DeviceInstance {
  kind: "device";
  instanceName: string;
  originalInstanceName: string;
  deviceType: string;
  modelName?: string;
  modelNameRange?: Range;
  nodes: string[];
  nodeRanges: Range[];
  params: Map<string, string>;
  range: Range;
  nameRange: Range;
  filePath: string;
}

export interface FileModel {
  filePath: string;
  subcktDefs: Map<string, SubcktDef>;
  modelDefs: Map<string, ModelDef>;
  xInstances: XInstance[];
  deviceInstances: DeviceInstance[];
  includes: IncludeRef[];
  /** `.param` definitions, keyed by lowercased name (multiple per key across sections). */
  paramDefs: Map<string, ParamDef[]>;
  /** `.LIB section` definitions in this file, keyed by lowercased name. */
  sectionDefs: Map<string, SectionDef>;
  /** `.lib 'file' section` references in this file. */
  libRefs: LibRef[];
}

export type Definition = SubcktDef | ModelDef | ParamDef | SectionDef;

// ── Preprocessing ──────────────────────────────────────────────────────────

interface LogicalLine {
  text: string; // joined, comment-stripped, trimmed
  lineNumber: number; // first physical line index (0-based)
  physicalLines: string[]; // raw physical lines that compose this statement
}

/** Strip HSPICE inline comment (`$` or `;`) outside of quotes. */
function stripInlineComment(line: string): string {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (!inQuote && (ch === "$" || ch === ";")) {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Split raw source into logical statements: join `+` continuations, strip
 * inline comments, drop blank and `*` full-line comments. HSPICE only.
 */
export function preprocess(source: string): LogicalLine[] {
  const physical = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const result: LogicalLine[] = [];
  let i = 0;
  while (i < physical.length) {
    const raw = physical[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("*")) {
      i++;
      continue;
    }
    const startLineIdx = i;
    const physLines = [raw];
    let joined = stripInlineComment(raw).trim();
    i++;
    while (i < physical.length) {
      const nextRaw = physical[i];
      if (nextRaw.trim().startsWith("+")) {
        physLines.push(nextRaw);
        const afterPlus = stripInlineComment(nextRaw).trimStart().slice(1).trim();
        joined += " " + afterPlus;
        i++;
      } else {
        break;
      }
    }
    result.push({ text: joined, lineNumber: startLineIdx, physicalLines: physLines });
  }
  return result;
}

// ── Tokenizing ─────────────────────────────────────────────────────────────

function classifyToken(raw: string, line: number, character: number): Token {
  const lower = raw.toLowerCase();
  if (raw.startsWith(".")) {
    return { text: lower, originalText: raw, line, character, type: "dot-command" };
  }
  const eqIdx = raw.indexOf("=");
  if (eqIdx > 0 && eqIdx < raw.length - 1) {
    return {
      text: lower,
      originalText: raw,
      line,
      character,
      type: "param",
      paramKey: raw.slice(0, eqIdx).toLowerCase(),
      paramValue: raw.slice(eqIdx + 1).toLowerCase(),
    };
  }
  if (/^[0-9]/.test(raw) || /^[+\-][0-9]/.test(raw)) {
    return { text: lower, originalText: raw, line, character, type: "number" };
  }
  return { text: lower, originalText: raw, line, character, type: "identifier" };
}

/** Tokenize a logical line across its physical lines (handles `+` prefix on continuation lines). */
export function tokenize(ll: LogicalLine): Token[] {
  const tokens: Token[] = [];
  for (let physIdx = 0; physIdx < ll.physicalLines.length; physIdx++) {
    const physLine = ll.physicalLines[physIdx];
    const lineNum = ll.lineNumber + physIdx;
    const stripped = stripInlineComment(physLine);
    let pos = 0;
    if (physIdx > 0) {
      while (pos < stripped.length && /\s/.test(stripped[pos])) pos++;
      if (pos < stripped.length && stripped[pos] === "+") pos++;
    }
    while (pos < stripped.length) {
      if (/\s/.test(stripped[pos])) {
        pos++;
        continue;
      }
      const tokenStart = pos;
      if (stripped[pos] === '"' || stripped[pos] === "'") {
        const quote = stripped[pos];
        pos++;
        while (pos < stripped.length && stripped[pos] !== quote) pos++;
        if (pos < stripped.length) pos++;
        const raw = stripped.slice(tokenStart, pos);
        tokens.push({
          text: raw.slice(1, raw.endsWith(quote) ? -1 : undefined).toLowerCase(),
          originalText: raw,
          line: lineNum,
          character: tokenStart,
          type: "string",
        });
      } else {
        while (pos < stripped.length && !/\s/.test(stripped[pos])) pos++;
        const raw = stripped.slice(tokenStart, pos);
        tokens.push(classifyToken(raw, lineNum, tokenStart));
      }
    }
  }
  return tokens;
}

// ── Range helpers ──────────────────────────────────────────────────────────

function tokenRange(tok: Token): Range {
  return {
    start: { line: tok.line, character: tok.character },
    end: { line: tok.line, character: tok.character + tok.originalText.length },
  };
}

function lineStart(ll: LogicalLine): Pos {
  return { line: ll.lineNumber, character: 0 };
}

function llEnd(ll: LogicalLine): Pos {
  const lastPhys = ll.physicalLines[ll.physicalLines.length - 1];
  return { line: ll.lineNumber + ll.physicalLines.length - 1, character: lastPhys.length };
}

/** Positional tokens (exclude `key=value` params). */
function positional(tokens: Token[]): Token[] {
  return tokens.filter((t) => t.type !== "param");
}

function extractParams(tokens: Token[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of tokens) {
    if (t.type === "param" && t.paramKey !== undefined && t.paramValue !== undefined) {
      map.set(t.paramKey, t.paramValue);
    }
  }
  return map;
}

function rawPathText(tok: Token): string {
  if (tok.type === "string") {
    const s = tok.originalText;
    return s.length >= 2 ? s.slice(1, -1) : s;
  }
  return tok.originalText;
}

// ── Device tables ──────────────────────────────────────────────────────────

/** Number of positional nodes consumed by each HSPICE device letter. */
const DEVICE_NODE_COUNTS: Record<string, number> = {
  r: 2, c: 2, l: 2, m: 4, q: 3, d: 2,
  v: 2, i: 2, e: 4, g: 4, f: 2, h: 2,
  b: 2, t: 4, u: 2, w: 2, z: 2,
};

const DEVICE_TYPES = new Set(Object.keys(DEVICE_NODE_COUNTS));

/** Devices whose token after the node list is a model reference. */
const MODELED_DEVICES = new Set(["m", "q", "d"]);

// ── Instance parsers ───────────────────────────────────────────────────────

function parseXInstance(ll: LogicalLine, tokens: Token[], filePath: string): XInstance | null {
  if (tokens.length < 3) return null;
  const instanceTok = tokens[0];
  const rest = tokens.slice(1);
  const posToks = positional(rest);
  if (posToks.length < 2) return null;
  const subcktTok = posToks[posToks.length - 1];
  const nodeToks = posToks.slice(0, -1);
  return {
    kind: "xinstance",
    instanceName: instanceTok.text,
    originalInstanceName: instanceTok.originalText,
    subcktName: subcktTok.text,
    originalSubcktName: subcktTok.originalText,
    nodes: nodeToks.map((t) => t.text),
    nodeRanges: nodeToks.map(tokenRange),
    params: extractParams(rest),
    range: { start: lineStart(ll), end: llEnd(ll) },
    nameRange: tokenRange(instanceTok),
    subcktNameRange: tokenRange(subcktTok),
    filePath,
  };
}

function parseDeviceInstance(ll: LogicalLine, tokens: Token[], filePath: string): DeviceInstance | null {
  if (tokens.length < 2) return null;
  const instanceTok = tokens[0];
  const devType = instanceTok.text[0];
  const rest = tokens.slice(1);
  const posToks = positional(rest);
  const nodeCount = DEVICE_NODE_COUNTS[devType] ?? 2;
  const nodeToks = posToks.slice(0, nodeCount);
  let modelName: string | undefined;
  let modelNameRange: Range | undefined;
  if (MODELED_DEVICES.has(devType)) {
    const modelTok = posToks[nodeCount];
    if (modelTok && modelTok.type === "identifier") {
      modelName = modelTok.text;
      modelNameRange = tokenRange(modelTok);
    }
  }
  return {
    kind: "device",
    instanceName: instanceTok.text,
    originalInstanceName: instanceTok.originalText,
    deviceType: devType,
    modelName,
    modelNameRange,
    nodes: nodeToks.map((t) => t.text),
    nodeRanges: nodeToks.map(tokenRange),
    params: extractParams(rest),
    range: { start: lineStart(ll), end: llEnd(ll) },
    nameRange: tokenRange(instanceTok),
    filePath,
  };
}

// ── File parser ────────────────────────────────────────────────────────────

export interface ParseOptions {
  /** Device type letters (lowercase) whose instances are stored. Defaults to low-volume types. */
  indexedDeviceTypes?: Set<string>;
  /** X-instances with this many nodes or fewer are skipped. Default 4. */
  minXInstanceNodes?: number;
}

export function emptyFileModel(filePath: string): FileModel {
  return {
    filePath,
    subcktDefs: new Map(),
    modelDefs: new Map(),
    xInstances: [],
    deviceInstances: [],
    includes: [],
    paramDefs: new Map(),
    sectionDefs: new Map(),
    libRefs: [],
  };
}

/** HSPICE built-in / measurement functions whose names must not count as variable refs. */
const HSPICE_BUILTIN_FUNCS = new Set([
  "abs", "max", "min", "pwr", "sqrt", "log", "exp", "tanh", "cosh", "sinh", "sin", "cos", "tan",
  "int", "nint", "agauss", "gauss", "unif", "aunif", "limit", "table", "poly",
  // node voltage / current / source references (always called as v(...), i(...))
  "v", "i", "vr", "ir", "curr", "volt", "pwr_src",
]);

/**
 * Extract variable references from an expression string. Identifiers immediately
 * followed by `(` are treated as function calls and skipped. Built-in functions
 * are also filtered. Returns lowercased unique names.
 */
export function extractVarRefs(expr: string): string[] {
  const out = new Set<string>();
  // Match identifiers; capture the char right after to detect function calls.
  const re = /([A-Za-z_]\w*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr)) !== null) {
    const name = m[1];
    const afterIdx = m.index + name.length;
    const after = expr[afterIdx];
    if (after === "(") continue; // function call
    if (HSPICE_BUILTIN_FUNCS.has(name.toLowerCase())) continue;
    out.add(name.toLowerCase());
  }
  return [...out];
}

/**
 * Parse a `.param` logical line into ParamDef entries. Scans the merged physical
 * text for `name = value` pairs, tolerating `=` with surrounding spaces and quoted
 * expressions. `value` extends until the next whitespace-separated pair (HSPICE
 * values contain no bare spaces unless quoted, and quotes are consumed here).
 */
function parseParamDefs(ll: LogicalLine, filePath: string, section: string | undefined): ParamDef[] {
  const defs: ParamDef[] = [];
  // Work on the joined text but track positions against physical lines for ranges.
  const joined = ll.text;
  // `name = value` where value is either a quoted '...' / "..." span or a bare token (no spaces).
  const pairRe = /([A-Za-z_]\w*)\s*=\s*('([^']*)'|"([^"]*)"|([^\s'"]+))/g;
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(joined)) !== null) {
    const nameOriginal = m[1];
    const valueOriginal = m[3] ?? m[4] ?? m[5] ?? "";
    const nameStart = m.index;
    const nameEnd = nameStart + nameOriginal.length;
    // value span starts after `name<ws>=<ws>`; m[2] is the full value token.
    const valFullStart = m.index + m[0].length - m[2].length;
    const valFullEnd = m.index + m[0].length;
    const nameRange = offsetRange(ll, nameStart, nameEnd);
    const valueRange = offsetRange(ll, valFullStart, valFullEnd);
    if (!nameRange || !valueRange) continue;
    defs.push({
      kind: "param",
      name: nameOriginal.toLowerCase(),
      originalName: nameOriginal,
      valueExpr: valueOriginal,
      valueRange,
      range: { start: nameRange.start, end: valueRange.end },
      nameRange,
      filePath,
      section,
      varRefs: extractVarRefs(valueOriginal),
    });
  }
  return defs;
}

/** Collect variable references referenced inside a model card's `'...'` expressions. */
function collectModelVarRefs(tokens: Token[]): string[] {
  const out = new Set<string>();
  for (const t of tokens) {
    if (t.type === "string") {
      // string token originalText includes surrounding quotes
      const inner = t.originalText.length >= 2 ? t.originalText.slice(1, -1) : t.originalText;
      for (const v of extractVarRefs(inner)) out.add(v);
    } else if (t.type === "param" && t.paramValue !== undefined) {
      for (const v of extractVarRefs(t.paramValue)) out.add(v);
    }
  }
  return [...out];
}

/** Append a ParamDef to the file model's multi-map. */
function pushParamDef(model: FileModel, pd: ParamDef): void {
  const arr = model.paramDefs.get(pd.name);
  if (arr) arr.push(pd);
  else model.paramDefs.set(pd.name, [pd]);
}

/**
 * Map a [start, end) character offset range within a logical line's joined text
 * to a Range over (line, character). Splits across the physical lines that make
 * up the logical line. Returns undefined if the offset falls outside the line.
 */
function offsetRange(ll: LogicalLine, startOff: number, endOff: number): Range | undefined {
  // Build a map of cumulative char counts per physical line (joined text uses
  // single spaces between physical lines, matching preprocess output).
  // Walk physical lines, tracking offset, to translate global offset → (line, col).
  let off = 0;
  const segs: { line: number; colStart: number; textStart: number; textLen: number }[] = [];
  for (let i = 0; i < ll.physicalLines.length; i++) {
    const raw = ll.physicalLines[i];
    const stripped = stripInlineComment(raw);
    let txt: string;
    if (i === 0) {
      txt = stripped.trim();
    } else {
      let p = 0;
      while (p < stripped.length && /\s/.test(stripped[p])) p++;
      if (p < stripped.length && stripped[p] === "+") p++;
      txt = stripped.slice(p).trim();
    }
    // locate txt within raw to get column offset on the physical line
    const trimmedLeading = raw.indexOf(txt);
    const colStart = trimmedLeading < 0 ? 0 : trimmedLeading;
    segs.push({ line: ll.lineNumber + i, colStart, textStart: off, textLen: txt.length });
    off += txt.length + (i < ll.physicalLines.length - 1 ? 1 : 0); // +1 for join space
  }
  const findSeg = (o: number) => {
    for (const s of segs) {
      if (o >= s.textStart && o <= s.textStart + s.textLen) return s;
    }
    return segs[segs.length - 1];
  };
  const sSeg = findSeg(startOff);
  const eSeg = findSeg(endOff);
  if (!sSeg || !eSeg) return undefined;
  const startPos: Pos = { line: sSeg.line, character: sSeg.colStart + (startOff - sSeg.textStart) };
  const endPos: Pos = { line: eSeg.line, character: eSeg.colStart + (endOff - eSeg.textStart) };
  return { start: startPos, end: endPos };
}

/**
 * Parse HSPICE source text into a FileModel. Single pass; case-insensitive
 * (names lowercased for lookup, original case preserved for display).
 */
export function parseFile(filePath: string, source: string, opts: ParseOptions = {}): FileModel {
  // Device types whose instances are parsed and stored. Includes the modeled
  // devices (M/Q/D) so MOSFET/BJT/diode model names are navigable — the common
  // case where users wrap a primitive in a `.subckt` with parasitics. Pass a
  // smaller set via opts to save memory on very large industrial netlists.
  const indexedDeviceTypes = opts.indexedDeviceTypes ?? new Set(["m", "q", "d", "v", "i", "e", "g", "f", "h"]);
  // X-instances with this many nodes or fewer are skipped. Default 2: drops
  // degenerate ≤2-node lines while keeping the minimum MOSFET-subckt case
  // (3+ nodes — source/drain/gate, optionally bulk), which is the common
  // "wrap a primitive + parasitics into a callable device" pattern.
  const minXInstanceNodes = opts.minXInstanceNodes ?? 2;

  const model = emptyFileModel(filePath);
  const lines = preprocess(source);

  let openSubckt: SubcktDef | null = null;
  /** Stack of currently-open `.LIB section` definitions (innermost last). */
  const sectionStack: SectionDef[] = [];
  const currentSection = (): string | undefined =>
    sectionStack.length > 0 ? sectionStack[sectionStack.length - 1].name : undefined;

  for (const ll of lines) {
    const tokens = tokenize(ll);
    if (tokens.length === 0) continue;

    const first = tokens[0];

    if (first.text === ".end") break;

    if (first.text === ".subckt") {
      if (tokens.length < 2) continue;
      const nameTok = tokens[1];
      const portToks = positional(tokens.slice(2));
      const ports: Port[] = portToks.map((t, idx) => ({
        name: t.text,
        originalName: t.originalText,
        index: idx,
        range: tokenRange(t),
      }));
      openSubckt = {
        kind: "subckt",
        name: nameTok.text,
        originalName: nameTok.originalText,
        ports,
        range: { start: lineStart(ll), end: llEnd(ll) },
        nameRange: tokenRange(nameTok),
        filePath,
        section: currentSection(),
      };
      continue;
    }

    if (first.text === ".ends") {
      if (openSubckt) {
        openSubckt.range.end = llEnd(ll);
        model.subcktDefs.set(openSubckt.name, openSubckt);
        openSubckt = null;
      }
      continue;
    }

    if (first.text === ".model") {
      if (tokens.length < 3) continue;
      const nameTok = tokens[1];
      const typeTok = tokens[2];
      const def: ModelDef = {
        kind: "model",
        name: nameTok.text,
        originalName: nameTok.originalText,
        modelType: typeTok.text,
        range: { start: lineStart(ll), end: llEnd(ll) },
        nameRange: tokenRange(nameTok),
        filePath,
        section: currentSection(),
        exprVarRefs: collectModelVarRefs(tokens),
      };
      model.modelDefs.set(def.name, def);
      continue;
    }

    // `.param` variable definitions.
    if (first.text === ".param") {
      for (const pd of parseParamDefs(ll, filePath, currentSection())) {
        pushParamDef(model, pd);
      }
      continue;
    }

    // `.LIB` has two HSPICE forms:
    //   reference:  .lib 'filepath' section      (first token after .lib is a quoted string)
    //   definition: .LIB section ... .ENDL       (otherwise — opens a section block)
    if (first.text === ".lib") {
      const second = tokens[1];
      if (second && second.type === "string") {
        // Reference form: .lib 'file' [section]
        const pathRange = tokenRange(second);
        const third = tokens[2];
        const libRef: LibRef = {
          kind: "libref",
          path: rawPathText(second),
          pathRange,
          range: { start: lineStart(ll), end: llEnd(ll) },
          filePath,
        };
        if (third && third.type === "identifier") {
          libRef.sectionName = third.text;
          libRef.originalSectionName = third.originalText;
          libRef.sectionRange = tokenRange(third);
        }
        model.libRefs.push(libRef);
      } else if (second && second.type === "identifier") {
        // Definition form: .LIB section_name
        const sec: SectionDef = {
          kind: "section",
          name: second.text,
          originalName: second.originalText,
          range: { start: lineStart(ll), end: llEnd(ll) },
          nameRange: tokenRange(second),
          filePath,
        };
        sectionStack.push(sec);
      }
      continue;
    }

    if (first.text === ".endl") {
      const sec = sectionStack.pop();
      if (sec) {
        sec.range.end = llEnd(ll);
        model.sectionDefs.set(sec.name, sec);
      }
      continue;
    }

    if (first.text === ".include" || first.text === ".inc") {
      const pathTok = tokens.slice(1).find((t) => t.type === "string" || t.type === "identifier");
      if (pathTok) {
        model.includes.push({
          path: rawPathText(pathTok),
          pathRange: tokenRange(pathTok),
          range: { start: lineStart(ll), end: llEnd(ll) },
          filePath,
        });
      }
      continue;
    }

    // Instance statements: first token starts with a device letter.
    if (first.type === "identifier" && first.text.startsWith("x")) {
      const inst = parseXInstance(ll, tokens, filePath);
      if (inst && inst.nodes.length > minXInstanceNodes) {
        model.xInstances.push(inst);
      }
      continue;
    }

    if (first.type === "identifier") {
      const devType = first.text[0];
      if (DEVICE_TYPES.has(devType) && indexedDeviceTypes.has(devType)) {
        const inst = parseDeviceInstance(ll, tokens, filePath);
        if (inst) model.deviceInstances.push(inst);
      }
    }
  }

  // Unterminated `.SUBCKT`: keep it anyway so navigation still works.
  if (openSubckt) {
    model.subcktDefs.set(openSubckt.name, openSubckt);
  }
  // Unterminated `.LIB` sections: keep so navigation still works.
  for (const sec of sectionStack) {
    if (!model.sectionDefs.has(sec.name)) {
      model.sectionDefs.set(sec.name, sec);
    }
  }

  return model;
}

// ── Position queries ───────────────────────────────────────────────────────

export function containsPosition(range: Range, pos: Pos): boolean {
  const { start, end } = range;
  if (pos.line < start.line || pos.line > end.line) return false;
  if (pos.line === start.line && pos.character < start.character) return false;
  if (pos.line === end.line && pos.character >= end.character) return false;
  return true;
}

export type TokenHit =
  | { kind: "subcktDef"; subcktName: string }
  | { kind: "modelDef"; modelName: string }
  | { kind: "subcktRef"; subcktName: string }
  | { kind: "modelRef"; modelName: string }
  | { kind: "nodeInXInstance"; instance: XInstance; nodeIndex: number }
  | { kind: "nodeInDevice"; instance: DeviceInstance; nodeIndex: number }
  | { kind: "includeDirective"; path: string }
  | { kind: "libRefPath"; path: string }
  | { kind: "libRefSection"; sectionName: string; originalSectionName?: string }
  | { kind: "paramDef"; paramDef: ParamDef }
  | { kind: "paramRef"; name: string }
  | { kind: "sectionDef"; sectionName: string };

/** Determine what is under the cursor in a parsed file. */
export function tokenAtPosition(model: FileModel, pos: Pos): TokenHit | undefined {
  // 1. Exact symbol-definition name ranges.
  for (const def of model.subcktDefs.values()) {
    if (containsPosition(def.nameRange, pos)) {
      return { kind: "subcktDef", subcktName: def.name };
    }
  }
  for (const def of model.modelDefs.values()) {
    if (containsPosition(def.nameRange, pos)) {
      return { kind: "modelDef", modelName: def.name };
    }
  }
  for (const arr of model.paramDefs.values()) {
    for (const pd of arr) {
      if (containsPosition(pd.nameRange, pos)) {
        return { kind: "paramDef", paramDef: pd };
      }
    }
  }
  for (const def of model.sectionDefs.values()) {
    if (containsPosition(def.nameRange, pos)) {
      return { kind: "sectionDef", sectionName: def.name };
    }
  }

  // 2. Instance references.
  for (const inst of model.xInstances) {
    if (containsPosition(inst.nameRange, pos) || containsPosition(inst.subcktNameRange, pos)) {
      return { kind: "subcktRef", subcktName: inst.subcktName };
    }
    for (let i = 0; i < inst.nodeRanges.length; i++) {
      if (containsPosition(inst.nodeRanges[i], pos)) {
        return { kind: "nodeInXInstance", instance: inst, nodeIndex: i };
      }
    }
    if (containsPosition(inst.range, pos)) {
      return { kind: "subcktRef", subcktName: inst.subcktName };
    }
  }
  for (const dev of model.deviceInstances) {
    if (dev.modelNameRange && containsPosition(dev.modelNameRange, pos)) {
      return { kind: "modelRef", modelName: dev.modelName ?? "" };
    }
    for (let i = 0; i < dev.nodeRanges.length; i++) {
      if (containsPosition(dev.nodeRanges[i], pos)) {
        return { kind: "nodeInDevice", instance: dev, nodeIndex: i };
      }
    }
  }

  // 3. `.lib` reference: path click vs section-name click.
  for (const ref of model.libRefs) {
    if (containsPosition(ref.pathRange, pos)) {
      return { kind: "libRefPath", path: ref.path };
    }
    if (ref.sectionRange && containsPosition(ref.sectionRange, pos)) {
      return { kind: "libRefSection", sectionName: ref.sectionName ?? "", originalSectionName: ref.originalSectionName };
    }
  }
  for (const inc of model.includes) {
    if (containsPosition(inc.pathRange, pos)) {
      return { kind: "includeDirective", path: inc.path };
    }
  }

  // 4. Expression variable reference inside a param value (cursor on valueExpr).
  for (const arr of model.paramDefs.values()) {
    for (const pd of arr) {
      if (containsPosition(pd.valueRange, pos)) {
        const name = identifierAtOffset(pd.valueExpr, pos, pd.valueRange);
        if (name) return { kind: "paramRef", name: name.toLowerCase() };
      }
    }
  }
  return undefined;
}

/**
 * If the cursor sits on an identifier inside an expression value, return it.
 * `valueRange` is the (line,character) span of `expr`; we map the cursor column
 * to an offset within `expr` (single-line values only; multiline falls back).
 */
function identifierAtOffset(expr: string, pos: Pos, valueRange: Range): string | undefined {
  if (pos.line !== valueRange.start.line) return undefined;
  const off = pos.character - valueRange.start.character;
  if (off < 0 || off > expr.length) return undefined;
  // Scan identifiers in expr; return the one containing `off`.
  const re = /[A-Za-z_]\w*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr)) !== null) {
    if (off >= m.index && off <= m.index + m[1].length) {
      // skip if function call (next char is "(")
      if (expr[m.index + m[1].length] === "(") return undefined;
      return m[1];
    }
  }
  return undefined;
}
