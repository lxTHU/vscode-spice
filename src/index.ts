// Symbol index with cross-file `.INCLUDE` resolution and on-disk caching.
// Ported (simplified, HSPICE-only) from vladimir-aptekar/hspice-intellisense (MIT).

import * as fs from "fs";
import * as path from "path";
import {
  parseFile,
  type FileModel,
  type Definition,
  type SubcktDef,
  type ModelDef,
  type XInstance,
  type DeviceInstance,
  type ParamDef,
  type SectionDef,
  type Range,
  type ParseOptions,
} from "./parser";

/** Expand `$VAR` / `${VAR}` against the process environment. */
export function expandEnvVars(p: string): string {
  return p.replace(/\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, braced, bare) => {
    return process.env[braced ?? bare] ?? match;
  });
}

/** Resolve an include path relative to the including file's directory, expanding env vars. */
export function resolveInclude(includePath: string, fromFile: string): string {
  const fromDir = path.dirname(fromFile);
  return path.resolve(fromDir, expandEnvVars(includePath));
}

interface DiskCacheEntry {
  model: FileModel;
  mtimeMs: number;
}

/**
 * Holds parsed FileModels for open documents (live text) and disk-read includes
 * (mtime-cached), and answers subckt/model/reference lookups across the include graph.
 */
export class SymbolIndex {
  /** Live models from open editors, keyed by absolute path. */
  private live = new Map<string, FileModel>();
  /** Disk-cached models for include files not open in an editor. */
  private disk = new Map<string, DiskCacheEntry>();

  private parseOptions: ParseOptions = {
    indexedDeviceTypes: new Set(["m", "q", "d", "v", "i", "e", "g", "f", "h"]),
    minXInstanceNodes: 2,
  };

  /** Index an open document's live text. */
  indexLive(filePath: string, source: string): FileModel {
    const model = parseFile(filePath, source, this.parseOptions);
    this.live.set(filePath, model);
    // A live document supersedes any stale disk cache for the same path.
    this.disk.delete(filePath);
    return model;
  }

  /** Remove a live document (e.g. on close). Disk cache may still serve includes. */
  invalidateLive(filePath: string): void {
    this.live.delete(filePath);
  }

  /** Drop both live and disk entries (file no longer relevant). */
  invalidate(filePath: string): void {
    this.live.delete(filePath);
    this.disk.delete(filePath);
  }

  /** Get a model: live first, then disk (reading + caching on miss). */
  getModel(filePath: string): FileModel | undefined {
    const live = this.live.get(filePath);
    if (live) return live;
    return this.getFromDisk(filePath);
  }

  private getFromDisk(filePath: string): FileModel | undefined {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return undefined;
    }
    if (!stat.isFile()) return undefined;

