/**
 * Builds a standalone patch for one hunk, suitable for `git apply`.
 *
 * `git apply` rejects a patch whose last line lacks a newline ("corrupt
 * patch"). Hunks split from the middle of a diff have no trailing newline,
 * while the final hunk carries the empty string left by `split("\n")`, so
 * normalize both to exactly one terminating newline.
 */
export function buildHunkPatch(fileHeaderLines: string[], hunkLines: string[]): string {
  const lines = [...fileHeaderLines, ...hunkLines];
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return `${lines.join("\n")}\n`;
}
