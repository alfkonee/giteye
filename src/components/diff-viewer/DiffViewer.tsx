import { Component, type MouseEvent, type ReactNode } from "react";
import type { DiffHunkActionContext, DiffHunkActionHandler, DiffViewerProps } from "./DiffViewer.types";
import { PierreDiffViewer } from "./PierreDiffViewer";
import { UnifiedDiffFallback } from "./UnifiedDiffFallback";
import { ErrorCallout } from "../common/ErrorCallout";
import { FileText, FileWarning, Loader2 } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class DiffErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
interface ParsedActionHunk extends DiffHunkActionContext {
  id: string;
}

function normalizeDiffPath(path: string) {
  return path.startsWith("a/") || path.startsWith("b/") ? path.slice(2) : path;
}

function isDiffFileHeaderLine(line: string) {
  return (
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
  );
}

function parseActionHunks(
  diffText: string,
  fallbackFilePath: string,
  oldFilePath?: string,
  staged?: boolean,
): ParsedActionHunk[] {
  const hunks: ParsedActionHunk[] = [];
  let currentFilePath: string | undefined;
  let fileHeaderLines: string[] = [];
  let currentHunk: ParsedActionHunk | null = null;
  let currentHunkLines: string[] = [];
  let hunkIndex = 0;

  const finishHunk = () => {
    if (!currentHunk) return;
    currentHunk.patchText = [...fileHeaderLines, ...currentHunkLines].join("\n");
    currentHunk = null;
    currentHunkLines = [];
  };

  for (const line of diffText.split("\n")) {
    if (line.startsWith("diff --git")) {
      finishHunk();
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      currentFilePath = match ? normalizeDiffPath(match[2]) : currentFilePath;
      fileHeaderLines = [line];
    } else if (isDiffFileHeaderLine(line)) {
      fileHeaderLines.push(line);
    } else if (line.startsWith("@@")) {
      finishHunk();
      const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      const oldStart = match ? parseInt(match[1], 10) : undefined;
      const newStart = match ? parseInt(match[2], 10) : undefined;
      const filePath = currentFilePath ?? fallbackFilePath;
      currentHunk = {
        id: `${filePath}:${oldStart ?? "?"}:${newStart ?? "?"}:${hunkIndex++}`,
        filePath,
        oldFilePath,
        header: line,
        oldStart,
        newStart,
        patchText: "",
        staged,
      };
      currentHunkLines = [line];
      hunks.push(currentHunk);
    } else if (currentHunk) {
      currentHunkLines.push(line);
    }
  }

  finishHunk();
  return hunks;
}

interface ToolbarButtonProps {
  hunk: ParsedActionHunk;
  label: string;
  disabled?: boolean;
  tone?: "default" | "danger";
  onAction?: DiffHunkActionHandler;
}

function ToolbarButton({ hunk, label, disabled, tone = "default", onAction }: ToolbarButtonProps) {
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
      className={
        "rounded border px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:cursor-wait disabled:opacity-50 " +
        (tone === "danger"
          ? "border-[color:rgba(239,68,68,0.45)] bg-[color:rgba(239,68,68,0.10)] text-[var(--color-deleted)] hover:bg-[color:rgba(239,68,68,0.18)]"
          : "border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/18")
      }
    >
      {label}
    </button>
  );
}

interface DiffHunkActionToolbarProps {
  hunks: ParsedActionHunk[];
  isPending?: boolean;
  onStageHunk?: DiffHunkActionHandler;
  onUnstageHunk?: DiffHunkActionHandler;
  onDiscardHunk?: DiffHunkActionHandler;
}

function DiffHunkActionToolbar({
  hunks,
  isPending,
  onStageHunk,
  onUnstageHunk,
  onDiscardHunk,
}: DiffHunkActionToolbarProps) {
  if (hunks.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-[var(--color-text-muted)]">
        <span className="font-semibold uppercase tracking-[0.08em]">Patch hunks</span>
        <span>{hunks.length} selectable</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {hunks.map((hunk, index) => (
          <div
            key={hunk.id}
            className="flex shrink-0 items-center gap-2 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-[11px]"
          >
            <span className="max-w-[18rem] truncate font-mono text-[var(--color-text-secondary)]">
              Hunk {index + 1} · {hunk.filePath} · {hunk.header}
            </span>
            <ToolbarButton hunk={hunk} label="Stage" disabled={isPending} onAction={onStageHunk} />
            <ToolbarButton hunk={hunk} label="Unstage" disabled={isPending} onAction={onUnstageHunk} />
            <ToolbarButton hunk={hunk} label="Discard" disabled={isPending} tone="danger" onAction={onDiscardHunk} />
          </div>
        ))}
      </div>
    </div>
  );
}


/**
 * DiffViewer is the public API for diff rendering in GitEye.
 *
 * Rendering path:
 *  1. Loading / error / binary / empty states rendered directly.
 *  2. Primary: PierreDiffViewer (@pierre/diffs PatchDiff with syntax highlighting)
 *  3. Fallback: UnifiedDiffFallback (plain-text with line numbers and semantic colors)
 *
 * An error boundary wraps the primary renderer so any runtime issue in
 * @pierre/diffs gracefully degrades to the fallback.
 */
export function DiffViewer(props: DiffViewerProps) {
  const { diffText, filePath, isBinary, isLoading, error, focusedFilePath } = props;

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--color-bg-primary)] p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] text-[var(--color-accent)]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
        <p className="text-[12px] text-[var(--color-text-muted)]">Loading diff...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full bg-[var(--color-bg-primary)] p-4">
        <ErrorCallout message={error} />
      </div>
    );
  }

  // Binary file state
  if (isBinary) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--color-bg-primary)] p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]">
          <FileWarning className="h-5 w-5" />
        </div>
        <p className="text-[13px] font-medium text-[var(--color-text-secondary)]">Binary file</p>
        <p className="max-w-full truncate font-mono text-[11px] text-[var(--color-text-muted)]">{filePath}</p>
      </div>
    );
  }

  // Empty diff state
  if (!diffText || diffText.trim().length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--color-bg-primary)] p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]">
          <FileText className="h-5 w-5" />
        </div>
        <p className="text-[13px] font-medium text-[var(--color-text-secondary)]">No changes</p>
        <p className="max-w-full truncate font-mono text-[11px] text-[var(--color-text-muted)]">{filePath}</p>
      </div>
    );
  }

  const fallback = (
    <UnifiedDiffFallback {...props} />
  );
  const hasHunkActions = Boolean(props.onStageHunk || props.onUnstageHunk || props.onDiscardHunk);
  const actionHunks = hasHunkActions
    ? parseActionHunks(diffText, filePath, props.oldFilePath, props.isStaged)
    : [];

  if (focusedFilePath) {
    return fallback;
  }

  const primary = <PierreDiffViewer {...props} />;

  return (
    <DiffErrorBoundary fallback={fallback}>
      {hasHunkActions ? (
        <div className="flex h-full min-h-0 flex-col">
          <DiffHunkActionToolbar
            hunks={actionHunks}
            isPending={props.isHunkActionPending}
            onStageHunk={props.onStageHunk}
            onUnstageHunk={props.onUnstageHunk}
            onDiscardHunk={props.onDiscardHunk}
          />
          <div className="min-h-0 flex-1">{primary}</div>
        </div>
      ) : (
        primary
      )}
    </DiffErrorBoundary>
  );
}
