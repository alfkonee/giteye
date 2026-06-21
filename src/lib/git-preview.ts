import type { AmendPreview, RebasePreviewItem } from "../types/git";

const MAX_PREVIEW_LINES = 12;


function previewLines(lines: string[], emptyMessage: string) {
  const visible = lines.slice(0, MAX_PREVIEW_LINES);
  const overflow = lines.length - visible.length;
  return [
    ...visible.map((line) => `• ${line}`),
    ...(overflow > 0 ? [`• …and ${overflow} more`] : []),
  ].join("\n") || emptyMessage;
}

export function formatDryRunPreview(lines: string[], emptyMessage: string) {
  return `Git dry-run preview (best effort; the remote can change before the action runs):\n${previewLines(lines, emptyMessage)}`;
}

export function formatAmendPreview(preview: AmendPreview) {
  const lines = [
    `Current HEAD: ${(preview.head.shortHash || preview.head.hash)?.slice(0, 8) || "unknown"} ${preview.head.message}`,
    `Amended message: ${preview.message || "Reusing current message"}`,
    "",
    `Staged files included (${preview.stagedFiles.length}):`,
    previewLines(
      preview.stagedFiles.map((file) => `${file.status} ${file.path}`),
      "No staged file changes; only the commit message/metadata will change.",
    ),
  ];

  return lines.join("\n");
}

export function formatRebasePreview(preview: RebasePreviewItem[]) {
  return [
    `Commits to replay (${preview.length}):`,
    previewLines(
      preview.map((item) => `${item.action} ${item.commit.slice(0, 8) || "unknown"} ${item.message}`),
      "No commits were reported for replay; Git may treat this rebase as a no-op.",
    ),
  ].join("\n");
}
