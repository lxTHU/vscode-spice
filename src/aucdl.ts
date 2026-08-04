/**
 * AUCDL/CDL compatibility helpers.
 *
 * Cadence auCdl emits a SPICE-like netlist with a few constructs that are not
 * accepted by the ordinary HSPICE parser:
 *
 *   XU1 A B Y VDD VSS / INV
 *   M0  D G S B $[nch] $W=2u $L=180n
 *
 * The parser already understands the equivalent HSPICE forms:
 *
 *   XU1 A B Y VDD VSS   INV
 *   M0  D G S B   nch    W=2u  L=180n
 *
 * Normalisation is deliberately length-preserving. Every AUCDL punctuation
 * character is replaced by whitespace rather than removed, so token ranges
 * continue to point at the original document columns.
 */

/** Return true for files that should use AUCDL compatibility rules. */
export function isAucdlPath(filePath: string): boolean {
  return /\.(?:aucdl|cdl)$/i.test(filePath);
}

/**
 * Convert AUCDL-only syntax into the parser's existing HSPICE token model.
 *
 * Transformations:
 * - X-call hierarchy separator: `/ target` or `/target` -> `  target`
 * - Model annotation: `$[model]` -> `  model `
 * - Property annotation: `$W=...` -> ` W=...`
 *
 * Ordinary `$ comment` text is left untouched and remains an HSPICE comment.
 */
export function normalizeAucdlSource(source: string, filePath: string): string {
  if (!isAucdlPath(filePath)) return source;

  return source
    // auCdl subcircuit call: Xname nodes / subckt.
    // Restrict the replacement to X-instance lines and a slash preceded by
    // whitespace, so path-like text elsewhere is not affected.
    .replace(
      /^([ \t]*[xX]\S+[^\r\n]*?[ \t])\/(?=[ \t]*[A-Za-z_][^\s]*)/gm,
      (_match, prefix: string) => prefix + " ",
    )
    // "$[" and "]" become spaces while the model spelling and columns remain.
    .replace(/\$\[([^\]\r\n]+)\]/g, (_match, model: string) => `  ${model} `)
    // AUCDL properties such as $W=, $L=, $M= and $EA=. Ordinary "$ comment"
    // text is preserved because it is not followed by a key and '='.
    .replace(
      /\$([A-Za-z_]\w*)([ \t]*=)/g,
      (_match, key: string, equals: string) => ` ${key}${equals}`,
    );
}
