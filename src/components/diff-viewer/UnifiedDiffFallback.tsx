import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import { cn } from "../../lib/cn";
import { FileCode2 } from "lucide-react";
import type { DiffHunkActionContext, DiffHunkActionHandler } from "./DiffViewer.types";


export interface DiffLineSelection {
  filePath: string;
  line: number;
  side: "LEFT" | "RIGHT";
}
interface UnifiedDiffFallbackProps {
  diffText: string;
  filePath: string;
  oldFilePath?: string;
  mode: "unified" | "split";
  focusedFilePath?: string;
  isStaged?: boolean;
  isHunkActionPending?: boolean;
  onLineSelect?: (selection: DiffLineSelection) => void;
  selectedLine?: DiffLineSelection | null;
  onStageHunk?: DiffHunkActionHandler;
  onUnstageHunk?: DiffHunkActionHandler;
  onDiscardHunk?: DiffHunkActionHandler;
}

interface DiffHunk extends DiffHunkActionContext {
  id: string;
}

interface DiffLine {
  type: "add" | "remove" | "context" | "header" | "hunk";
  content: string;
  filePath?: string;
  lineNumber?: number;
  oldLineNumber?: number;
  side?: "LEFT" | "RIGHT";
  hunk?: DiffHunk;
}

function parseDiff(diffText: string, fallbackFilePath: string, oldFilePath?: string, isStaged?: boolean): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let currentFilePath: string | undefined;
  let fileHeaderLines: string[] = [];
  let currentHunk: DiffHunk | null = null;
  let currentHunkLines: string[] = [];
  let hunkIndex = 0;

  const finishHunk = () => {
    if (!currentHunk) return;
    currentHunk.patchText = [...fileHeaderLines, ...currentHunkLines].join("\n");
    currentHunk = null;
    currentHunkLines = [];
  };

  const startFileHeader = (line: string) => {
    finishHunk();
    const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    currentFilePath = match ? normalizeDiffPath(match[2]) : currentFilePath;
    fileHeaderLines = [line];
    lines.push({ type: "header", content: line, filePath: currentFilePath });
  };

  const appendFileHeader = (line: string) => {
    fileHeaderLines.push(line);
    lines.push({ type: "header", content: line, filePath: currentFilePath });
  };

  const appendHunkLine = (line: string) => {
    if (currentHunk) currentHunkLines.push(line);
  };

  for (const line of diffText.split("\n")) {
    if (line.startsWith("diff --git")) {
      startFileHeader(line);
    } else if (
      line.startsWith("index ") ||
      line.startsWith("---") ||
      line.startsWith("+++") ||
      line.startsWith("new file") ||
      line.startsWith("deleted file") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("similarity index") ||
      line.startsWith("rename ") ||
      line.startsWith("copy ")
    ) {
      appendFileHeader(line);
    } else if (line.startsWith("@@")) {
      finishHunk();
      const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      const parsedOldStart = match ? parseInt(match[1], 10) : undefined;
      const parsedNewStart = match ? parseInt(match[2], 10) : undefined;
      if (parsedOldStart !== undefined) oldLine = parsedOldStart;
      if (parsedNewStart !== undefined) newLine = parsedNewStart;
      const hunkFilePath = currentFilePath ?? fallbackFilePath;
      currentHunk = {
        id: `${hunkFilePath}:${parsedOldStart ?? "?"}:${parsedNewStart ?? "?"}:${hunkIndex++}`,
        filePath: hunkFilePath,
        oldFilePath,
        header: line,
        oldStart: parsedOldStart,
        newStart: parsedNewStart,
        patchText: "",
        staged: isStaged,
      };
      currentHunkLines = [line];
      lines.push({ type: "hunk", content: line, filePath: currentFilePath, hunk: currentHunk });
    } else if (line.startsWith("+")) {
      appendHunkLine(line);
      lines.push({ type: "add", content: line, filePath: currentFilePath, lineNumber: newLine, side: "RIGHT" });
      newLine++;
    } else if (line.startsWith("-")) {
      appendHunkLine(line);
      lines.push({ type: "remove", content: line, filePath: currentFilePath, oldLineNumber: oldLine, side: "LEFT" });
      oldLine++;
    } else {
      appendHunkLine(line);
      lines.push({
        type: "context",
        content: line,
        filePath: currentFilePath,
        lineNumber: newLine,
        oldLineNumber: oldLine,
        side: "RIGHT",
      });
      oldLine++;
      newLine++;
    }
  }

  finishHunk();
  return lines;
}

