import type { ConflictRegion } from "../../types/git";

/** Use CRLF only for consistently CRLF text. Explicit LF splitting retains literal CRs in mixed files. */
export function resultLineSeparator(text: string): "\n" | "\r\n" {
  return text.includes("\r\n") && !/(?:^|[^\r])\n/.test(text) ? "\r\n" : "\n";
}

/** Parse the current buffer, not stale offsets from the original worktree. Preserve CRLF and final-newline bytes. */
export function conflictRegions(text: string): ConflictRegion[] {
  const lines = Array.from(text.matchAll(/[^\n]*\n|[^\n]+$/g));
  const regions: ConflictRegion[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (!/^<{7,}(?: |\r?$)/.test(lines[index][0])) continue;
    const startLine = index;
    let baseLine = -1;
    let separator = -1;
    let endLine = -1;
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const line = lines[cursor][0];
      if (/^<{7,}(?: |\r?$)/.test(line)) break;
      if (/^\|{7,}(?: |\r?$)/.test(line) && separator < 0) baseLine = cursor;
      if (/^={7,}\r?\n?$/.test(line)) separator = cursor;
      if (/^>{7,}(?: |\r?$)/.test(line) && separator >= 0) {
        endLine = cursor;
        break;
      }
    }
    if (separator < 0 || endLine < 0) continue;
    const start = lines[startLine].index!;
    const end = lines[endLine].index! + lines[endLine][0].length;
    const join = (from: number, to: number) =>
      lines
        .slice(from, to)
        .map((line) => line[0])
        .join("");
    regions.push({
      id: `${start}:${end}`,
      start,
      end,
      current: join(startLine + 1, baseLine >= 0 ? baseLine : separator),
      incoming: join(separator + 1, endLine),
      base: baseLine >= 0 ? join(baseLine + 1, separator) : null,
    });
    index = endLine;
  }
  return regions;
}

export type RegionChoice =
  "current" | "incoming" | "currentIncoming" | "incomingCurrent";

export function applyRegion(
  text: string,
  region: ConflictRegion,
  choice: RegionChoice,
): string {
  const replacement =
    choice === "current"
      ? region.current
      : choice === "incoming"
        ? region.incoming
        : choice === "currentIncoming"
          ? region.current + region.incoming
          : region.incoming + region.current;
  return text.slice(0, region.start) + replacement + text.slice(region.end);
}

/** A lossless unified patch for review; trim shared prefix/suffix, retain three context lines. */
export function resultPatch(
  filePath: string,
  before: string,
  after: string,
): string {
  if (before === after) return "";
  const oldLines = before.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const newLines = after.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  let prefix = 0;
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  )
    prefix++;
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] ===
      newLines[newLines.length - 1 - suffix]
  )
    suffix++;
  const start = Math.max(0, prefix - 3);
  const contextEnd = Math.min(3, suffix);
  const oldEnd = oldLines.length - suffix;
  const newEnd = newLines.length - suffix;
  const oldCount = oldEnd + contextEnd - start;
  const newCount = newEnd + contextEnd - start;
  const quotePath = (path: string) =>
    /[\s"\\]/.test(path) ? JSON.stringify(path) : path;
  let patch = `diff --git ${quotePath(`a/${filePath}`)} ${quotePath(`b/${filePath}`)}\n--- ${quotePath(`a/${filePath}`)}\n+++ ${quotePath(`b/${filePath}`)}\n@@ -${oldCount ? start + 1 : start},${oldCount} +${newCount ? start + 1 : start},${newCount} @@\n`;
  const append = (marker: string, line: string) => {
    patch += marker + line;
    if (!line.endsWith("\n")) patch += "\n\\ No newline at end of file\n";
  };
  for (let index = start; index < prefix; index++) append(" ", oldLines[index]);
  for (let index = prefix; index < oldEnd; index++)
    append("-", oldLines[index]);
  for (let index = prefix; index < newEnd; index++)
    append("+", newLines[index]);
  for (let index = 0; index < contextEnd; index++)
    append(" ", oldLines[oldEnd + index]);
  return patch;
}
