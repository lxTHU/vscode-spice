// SPICE/HSPICE + Spectre netlist parser.
// Ported (simplified) from vladimir-aptekar/hspice-intellisense (MIT).
// Originally HSPICE-only; Spectre support added by extending the same single-pass
// parser (dialect tracked per logical line, so a file can mix HSPICE and Spectre
// segments via `simulator lang=` switching). HSPICE assumptions retained:
// case-insensitive name lookup, `+` continuation, `$`/`;`/`//` inline comments.
// Spectre adds: `//` comments, `{ }` block joining, parenthesised instance/subckt
// node lists, and bare (dot-less) keywords (subckt/model/parameters/section/...).

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
  /** Exact parameter references inside this model card's expressions. */
  exprRefs?: ExprRef[];
}

export interface ExprRef {
  name: string;
  range: Range;
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
  /** Exact parameter references inside valueExpr. */
  exprRefs?: ExprRef[];
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
  /** Parameter names referenced inside instance parameter expressions. */
  paramRefs?: ExprRef[];
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
  /** Parameter names referenced inside device parameter expressions. */
  paramRefs?: ExprRef[];
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
  /** `.func` / user function names (lowercased) — excluded from variable refs. */
  funcNames: Set<string>;
}

export type Definition = SubcktDef | ModelDef | ParamDef | SectionDef;

// ── Preprocessing ──────────────────────────────────────────────────────────

interface LogicalLine {
  text: string; // joined, comment-stripped, trimmed
  lineNumber: number; // first physical line index (0-based)
  physicalLines: string[]; // raw physical lines that compose this statement
  dialect: "hspice" | "spectre";
}

/** Strip inline comment (`$`/`;` HSPICE, `//` Spectre/both) outside of quotes. */
function stripInlineComment(line: string): string {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (!inQuote) {
      // `$` / `;` truncate to end of line (HSPICE); `//` truncates to end (Spectre/modern).
      if (ch === "$" || ch === ";") return line.slice(0, i);
      if (ch === "/" && line[i + 1] === "/") return line.slice(0, i);
    }
  }
  return line;
}

/**
 * If a logical line is a `simulator lang=spectre|spice` directive, return the
 * dialect it switches to; otherwise undefined. Tolerates spaces around `=`.
 */
function detectLangSwitch(joined: string): "hspice" | "spectre" | undefined {
  const m = /\bsimulator\s+lang\s*=\s*(\w+)/i.exec(joined);
  if (!m) return undefined;
  return m[1].toLowerCase() === "spectre" ? "spectre" : "hspice";
}

/**
 * Net change in `{` depth across `s` (ignoring quoted spans). Used incrementally
 * while joining continuation lines so we never re-scan the whole joined string.
 */
function braceDelta(s: string): number {
  let delta = 0;
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && ch === "{") delta++;
    else if (!inQuote && ch === "}") delta--;
  }
  return delta;
}

/**
 * Split raw source into logical statements: join `+` continuations, join open
 * `{ ... }` blocks, strip inline comments, drop blank and `*` full-line
 * comments. Each logical line is tagged with its dialect (hspice/spectre),
 * tracked per-line from `simulator lang=` directives (initial value from the
 * file extension).
 */