function formatLineNumber(n: number | undefined): string {
  if (n === undefined) return "";
  return String(n);
}

function normalizeDiffPath(path: string) {
  return path.startsWith("a/") || path.startsWith("b/") ? path.slice(2) : path;
}

function diffHeaderMatchesFile(header: string, filePath: string | undefined) {
  if (!filePath || !header.startsWith("diff --git ")) return false;

  const normalized = normalizeDiffPath(filePath);
  return header.includes(` a/${normalized}`) || header.includes(` b/${normalized}`);
}
interface HunkActionButtonProps {
  hunk: DiffHunk;
  label: string;
  disabled?: boolean;
  tone?: "default" | "danger";
  onAction?: DiffHunkActionHandler;
}

function HunkActionButton({ hunk, label, disabled, tone = "default", onAction }: HunkActionButtonProps) {
  if (!onAction) return null;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void onAction(hunk);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        "rounded border px-2 py-0.5 text-[10px] font-semibold leading-4 transition-colors disabled:cursor-wait disabled:opacity-50",
        tone === "danger"
          ? "border-[color:rgba(239,68,68,0.45)] bg-[color:rgba(239,68,68,0.10)] text-[var(--color-deleted)] hover:bg-[color:rgba(239,68,68,0.18)]"
          : "border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/18",
      )}
    >
      {label}
    </button>
  );
}

function CopyHunkPatchButton({ hunk }: { hunk: DiffHunk }) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void navigator.clipboard?.writeText(hunk.patchText);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-[10px] font-semibold leading-4 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
      title="Copy hunk patch"
    >
      Copy patch
    </button>
  );
}



