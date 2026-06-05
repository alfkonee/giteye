import { Component, type ReactNode } from "react";
import type { DiffViewerProps } from "./DiffViewer.types";
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
  const { diffText, filePath, isBinary, isLoading, error, mode, focusedFilePath } = props;

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
    <UnifiedDiffFallback diffText={diffText} filePath={filePath} mode={mode} focusedFilePath={focusedFilePath} />
  );

  if (focusedFilePath) {
    return fallback;
  }

  return (
    <DiffErrorBoundary fallback={fallback}>
      <PierreDiffViewer {...props} />
    </DiffErrorBoundary>
  );
}
