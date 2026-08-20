import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { DiffHunkActionContext, DiffHunkActionHandler, DiffViewerProps } from "./DiffViewer.types";
import { PierreDiffViewer } from "./PierreDiffViewer";
import { UnifiedDiffFallback } from "./UnifiedDiffFallback";
import { ErrorCallout } from "../common/ErrorCallout";
import { cn } from "../../lib/cn";
import { ChevronDown, ChevronRight, ChevronUp, FileText, FileWarning, Loader2 } from "lucide-react";

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
  /** Zero-based position of this hunk within the whole patch. */
  index: number;
  /** Line count the hunk occupies on the additions side, from the `@@` header. */
  newLineCount: number;
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
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      const oldStart = match ? parseInt(match[1], 10) : undefined;
      const newStart = match ? parseInt(match[3], 10) : undefined;
      const newLineCount = match ? (match[4] === undefined ? 1 : parseInt(match[4], 10)) : 0;
      const filePath = currentFilePath ?? fallbackFilePath;
      const index = hunkIndex++;
      currentHunk = {
        id: `${filePath}:${oldStart ?? "?"}:${newStart ?? "?"}:${index}`,
        index,
        newLineCount,
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

interface DiffHunkNavigatorProps {
  hunks: ParsedActionHunk[];
  activeHunk: ParsedActionHunk | null;
  onSelect: (hunk: ParsedActionHunk) => void;
  isPending?: boolean;
  onStageHunk?: DiffHunkActionHandler;
  onUnstageHunk?: DiffHunkActionHandler;
  onDiscardHunk?: DiffHunkActionHandler;
}

interface HunkRowProps {
  hunk: ParsedActionHunk;
  isActive: boolean;
  onSelect: (hunk: ParsedActionHunk) => void;
  isPending?: boolean;
  onStageHunk?: DiffHunkActionHandler;
  onUnstageHunk?: DiffHunkActionHandler;
  onDiscardHunk?: DiffHunkActionHandler;
}

function HunkRow({
  hunk,
  isActive,
  onSelect,
  isPending,
  onStageHunk,
  onUnstageHunk,
  onDiscardHunk,
}: HunkRowProps) {
  return (
    <>
      <button
        type="button"
        aria-pressed={isActive}
        title={`Go to hunk ${hunk.index + 1} · ${hunk.filePath} ${hunk.header}`}
        onClick={() => onSelect(hunk)}
        className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
      >
        <span
          className={cn(
            "shrink-0 tabular-nums",
            isActive ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]",
          )}
        >
          {hunk.index + 1}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-mono",
            isActive ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]",
          )}
        >
          {hunk.filePath} · {hunk.header}
        </span>
      </button>
      {isActive ? (
        <div className="flex shrink-0 items-center gap-1">
          <ToolbarButton hunk={hunk} label="Stage" disabled={isPending} onAction={onStageHunk} />
          <ToolbarButton hunk={hunk} label="Unstage" disabled={isPending} onAction={onUnstageHunk} />
          <ToolbarButton hunk={hunk} label="Discard" disabled={isPending} tone="danger" onAction={onDiscardHunk} />
        </div>
      ) : null}
    </>
  );
}

/**
 * Hunk list pinned above the diff body, collapsed to a single row by default.
 *
 * Collapsed it shows only the active hunk plus prev/next, so it costs one row of
 * height and still drives navigation; expanded it becomes the full scrollable
 * list of hunks. Either way selecting a hunk scrolls the diff body to it, and
 * only the active row carries Stage/Unstage/Discard so the controls always sit
 * next to the hunk they operate on.
 */