export function UnifiedDiffFallback({
  diffText,
  filePath,
  oldFilePath,
  mode: _mode,
  focusedFilePath,
  isStaged,
  isHunkActionPending,
  onLineSelect,
  selectedLine,
  onStageHunk,
  onUnstageHunk,
  onDiscardHunk,
}: UnifiedDiffFallbackProps) {
  const focusedRowRef = useRef<HTMLDivElement | null>(null);
  const lines = useMemo(
    () => parseDiff(diffText, filePath, oldFilePath, isStaged),
    [diffText, filePath, oldFilePath, isStaged],
  );

  useEffect(() => {
    focusedRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusedFilePath, diffText]);

  const rowClass: Record<string, string> = {
    header:
      "bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]",
    hunk: "bg-[var(--color-accent)]/12 text-[var(--color-accent)] font-semibold",
    add: "bg-[var(--color-added-bg)] text-[var(--color-added)]",
    remove: "bg-[var(--color-deleted-bg)] text-[var(--color-deleted)]",
    context: "text-[var(--color-text-secondary)]",
  };

  const gutterClass: Record<string, string> = {
    header: "text-[var(--color-text-muted)] border-r border-[var(--color-border-muted)]/60",
    hunk: "text-[var(--color-accent)]/80 border-r border-[var(--color-accent)]/20",
    add: "text-[var(--color-added)]/70 border-r border-[var(--color-added)]/25",
    remove:
      "text-[var(--color-deleted)]/70 border-r border-[var(--color-deleted)]/25",
    context: "text-[var(--color-text-muted)] border-r border-[var(--color-border-muted)]/60",
  };

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-primary)]">
      <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-[12px] text-[var(--color-text-secondary)]">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent)]/15 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/25">
            <FileCode2 className="h-3.5 w-3.5" />
          </div>
          <span className="font-semibold text-[var(--color-text-primary)]">
            Unified Diff
          </span>
          <span className="min-w-0 truncate font-mono text-[11px] text-[var(--color-text-muted)]">
            {focusedFilePath ?? filePath}
          </span>
          <span className="ml-auto rounded-full border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
            unified
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        <div className="min-w-max overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] font-mono text-[12px] leading-5 shadow-inner">
          {lines.map((line, i) => {
            const isFocusedFileHeader = diffHeaderMatchesFile(line.content, focusedFilePath);
            const selectableLine = line.side === "LEFT" ? line.oldLineNumber : line.lineNumber;
            const canSelectLine = Boolean(onLineSelect && line.filePath && line.side && selectableLine);
            const isSelectedLine = Boolean(
              selectedLine &&
                line.filePath === selectedLine.filePath &&
                line.side === selectedLine.side &&
                selectableLine === selectedLine.line,
            );
            const canActOnHunk = Boolean(line.hunk && (onStageHunk || onUnstageHunk || onDiscardHunk));

            return (
            <div
              key={i}
              ref={isFocusedFileHeader ? focusedRowRef : undefined}
              role={canSelectLine ? "button" : undefined}
              tabIndex={canSelectLine ? 0 : undefined}
              onClick={canSelectLine ? () => onLineSelect?.({ filePath: line.filePath!, line: selectableLine!, side: line.side! }) : undefined}
              onKeyDown={canSelectLine ? (event) => { if (event.key === "Enter") onLineSelect?.({ filePath: line.filePath!, line: selectableLine!, side: line.side! }); } : undefined}
              className={cn("flex whitespace-pre", rowClass[line.type], canSelectLine && "cursor-pointer hover:ring-1 hover:ring-inset hover:ring-[var(--color-accent)]/60", isSelectedLine && "ring-2 ring-inset ring-[var(--color-accent)]", isFocusedFileHeader && "ring-2 ring-inset ring-[var(--color-accent)] bg-[var(--color-accent)]/18")}
            >
              <span
                className={cn(
                  "grid w-[88px] shrink-0 grid-cols-2 gap-1 px-2 text-right text-[11px] select-none",
                  gutterClass[line.type],
                )}
              >
                <span>{formatLineNumber(line.oldLineNumber)}</span>
                <span>{formatLineNumber(line.lineNumber)}</span>
              </span>
              <span
                className={cn(
                  "w-6 shrink-0 border-r border-[var(--color-border-muted)]/60 text-center select-none",
                  line.type === "add" && "text-[var(--color-added)]/80",
                  line.type === "remove" && "text-[var(--color-deleted)]/80",
                  line.type !== "add" && line.type !== "remove" && "text-[var(--color-text-muted)]"
                )}
              >
                {line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}
              </span>
              <span className={cn("min-w-0 flex-1 px-3 whitespace-pre", canActOnHunk && "pr-2")}>
                {line.content || " "}
              </span>
              {line.hunk && canActOnHunk ? (
                <div className="sticky right-0 ml-4 flex shrink-0 items-center gap-1 bg-inherit px-2 py-0.5 font-sans whitespace-normal">
                  <CopyHunkPatchButton hunk={line.hunk} />
                  <HunkActionButton hunk={line.hunk} label="Stage" disabled={isHunkActionPending} onAction={onStageHunk} />
                  <HunkActionButton hunk={line.hunk} label="Unstage" disabled={isHunkActionPending} onAction={onUnstageHunk} />
                  <HunkActionButton hunk={line.hunk} label="Discard" disabled={isHunkActionPending} tone="danger" onAction={onDiscardHunk} />
                </div>
              ) : null}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