export function preprocess(source: string, filePath: string): LogicalLine[] {
  const physical = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const result: LogicalLine[] = [];
  let currentLang: "hspice" | "spectre" = /\.scs$/i.test(filePath) ? "spectre" : "hspice";
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
    let depth = braceDelta(joined);
    i++;
    // Join HSPICE `+` continuation lines.
    while (i < physical.length) {
      const nextRaw = physical[i];
      if (nextRaw.trim().startsWith("+")) {
        physLines.push(nextRaw);
        const afterPlus = stripInlineComment(nextRaw).trimStart().slice(1).trim();
        joined += " " + afterPlus;
        depth += braceDelta(afterPlus);
        i++;
      } else {
        break;
      }
    }
    // Join Spectre `{ ... }` block continuations (only while a `{` is still
    // open). Depth is tracked incrementally — we only scan each newly joined
    // line, never the growing `joined` whole, to stay O(n). A per-statement
    // line cap guards against a stray/unclosed `{` swallowing the whole file.
    let braceRun = 0;
    const BRACE_RUN_MAX = 4000;
    while (i < physical.length && depth > 0 && braceRun < BRACE_RUN_MAX) {
      const nextRaw = physical[i];
      physLines.push(nextRaw);
      const nxt = stripInlineComment(nextRaw).trim();
      joined += " " + nxt;
      depth += braceDelta(nxt);
      braceRun++;
      i++;
    }
    // Safety: if a `{` was never closed (malformed/truncated file), stop after
    // an unreasonably long run so one stray brace can't swallow the whole file.
    // (Reset depth to 0 if we hit EOF still open — handled by loop exit above.)
    // A `simulator lang=` directive updates dialect state but is not itself a
    // statement to index.
    const switched = detectLangSwitch(joined);
    if (switched) {
      currentLang = switched;
      continue;
    }
    result.push({ text: joined, lineNumber: startLineIdx, physicalLines: physLines, dialect: currentLang });
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
      // Parentheses are emitted as standalone identifier tokens so Spectre
      // `name ( nodes ) target` instance forms and `subckt NAME ( ports )`
      // definitions can be parsed positionally. Braces are plain separators.
      const ch = stripped[pos];
      if (ch === "(" || ch === ")") {
        tokens.push({ text: ch, originalText: ch, line: lineNum, character: pos, type: "identifier" });
        pos++;
        continue;
      }
      if (ch === "{" || ch === "}") {
        pos++;
        continue;
      }
      const tokenStart = pos;
      if (ch === '"' || ch === "'") {
        const quote = ch;
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
        while (pos < stripped.length && !/\s/.test(stripped[pos]) && "(){}".indexOf(stripped[pos]) < 0) pos++;
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

/** Whether a token is the standalone `(` or `)` emitted by the tokenizer. */
function isParen(tok: Token, which: "(" | ")"): boolean {
  return tok.type === "identifier" && tok.text === which;
}

/**
 * Collect positional tokens between the first `(` and its matching `)`.
 * Accepts identifiers and numbers (Spectre nodes/ports may be numeric, e.g. `1`).
 * Returns `{ inner, openIdx, closeIdx }` or undefined if no balanced parens.
 */
function tokensInsideParens(tokens: Token[]): { inner: Token[]; openIdx: number; closeIdx: number } | undefined {
  const openIdx = tokens.findIndex((t) => isParen(t, "("));
  if (openIdx < 0) return undefined;
  let depth = 0;
  for (let j = openIdx; j < tokens.length; j++) {
    if (isParen(tokens[j], "(")) depth++;
    else if (isParen(tokens[j], ")")) {
      depth--;
      if (depth === 0) {
        return { inner: positional(tokens.slice(openIdx + 1, j)), openIdx, closeIdx: j };
      }
    }
  }
  return undefined;
}

/** Extract subckt ports: HSPICE = positional tokens after the name; Spectre = inside `( )`. */
function extractPorts(tokens: Token[], isSpectre: boolean): Token[] {
  if (isSpectre) {
    const parens = tokensInsideParens(tokens);
    return parens ? parens.inner : [];
  }
  return positional(tokens);
}

/**
 * Match a statement head across dialects: HSPICE `.subckt` or Spectre `subckt`.
 * `first` is the leading token; returns true if it is the keyword in either form.
 */
function isHead(first: Token, keyword: string): boolean {
  return first.text === keyword || first.text === "." + keyword;
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

function singleLineRange(line: number, start: number, end: number): Range {
  return { start: { line, character: start }, end: { line, character: end } };
}

function paramTokenValueExpr(tok: Token): { expr: string; line: number; character: number } | undefined {
  if (tok.type !== "param") return undefined;
  const eqIdx = tok.originalText.indexOf("=");
  if (eqIdx <= 0 || eqIdx >= tok.originalText.length - 1) return undefined;
  let value = tok.originalText.slice(eqIdx + 1);
  let character = tok.character + eqIdx + 1;
  if (value.length >= 2 && ((value[0] === "'" && value[value.length - 1] === "'") || (value[0] === '"' && value[value.length - 1] === '"'))) {
    value = value.slice(1, -1);
    character++;
  }
  return { expr: value, line: tok.line, character };
}

function stringTokenValueExpr(tok: Token): { expr: string; line: number; character: number } | undefined {
  if (tok.type !== "string") return undefined;
  let value = tok.originalText;
  let character = tok.character;
  if (value.length >= 2 && ((value[0] === "'" && value[value.length - 1] === "'") || (value[0] === '"' && value[value.length - 1] === '"'))) {
    value = value.slice(1, -1);
    character++;
  }
  return { expr: value, line: tok.line, character };
}

function collectTokenExprRefs(tokens: Token[], extraFuncs?: Set<string>): ExprRef[] {
  const refs: ExprRef[] = [];
  for (const tok of tokens) {
    const info = paramTokenValueExpr(tok) ?? stringTokenValueExpr(tok);
    if (!info) continue;
    refs.push(
      ...collectExprRefs(
        info.expr,
        (start, end) => singleLineRange(info.line, info.character + start, info.character + end),
        extraFuncs,
      ),
    );
  }
  return refs;
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

/**
 * Spectre built-in primitive type names. An instance whose target token (after
 * the `( nodes )` list) matches one of these is a primitive device, NOT a
 * subckt/model reference — it has no Definition target and is stored as a
 * DeviceInstance without `modelName` so it never yields a spurious jump.
 * Deliberately a superset; safe to over-include.
 */
const PRIMITIVE_TYPES = new Set([
  "resistor", "res", "r", "capacitor", "cap", "c", "inductor", "ind", "l",
  "mutual", "mosfet", "mos", "bsim1", "bsim2", "bsim3", "bsim3v3", "bsim4",
  "bsim6", "bsimsoi", "bsimsoi1", "bsimsoi2", "bsimimg", "pdt", "ekv",
  "diode", "jed", "junction", "bjt", "bjt5", "bjt10", "hicum", "mextram",
  "jfet", "jfet2", "jfet3", "mesfet", "hfet", "hemt", "tfet", "feram",
  "isource", "vsource", "vcvs", "vccs", "ccvs", "cccs", "tline", "tlinedelay",
  "tlinesecond", "tline3", "msource", "port", "switch", "relay", "idealbalun",
  "spt", "filegen", "adsnet", "ntxline", "gyrator", "trline", "nullor",
]);

/**
 * Spectre statement keywords that should NOT be parsed as an instance even when
 * they lead a line as an identifier. Keeps `parseSpectreInstance` off control
 * statements (analysis, save/print, etc.).
 */
const SPECTRE_KEYWORDS = new Set([
  "subckt", "inline", "ends", "model", "parameters", "parameter", "include",
  "section", "endsection", "library", "endlibrary", "global", "statistics",
  "process", "mismatch", "connect", "options", "alter", "save", "saveall",
  "print", "plot", "info", "design", "assert", "if", "else", "endif", "end",
  "simulator", "temp", "nodeset", "ic", "ehdl", "ahdl", "func", "endl",
  // analysis statement heads
  "ac", "dc", "tran", "noise", "stb", "pss", "pac", "pnoise", "pdnoise",
  "pdisto", "pxf", "pspb", "envlp", "xf", "sens", "dcmatch", "acmatch",
  "disto", "fourier", "tdr", "montercarlo", "sweep",
]);

function isSpectreKeyword(text: string): boolean {
  return SPECTRE_KEYWORDS.has(text.toLowerCase());
}

// ── Instance parsers ───────────────────────────────────────────────────────

function parseXInstance(ll: LogicalLine, tokens: Token[], filePath: string, extraFuncs?: Set<string>): XInstance | null {
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
    paramRefs: collectTokenExprRefs(rest, extraFuncs),
    range: { start: lineStart(ll), end: llEnd(ll) },
    nameRange: tokenRange(instanceTok),
    subcktNameRange: tokenRange(subcktTok),
    filePath,
  };
}

function parseDeviceInstance(ll: LogicalLine, tokens: Token[], filePath: string, extraFuncs?: Set<string>): DeviceInstance | null {
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
    paramRefs: collectTokenExprRefs(rest, extraFuncs),
    range: { start: lineStart(ll), end: llEnd(ll) },
    nameRange: tokenRange(instanceTok),
    filePath,
  };
}

/**
 * Parse a Spectre instance: `instanceName ( nodes... ) targetName param=value ...`.
 * Unlike HSPICE (`Xname nodes subckt`), the target name follows the parenthesised
 * node list. The target is either a primitive type (resistor/mosfet/...), a model
 * name, or a subckt name. Primitives become a DeviceInstance without a model
 * reference (no jump target); models/subckts become an XInstance so the existing
 * subckt-or-model resolver handles Definition/Hover/References.
 */
function parseSpectreInstance(
  ll: LogicalLine,
  tokens: Token[],
  filePath: string,
  extraFuncs?: Set<string>,
): XInstance | DeviceInstance | null {
  const instanceTok = tokens[0];
  const parens = tokensInsideParens(tokens);
  if (!parens) return null;
  const nodeToks = parens.inner;
  // Target = first identifier/number after the closing `)`.
  const afterClose = tokens.slice(parens.closeIdx + 1);
  const targetTok = afterClose.find((t) => t.type === "identifier" || t.type === "number");
  if (!targetTok) return null;

  const instanceRange = { start: lineStart(ll), end: llEnd(ll) };
  const nameRange = tokenRange(instanceTok);
  const nodeRanges = nodeToks.map(tokenRange);
  const params = extractParams(afterClose);
  const paramRefs = collectTokenExprRefs(afterClose, extraFuncs);

  if (PRIMITIVE_TYPES.has(targetTok.text)) {
    // Primitive device: no Definition target. Do not set modelName(Range) so the
    // provider never treats the primitive type token as a navigable reference.
    return {
      kind: "device",
      instanceName: instanceTok.text,
      originalInstanceName: instanceTok.originalText,
      deviceType: targetTok.text,
      nodes: nodeToks.map((t) => t.text),
      nodeRanges,
      params,
      paramRefs,
      range: instanceRange,
      nameRange,
      filePath,
    };
  }

  // Model or subckt reference — store as an XInstance; findSubcktOrModel resolves
  // subckt-first-then-model, so the same hit covers both targets.
  return {
    kind: "xinstance",
    instanceName: instanceTok.text,
    originalInstanceName: instanceTok.originalText,
    subcktName: targetTok.text,
    originalSubcktName: targetTok.originalText,
    nodes: nodeToks.map((t) => t.text),
    nodeRanges,
    params,
    paramRefs,
    range: instanceRange,
    nameRange,
    subcktNameRange: tokenRange(targetTok),
    filePath,
  };
}

// ── File parser ────────────────────────────────────────────────────────────

export interface ParseOptions {
  /** Device type letters (lowercase) whose instances are stored. Defaults to low-volume types. */
  indexedDeviceTypes?: Set<string>;
  /** X-instances with this many nodes or fewer are skipped. Default 2. */
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
    funcNames: new Set(),
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
function createIdentifierRe(): RegExp {
  // Match identifiers only at expression token boundaries. The lookbehind
  // excludes names glued to a word char or decimal point, so scientific notation
  // exponents like `1.6e-08` do not expose `e` as a variable.
  return /(?<![\w.])([A-Za-z_]\w*)/g;
}

function extractVarRefMatches(expr: string, extraFuncs?: Set<string>): { name: string; start: number; end: number }[] {
  const out: { name: string; start: number; end: number }[] = [];
  const seen = new Set<string>();
  const re = createIdentifierRe();
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr)) !== null) {
    const name = m[1];
    const afterIdx = m.index + name.length;
    const after = expr[afterIdx];
    if (after === "(") continue;
    const lower = name.toLowerCase();
    if (HSPICE_BUILTIN_FUNCS.has(lower)) continue;
    if (extraFuncs && extraFuncs.has(lower)) continue;
    const key = `${lower}:${m.index}:${afterIdx}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: lower, start: m.index, end: afterIdx });
  }
  return out;
}

function collectExprRefs(
  expr: string,
  rangeForOffset: (start: number, end: number) => Range | undefined,
  extraFuncs?: Set<string>,
): ExprRef[] {
  const refs: ExprRef[] = [];
  for (const match of extractVarRefMatches(expr, extraFuncs)) {
    const range = rangeForOffset(match.start, match.end);
    if (range) refs.push({ name: match.name, range });
  }
  return refs;
}

export function identifierAtText(text: string, offset: number): string | undefined {
  if (offset < 0 || offset > text.length) return undefined;
  const re = createIdentifierRe();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (offset >= m.index && offset <= m.index + m[1].length) {
      if (text[m.index + m[1].length] === "(") return undefined;
      return m[1];
    }
  }
  return undefined;
}

export function extractVarRefs(expr: string, extraFuncs?: Set<string>): string[] {
  const out = new Set<string>();
  for (const match of extractVarRefMatches(expr, extraFuncs)) {
    out.add(match.name);
  }
  return [...out];
}

/**
 * Parse a `.param` logical line into ParamDef entries. Scans the merged physical
 * text for `name = value` pairs, tolerating `=` with surrounding spaces and quoted
 * expressions. `value` extends until the next whitespace-separated pair (HSPICE
 * values contain no bare spaces unless quoted, and quotes are consumed here).
 */
function parseParamDefs(ll: LogicalLine, filePath: string, section: string | undefined, extraFuncs?: Set<string>): ParamDef[] {
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
    const quotedValue = m[3] !== undefined || m[4] !== undefined;
    const valExprStart = valFullStart + (quotedValue ? 1 : 0);
    const valExprEnd = valFullEnd - (quotedValue ? 1 : 0);
    const nameRange = offsetRange(ll, nameStart, nameEnd);
    const valueRange = offsetRange(ll, valExprStart, valExprEnd);
    if (!nameRange || !valueRange) continue;
    const exprRefs = collectExprRefs(
      valueOriginal,
      (start, end) => offsetRange(ll, valExprStart + start, valExprStart + end),
      extraFuncs,
    );
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
      varRefs: exprRefs.map((ref) => ref.name),
      exprRefs,
    });
  }
  return defs;
}

/** Collect variable references referenced inside a model card's `'...'` expressions. */
function collectModelVarRefs(tokens: Token[], extraFuncs?: Set<string>): string[] {
  const out = new Set<string>();
  for (const t of tokens) {
    if (t.type === "string") {
      // string token originalText includes surrounding quotes
      const inner = t.originalText.length >= 2 ? t.originalText.slice(1, -1) : t.originalText;
      for (const v of extractVarRefs(inner, extraFuncs)) out.add(v);
    } else if (t.type === "param" && t.paramValue !== undefined) {
      for (const v of extractVarRefs(t.paramValue, extraFuncs)) out.add(v);
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
  const lines = preprocess(source, filePath);

  let openSubckt: SubcktDef | null = null;
  /** Stack of currently-open `.LIB section` definitions (innermost last). */
  const sectionStack: SectionDef[] = [];
  const currentSection = (): string | undefined =>
    sectionStack.length > 0 ? sectionStack[sectionStack.length - 1].name : undefined;

  for (const ll of lines) {
    const tokens = tokenize(ll);
    if (tokens.length === 0) continue;

    const isSpectre = ll.dialect === "spectre";
    let first = tokens[0];
    // `inline subckt NAME (...)` — spectre variant; step past the `inline` modifier.
    if (isSpectre && first.text === "inline" && tokens[1] && tokens[1].text === "subckt") {
      first = tokens[1];
    }

    if (first.text === ".end" || first.text === "end") {
      // Spectre `end` (standalone) terminates the netlist; HSPICE uses `.end`.
      if (first.text === ".end") break;
      // A bare spectre `end` can also close a block; only treat as netlist-end
      // when it stands alone on the line.
      if (first.text === "end" && tokens.length === 1) break;
    }

    // ── subckt definition (HSPICE `.subckt` / Spectre `subckt` / `inline subckt`) ──
    if (isHead(first, "subckt")) {
      if (tokens.length < 2) continue;
      // `inline subckt` keeps the name at the same offset since we rewrote `first`
      // to the `subckt` token but did not shift the token array; locate the name
      // token right after the actual subckt keyword token in `tokens`.
      const subcktIdx = tokens.indexOf(first);
      const nameTok = tokens[subcktIdx + 1];
      if (!nameTok) continue;
      const portToks = extractPorts(tokens.slice(subcktIdx + 2), isSpectre);
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

    if (isHead(first, "ends")) {
      if (openSubckt) {
        openSubckt.range.end = llEnd(ll);
        model.subcktDefs.set(openSubckt.name, openSubckt);
        openSubckt = null;
      }
      continue;
    }

    if (isHead(first, "model")) {
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
        exprVarRefs: collectModelVarRefs(tokens, model.funcNames),
        exprRefs: collectTokenExprRefs(tokens, model.funcNames),
      };
      model.modelDefs.set(def.name, def);
      continue;
    }

    // `.func` (HSPICE) / `define` (Spectre) user function definitions.
    // The function name is collected so later `extractVarRefs` can exclude it
    // (a function call like `myfunc(...)` is already skipped, but collecting the
    // name also covers `name` used without `(` in some PDK expression contexts).
    if (first.text === ".func" || (isSpectre && first.text === "define")) {
      const nameTok = tokens[1];
      if (nameTok && nameTok.type === "identifier") {
        model.funcNames.add(nameTok.text);
      }
      continue;
    }

    // `.param` (HSPICE) / `parameters` (Spectre) variable definitions.
    if (first.text === ".param" || (isSpectre && (first.text === "parameters" || first.text === "parameter"))) {
      // Spectre `parameters` may carry its name=value pairs on the same line or
      // on continuation lines (already joined). parseParamDefs scans the joined
      // text regardless of keyword, so reuse it.
      for (const pd of parseParamDefs(ll, filePath, currentSection(), model.funcNames)) {
        pushParamDef(model, pd);
      }
      continue;
    }

    // `.LIB` has two HSPICE forms:
    //   reference:  .lib 'filepath' section      (first token after .lib is a quoted string)
    //   definition: .LIB section ... .ENDL       (otherwise — opens a section block)
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

    // Spectre section/library corner blocks — reused as SectionDef scope groups.
    if (isSpectre && (first.text === "section" || first.text === "library")) {
      const second = tokens[1];
      if (second) {
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
    if (isSpectre && (first.text === "endsection" || first.text === "endlibrary")) {
      const sec = sectionStack.pop();
      if (sec) {
        sec.range.end = llEnd(ll);
        model.sectionDefs.set(sec.name, sec);
      }
      continue;
    }

    if (isHead(first, "endl")) {
      const sec = sectionStack.pop();
      if (sec) {
        sec.range.end = llEnd(ll);
        model.sectionDefs.set(sec.name, sec);
      }
      continue;
    }

    // `.include`/`.inc` (HSPICE) / `include` (Spectre). Spectre paths are quoted.
    if (first.text === ".include" || first.text === ".inc" || (isSpectre && first.text === "include")) {
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

    // Spectre statements we consume but do not index (no navigation target).
    if (
      isSpectre &&
      (first.text === "global" ||
        first.text === "statistics" ||
        first.text === "process" ||
        first.text === "mismatch" ||
        first.text === "connect" ||
        first.text === "options" ||
        first.text === "alter")
    ) {
      continue;
    }
    // `statistics { ... }` / `process { ... }` blocks opened with `{` are joined
    // into one logical line by preprocess; nothing to index. (Covers the case
    // where the keyword and `{` land on the same line.)

    // ── Instance statements ──
    // HSPICE: first token starts with a device letter (`x`, `m`, `q`, `d`, ...).
    if (!isSpectre && first.type === "identifier" && first.text.startsWith("x")) {
      const inst = parseXInstance(ll, tokens, filePath, model.funcNames);
      if (inst && inst.nodes.length > minXInstanceNodes) {
        model.xInstances.push(inst);
      }
      continue;
    }
    if (!isSpectre && first.type === "identifier") {
      const devType = first.text[0];
      if (DEVICE_TYPES.has(devType) && indexedDeviceTypes.has(devType)) {
        const inst = parseDeviceInstance(ll, tokens, filePath, model.funcNames);
        if (inst) model.deviceInstances.push(inst);
      }
      continue;
    }

    // Spectre instance: `name ( nodes... ) target params...`
    if (isSpectre && first.type === "identifier" && !isSpectreKeyword(first.text)) {
      const inst = parseSpectreInstance(ll, tokens, filePath, model.funcNames);
      if (inst && inst.kind === "xinstance" && inst.nodes.length > minXInstanceNodes) {
        model.xInstances.push(inst);
      } else if (inst && inst.kind === "device") {
        model.deviceInstances.push(inst);
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

  // Backfill: `.func` definitions appearing AFTER a `.param` could not be
  // excluded from that param's varRefs during the single forward pass. Recompute
  // param varRefs now that all funcNames are known. (Model-card exprVarRefs keep
  // their forward-pass value; in practice `.func` precedes model cards in PDKs.)
  if (model.funcNames.size > 0) {
    for (const arr of model.paramDefs.values()) {
      for (const pd of arr) {
        pd.varRefs = extractVarRefs(pd.valueExpr, model.funcNames);
      }
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
	    for (const ref of inst.paramRefs ?? []) {
	      if (containsPosition(ref.range, pos)) {
	        return { kind: "paramRef", name: ref.name };
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
	    for (const ref of dev.paramRefs ?? []) {
	      if (containsPosition(ref.range, pos)) {
	        return { kind: "paramRef", name: ref.name };
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
	      for (const ref of pd.exprRefs ?? []) {
	        if (containsPosition(ref.range, pos)) {
	          return { kind: "paramRef", name: ref.name };
	        }
	      }
	      if (containsPosition(pd.valueRange, pos)) {
	        const name = identifierAtOffset(pd.valueExpr, pos, pd.valueRange);
	        if (name) return { kind: "paramRef", name: name.toLowerCase() };
	      }
	    }
	  }
	  for (const def of model.modelDefs.values()) {
	    for (const ref of def.exprRefs ?? []) {
	      if (containsPosition(ref.range, pos)) {
	        return { kind: "paramRef", name: ref.name };
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
  return identifierAtText(expr, off);
}