function DiffHunkNavigator({
  hunks,
  activeHunk,
  onSelect,
  isPending,
  onStageHunk,
  onUnstageHunk,
  onDiscardHunk,
}: DiffHunkNavigatorProps) {
  const [expanded, setExpanded] = useState(false);
  const activeRowRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (expanded) activeRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [expanded, activeHunk?.id]);

  if (hunks.length === 0) return null;

  const activeIndex = activeHunk ? activeHunk.index : 0;
  const current = hunks[activeIndex] ?? hunks[0];
  const step = (delta: number) => {
    const next = hunks[Math.min(hunks.length - 1, Math.max(0, activeIndex + delta))];
    if (next) onSelect(next);
  };

  const rowActions = { isPending, onStageHunk, onUnstageHunk, onDiscardHunk };

  return (
    <div className="flex max-h-[45%] shrink-0 flex-col border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      <div className="flex shrink-0 items-center gap-2 px-2 pt-1 text-[11px] text-[var(--color-text-muted)]">
        <button
          type="button"
          aria-expanded={expanded}
          title={expanded ? "Collapse hunk list" : `Show all ${hunks.length} hunks`}
          onClick={() => setExpanded((open) => !open)}
          className="inline-flex items-center gap-1 font-semibold uppercase tracking-[0.08em] transition-colors hover:text-[var(--color-text-primary)]"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Patch hunks
        </button>
        <div className="flex-1" />
        <span className="tabular-nums">
          Hunk {activeIndex + 1} of {hunks.length}
        </span>
        <button
          type="button"
          aria-label="Previous hunk"
          title="Previous hunk"
          disabled={activeIndex === 0}
          onClick={() => step(-1)}
          className="giteye-btn giteye-btn-ghost giteye-btn-icon giteye-btn-sm disabled:opacity-40"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Next hunk"
          title="Next hunk"
          disabled={activeIndex >= hunks.length - 1}
          onClick={() => step(1)}
          className="giteye-btn giteye-btn-ghost giteye-btn-icon giteye-btn-sm disabled:opacity-40"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded ? (
        <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
          {hunks.map((hunk) => {
            const isActive = hunk.index === activeIndex;
            return (
              <li
                key={hunk.id}
                ref={isActive ? activeRowRef : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1 text-[11px] transition-colors",
                  isActive
                    ? "giteye-selected-row border-[var(--color-accent)]/50"
                    : "border-transparent hover:bg-[var(--color-bg-hover)]",
                )}
              >
                <HunkRow hunk={hunk} isActive={isActive} onSelect={onSelect} {...rowActions} />
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex shrink-0 items-center gap-2 px-3.5 py-1 text-[11px]">
          <HunkRow hunk={current} isActive onSelect={onSelect} {...rowActions} />
        </div>
      )}
    </div>
  );
}

/** Frames to keep retrying while the renderer commits the new selection. */
const HUNK_SCROLL_MAX_FRAMES = 12;

function findHunkRow(
  container: HTMLElement,
  hunk: ParsedActionHunk,
  allowUnconfirmed: boolean,
): HTMLElement | null {
  // UnifiedDiffFallback anchors its `@@` rows directly — exact and synchronous.
  const anchored = container.querySelector<HTMLElement>(
    `[data-hunk-id="${CSS.escape(hunk.id)}"]`,
  );
  if (anchored) return anchored;

  // @pierre/diffs renders into a `<diffs-container>` shadow root. It resolves the
  // `selectedLines` range we hand it into `data-selected-line="first"` on the
  // hunk's opening row. `data-line-index` is a rendered-row ordinal rather than a
  // line number, so `data-column-number` (the printed line number) is what pins
  // the marker to *this* hunk instead of the previously selected one.
  const shadowRoot = container.querySelector("diffs-container")?.shadowRoot;
  if (!shadowRoot) return null;

  if (hunk.newStart === undefined) {
    return shadowRoot.querySelector<HTMLElement>('[data-selected-line="first"]');
  }

  const confirmed = shadowRoot.querySelector<HTMLElement>(
    `[data-selected-line="first"][data-column-number="${hunk.newStart}"]`,
  );
  if (confirmed) return confirmed;

  // Selection never landed (older renderer state, collapsed region): fall back to
  // the printed line number so navigation still moves the viewport.
  return allowUnconfirmed
    ? shadowRoot.querySelector<HTMLElement>(`[data-column-number="${hunk.newStart}"]`)
    : null;
}

/**
 * Brings a hunk into view in whichever renderer is mounted. The marked row only
 * exists once the renderer has committed the new active hunk, so this polls a
 * bounded number of animation frames before settling for a positional match.
 */
function scrollToHunk(container: HTMLElement | null, hunk: ParsedActionHunk) {
  if (!container) return;

  let frames = 0;
  const attempt = () => {
    const isLastFrame = frames >= HUNK_SCROLL_MAX_FRAMES - 1;
    const row = findHunkRow(container, hunk, isLastFrame);
    if (row) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (!isLastFrame) {
      frames += 1;
      requestAnimationFrame(attempt);
    }
  };
  attempt();
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
  const { diffText, filePath, isBinary, truncated, isLoading, error, focusedFilePath } = props;
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [activeHunkId, setActiveHunkId] = useState<string | null>(null);

  const hasHunkActions = Boolean(props.onStageHunk || props.onUnstageHunk || props.onDiscardHunk);
  const actionHunks = useMemo(
    () =>
      hasHunkActions && diffText
        ? parseActionHunks(diffText, filePath, props.oldFilePath, props.isStaged)
        : [],
    [hasHunkActions, diffText, filePath, props.oldFilePath, props.isStaged],
  );

  // A new patch invalidates the previous selection; fall back to the first hunk.
  useEffect(() => {
    setActiveHunkId(null);
  }, [diffText, filePath]);

  const activeHunk =
    actionHunks.find((hunk) => hunk.id === activeHunkId) ?? actionHunks[0] ?? null;

  const handleSelectHunk = useCallback((hunk: ParsedActionHunk) => {
    setActiveHunkId(hunk.id);
    // Let the highlight commit before asking the renderer to scroll.
    requestAnimationFrame(() => scrollToHunk(bodyRef.current, hunk));
  }, []);

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
    <UnifiedDiffFallback {...props} activeHunkId={activeHunk?.id ?? null} />
  );

  if (focusedFilePath) {
    return fallback;
  }

  const primary = (
    <PierreDiffViewer
      {...props}
      activeHunkStart={activeHunk?.newStart}
      activeHunkLineCount={activeHunk?.newLineCount}
    />
  );

  const truncatedNotice = truncated ? (
    <div className="flex items-center gap-2 border-b border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-3 py-2">
      <FileWarning className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
      <p className="text-[12px] text-[var(--color-text-muted)]">
        Diff truncated to the first 4&nbsp;MiB. The file is too large to render in full.
      </p>
    </div>
  ) : null;

  const body = hasHunkActions ? (
    <div className="flex h-full min-h-0 flex-col">
      <DiffHunkNavigator
        hunks={actionHunks}
        activeHunk={activeHunk}
        onSelect={handleSelectHunk}
        isPending={props.isHunkActionPending}
        onStageHunk={props.onStageHunk}
        onUnstageHunk={props.onUnstageHunk}
        onDiscardHunk={props.onDiscardHunk}
      />
      {/*
        The diff body owns its scrolling so the hunk list above stays pinned;
        otherwise navigating to a late hunk scrolls the list itself off-screen.
      */}
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto">{primary}</div>
    </div>
  ) : (
    primary
  );

  return (
    <DiffErrorBoundary fallback={fallback}>
      {truncatedNotice}
      {body}
    </DiffErrorBoundary>
  );
}