    const cached = this.disk.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.model;
    }

    let text: string;
    try {
      text = fs.readFileSync(filePath, "utf-8");
    } catch {
      return undefined;
    }
    const model = parseFile(filePath, text, this.parseOptions);
    this.disk.set(filePath, { model, mtimeMs: stat.mtimeMs });
    return model;
  }

  /** Recursively index a file and every `.INCLUDE`/`.INC`/`.LIB` it pulls in. */
  indexWithIncludes(filePath: string, content: string): void {
    this.indexLive(filePath, content);
    const visited = new Set<string>([filePath]);
    const stack = [filePath];
    while (stack.length > 0) {
      const current = stack.pop()!;
      const model = this.getModel(current);
      if (!model) continue;
      for (const inc of model.includes) {
        const resolved = resolveInclude(inc.path, current);
        if (visited.has(resolved)) continue;
        visited.add(resolved);
        // Reads from disk (or reuses live) via getModel; only crawl files not already live.
        if (!this.live.has(resolved)) {
          this.getFromDisk(resolved);
        }
        stack.push(resolved);
      }
    }
  }

  /** All files reachable from `filePath` via includes (including itself). */
  transitiveIncludes(filePath: string): Set<string> {
    const result = new Set<string>([filePath]);
    const stack = [filePath];
    while (stack.length > 0) {
      const current = stack.pop()!;
      const model = this.getModel(current);
      if (!model) continue;
      for (const inc of model.includes) {
        const resolved = resolveInclude(inc.path, current);
        if (!result.has(resolved)) {
          result.add(resolved);
          stack.push(resolved);
        }
      }
    }
    return result;
  }

  // ── Definition lookups (case-insensitive) ─────────────────────────────────

  findSubckt(name: string): SubcktDef | undefined {
    const key = name.toLowerCase();
    for (const model of this.allModels()) {
      const def = model.subcktDefs.get(key);
      if (def) return def;
    }
    return undefined;
  }

  findModel(name: string): ModelDef | undefined {
    const key = name.toLowerCase();
    for (const model of this.allModels()) {
      const def = model.modelDefs.get(key);
      if (def) return def;
    }
    return undefined;
  }

  /** Subckt first, fall back to model (HSPICE mamcmod=3: X can reference either). */
  findSubcktOrModel(name: string): Definition | undefined {
    return this.findSubckt(name) ?? this.findModel(name);
  }

  /** Model first, fall back to subckt. */
  findModelOrSubckt(name: string): Definition | undefined {
    return this.findModel(name) ?? this.findSubckt(name);
  }

  // ── Reference lookups ─────────────────────────────────────────────────────

  findXInstances(subcktName: string): XInstance[] {
    const key = subcktName.toLowerCase();
    const results: XInstance[] = [];
    for (const model of this.allModels()) {
      for (const inst of model.xInstances) {
        if (inst.subcktName === key) results.push(inst);
      }
    }
    return results;
  }

  findDevicesByModel(modelName: string): DeviceInstance[] {
    const key = modelName.toLowerCase();
    const results: DeviceInstance[] = [];
    for (const model of this.allModels()) {
      for (const dev of model.deviceInstances) {
        if (dev.modelName === key) results.push(dev);
      }
    }
    return results;
  }

  // ── Multi-definition lookups (sections / corners) ──────────────────────────

  /** All `.param` definitions for a name, across files and sections. */
  findParamDefs(name: string): ParamDef[] {
    const key = name.toLowerCase();
    const out: ParamDef[] = [];
    for (const model of this.allModels()) {
      const arr = model.paramDefs.get(key);
      if (arr) out.push(...arr);
    }
    return out;
  }

  /** All `.model` definitions for a name (may differ across sections/corners). */
  findAllModelDefs(name: string): ModelDef[] {
    const key = name.toLowerCase();
    const out: ModelDef[] = [];
    for (const model of this.allModels()) {
      const def = model.modelDefs.get(key);
      if (def) out.push(def);
    }
    return out;
  }

  /** All `.subckt` definitions for a name. */
  findAllSubcktDefs(name: string): SubcktDef[] {
    const key = name.toLowerCase();
    const out: SubcktDef[] = [];
    for (const model of this.allModels()) {
      const def = model.subcktDefs.get(key);
      if (def) out.push(def);
    }
    return out;
  }

  /** Find a `.LIB section` definition by name (within the file or its include graph). */
  findSectionDef(sectionName: string, fromFilePath: string): SectionDef | undefined {
    const key = sectionName.toLowerCase();
    for (const fp of this.transitiveIncludes(fromFilePath)) {
      const model = this.getModel(fp);
      if (!model) continue;
      const def = model.sectionDefs.get(key);
      if (def) return def;
    }
    // Fallback: any indexed file.
    for (const model of this.allModels()) {
      const def = model.sectionDefs.get(key);
      if (def) return def;
    }
    return undefined;
  }

  /**
   * Find all places that reference a parameter variable inside an expression
   * (other params' valueExprs and model cards' string expressions).
   */
  findParamRefs(varName: string): { filePath: string; range: Range }[] {
    const key = varName.toLowerCase();
    const out: { filePath: string; range: Range }[] = [];
    for (const model of this.allModels()) {
      for (const arr of model.paramDefs.values()) {
        for (const pd of arr) {
          if (pd.varRefs?.includes(key)) {
            out.push({ filePath: pd.filePath, range: pd.valueRange });
          }
        }
      }
      for (const def of model.modelDefs.values()) {
        if (def.exprVarRefs?.includes(key)) {
          out.push({ filePath: def.filePath, range: def.range });
        }
      }
    }
    return out;
  }

  // ── Section scope resolution ───────────────────────────────────────────────
  //
  // HSPICE `.lib 'file' section` selects which definitions inside `file` are
  // active. Scope is determined by:
  //   1. Manual override (user-chosen via GUI command) — highest priority.
  //   2. Reverse edge: a parent file references THIS file via `.lib '<thisFile>' section`.
  //   3. Otherwise undetermined (multi-entry PDK analysis).

  private manualScope = new Map<string, string>(); // filePath(lowercased key) → section name

  /** User manually pins the active section for a file (session-scoped). */
  setManualScope(filePath: string, sectionName: string): void {
    this.manualScope.set(filePath.toLowerCase(), sectionName.toLowerCase());
  }

  clearManualScope(filePath: string): void {
    this.manualScope.delete(filePath.toLowerCase());
  }

  getManualScope(filePath: string): string | undefined {
    return this.manualScope.get(filePath.toLowerCase());
  }

  /**
   * Resolve the active section for `filePath`.
   * - `determined: true` + `section`: scope is known (manual or single parent lib-ref).
   * - `determined: false`: ambiguous / unknown (caller may offer GUI selection).
   */
  resolveScope(filePath: string): { section?: string; determined: boolean } {
    const manual = this.manualScope.get(filePath.toLowerCase());
    if (manual) return { section: manual, determined: true };

    // Reverse edge: find parents that reference this file via `.lib '<path>' section`.
    const targetAbs = filePath;
    const candidates: string[] = [];
    for (const model of this.allModels()) {
      for (const ref of model.libRefs) {
        const resolved = resolveInclude(ref.path, model.filePath);
        if (samePath(resolved, targetAbs) && ref.sectionName) {
          candidates.push(ref.sectionName);
        }
      }
    }
    const uniq = [...new Set(candidates.map((c) => c.toLowerCase()))];
    if (uniq.length === 1) return { section: uniq[0], determined: true };
    if (uniq.length > 1) return { section: undefined, determined: false };
    return { section: undefined, determined: false };
  }

  /** Iterate every model currently in the index (live + disk). */
  private *allModels(): Iterable<FileModel> {
    for (const m of this.live.values()) yield m;
    for (const entry of this.disk.values()) yield entry.model;
  }
}

/** Path comparison tolerant of symlinks/case on the OS. */
function samePath(a: string, b: string): boolean {
  return a === b || path.relative(a, b) === "";
}
