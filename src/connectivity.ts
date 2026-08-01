import type { ModelDef, NetOccurrence, Port, Pos, Range, SubcktDef } from "./parser";

export interface FormalPortTarget {
  filePath: string;
  range: Range;
  port: Port;
}

/**
 * A target name is trustworthy as a formal-port source only when no reachable
 * model uses the same name. HSPICE X calls and Spectre instances may resolve to
 * either kind, so the conservative result for a model/subckt collision is no
 * port navigation and no hint.
 */
export function formalSubcktCandidates(subckts: SubcktDef[], models: ModelDef[]): SubcktDef[] {
  return models.length === 0 ? subckts : [];
}

/**
 * Resolve an X-instance net endpoint to every matching formal port. The caller
 * may first scope definitions to the active `.LIB` section; this function never
 * invents a target for primitive/model endpoints.
 */
export function formalPortTargets(occurrence: NetOccurrence, definitions: SubcktDef[]): FormalPortTarget[] {
  const endpoint = occurrence.endpoint;
  if (endpoint.kind !== "xinstance") return [];
  const targets: FormalPortTarget[] = [];
  for (const definition of definitions) {
    if (definition.name !== endpoint.targetName) continue;
    const port = definition.ports[endpoint.nodeIndex];
    if (port) targets.push({ filePath: definition.filePath, range: port.range, port });
  }
  return targets;
}

/**
 * Return the one trustworthy formal-port label for an Inlay Hint. Ambiguous
 * definitions and node-count mismatches deliberately produce no hint.
 */
export function uniqueFormalPortHint(
  occurrence: NetOccurrence,
  definitions: SubcktDef[],
): FormalPortTarget | undefined {
  const endpoint = occurrence.endpoint;
  if (endpoint.kind !== "xinstance") return undefined;
  const matching = definitions.filter((definition) => definition.name === endpoint.targetName);
  if (matching.length !== 1) return undefined;
  const definition = matching[0];
  if (definition.ports.length !== endpoint.nodeCount) return undefined;
  const port = definition.ports[endpoint.nodeIndex];
  return port ? { filePath: definition.filePath, range: port.range, port } : undefined;
}

/** Treat a subckt header port as the declaration endpoint for ReferenceContext. */
export function netReferenceOccurrences(occurrences: NetOccurrence[], includeDeclaration: boolean): NetOccurrence[] {
  return includeDeclaration ? occurrences : occurrences.filter((occurrence) => occurrence.endpoint.kind !== "port");
}

function posBefore(a: Pos, b: Pos): boolean {
  return a.line < b.line || (a.line === b.line && a.character < b.character);
}

/**
 * Collect only occurrences whose start lies in a requested half-open physical
 * range. Returning undefined signals cancellation and lets the provider discard
 * partial hint output.
 */
export function collectOccurrencesInRange(
  byLine: (line: number) => NetOccurrence[],
  requested: Range,
  isCancelled: () => boolean,
): NetOccurrence[] | undefined {
  const out: NetOccurrence[] = [];
  const lastLine = requested.end.character === 0
    ? Math.max(requested.start.line, requested.end.line - 1)
    : requested.end.line;
  for (let line = requested.start.line; line <= lastLine; line++) {
    if (isCancelled()) return undefined;
    for (const occurrence of byLine(line)) {
      if (isCancelled()) return undefined;
      if (!posBefore(occurrence.range.start, requested.start) && posBefore(occurrence.range.start, requested.end)) {
        out.push(occurrence);
      }
    }
  }
  return out;
}
