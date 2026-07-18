import type { PullRequestFileDiff } from "../types/git";

export interface PullRequestFilePatch extends PullRequestFileDiff {
  oldPath?: string;
  patchText: string;
  isBinary: boolean;
}

function decodeDiffPathToken(token: string) {
  const path = token.trim();
  if (path === "/dev/null") return null;
  const unquoted = path.startsWith('"') && path.endsWith('"')
    ? (() => {
        try {
          return JSON.parse(path) as string;
        } catch {
          return path.slice(1, -1);
        }
      })()
    : path;
  if (unquoted.startsWith("a/") || unquoted.startsWith("b/")) {
    return unquoted.slice(2);
  }
  return unquoted;
}

function pathFromDiffHeader(line: string, side: "left" | "right") {
  const prefix = "diff --git ";
  if (!line.startsWith(prefix)) return null;
  const payload = line.slice(prefix.length);
  const paths = splitDiffHeaderPathTokens(payload);
  return paths ? decodeDiffPathToken(paths[side === "left" ? 0 : 1]) : null;
}

function splitDiffHeaderPathTokens(payload: string): [string, string] | null {
  if (payload.startsWith('"')) {
    const firstEnd = findQuotedTokenEnd(payload, 0);
    if (firstEnd < 0) return null;
    const secondStart = payload.slice(firstEnd + 1).search(/\S/);
    if (secondStart < 0) return null;
    const start = firstEnd + 1 + secondStart;
    const secondEnd = payload.startsWith('"', start)
      ? findQuotedTokenEnd(payload, start)
      : payload.length - 1;
    if (secondEnd < start) return null;
    return [payload.slice(0, firstEnd + 1), payload.slice(start, secondEnd + 1)];
  }

  const separator = payload.lastIndexOf(" b/");
  if (separator > 0) return [payload.slice(0, separator), payload.slice(separator + 1)];
  const fallbackSeparator = payload.lastIndexOf(" ");
  if (fallbackSeparator < 1) return null;
  return [payload.slice(0, fallbackSeparator), payload.slice(fallbackSeparator + 1)];
}

function findQuotedTokenEnd(value: string, start: number) {
  let escaped = false;
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === '"') {
      return index;
    }
  }
  return -1;
}

function pathFromFileHeader(line: string) {
  const marker = line.startsWith("--- ") || line.startsWith("+++ ") ? line.slice(4) : line;
  const pathToken = marker.split("\t", 1)[0];
  return decodeDiffPathToken(pathToken);
}

function summarizePatch(lines: string[]): PullRequestFilePatch {
  const diffHeader = lines.find((line) => line.startsWith("diff --git ")) ?? "";
  const minusHeader = lines.find((line) => line.startsWith("--- ")) ?? null;
  const plusHeader = lines.find((line) => line.startsWith("+++ ")) ?? null;
  const oldFromHeader = minusHeader ? pathFromFileHeader(minusHeader) : null;
  const newFromHeader = plusHeader ? pathFromFileHeader(plusHeader) : null;
  const oldPath = oldFromHeader ?? pathFromDiffHeader(diffHeader, "left") ?? undefined;
  const path = newFromHeader ?? pathFromDiffHeader(diffHeader, "right") ?? oldPath ?? "unknown";
  const isBinary = lines.some((line) => line.startsWith("Binary files ") || line === "GIT binary patch");
  const additions = isBinary
    ? 0
    : lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const deletions = isBinary
    ? 0
    : lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  const status = lines.some((line) => line.startsWith("new file mode"))
    ? "added"
    : lines.some((line) => line.startsWith("deleted file mode"))
      ? "deleted"
      : lines.some((line) => line.startsWith("rename from "))
        ? "renamed"
        : lines.some((line) => line.startsWith("copy from "))
          ? "copied"
          : "modified";
  return {
    path,
    oldPath: oldPath && oldPath !== path ? oldPath : undefined,
    additions,
    deletions,
    status,
    patchText: lines.join("\n"),
    isBinary,
  };
}

export function splitPullRequestDiff(diffText: string | null | undefined) {
  if (!diffText) return [];
  const patches: PullRequestFilePatch[] = [];
  let current: string[] = [];
  for (const line of diffText.split("\n")) {
    if (line.startsWith("diff --git ")) {
      if (current.length > 0) patches.push(summarizePatch(current));
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) patches.push(summarizePatch(current));
  return patches;
}

export function summarizePullRequestDiffFiles(patches: PullRequestFilePatch[]): PullRequestFileDiff[] {
  return patches.map(({ path, additions, deletions, status }) => ({
    path,
    additions,
    deletions,
    status,
  }));
}

export function mergePullRequestDiffFiles(
  apiFiles: PullRequestFileDiff[] | null | undefined,
  parsedFiles: PullRequestFileDiff[],
) {
  if (!apiFiles || apiFiles.length === 0) return parsedFiles;
  const seen = new Set(apiFiles.map((file) => file.path));
  return [
    ...apiFiles,
    ...parsedFiles.filter((file) => !seen.has(file.path)),
  ];
}

export function findPullRequestFilePatch(
  patches: PullRequestFilePatch[],
  filePath: string | null | undefined,
) {
  if (!filePath) return null;
  return patches.find((patch) => patch.path === filePath || patch.oldPath === filePath) ?? null;
}
