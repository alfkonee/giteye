import { useMemo, Component, type ReactNode } from "react";
import type { DiffViewerProps } from "./DiffViewer.types";
import { useAppStore } from "../../stores/app-store";
import { PatchDiff } from "@pierre/diffs/react";
import type { DiffsThemeNames } from "@pierre/diffs";

/**
 * PierreDiffViewer — @pierre/diffs integration for syntax-highlighted diffs.
 *
 * Wraps PatchDiff (which parses the raw patch string and renders a unified or
 * split diff) with theme selection based on GitEye's app store theme state.
 *
 * The `options.theme` field accepts DiffsThemeNames string values including:
 *  - `"github-light"`, `"github-dark"` (Shiki bundled themes)
 *  - `"pierre-light"`, `"pierre-dark"`, `"pierre-light-soft"`, `"pierre-dark-soft"`
 *
 * We use github-light/github-dark because they are always available without
 * custom theme registration.
 *
 * Error handling: PatchDiff is expected to render gracefully even for
 * malformed patches (it internally parses with getSingularPatch and may
 * produce zero hunks). If a runtime error occurs, React's error boundary
 * (at the DiffViewer level) will fall back to UnifiedDiffFallback.
 */

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
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
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export function PierreDiffViewer(props: DiffViewerProps) {
  const theme = useAppStore((s) => s.theme);
  const diffTheme: DiffsThemeNames = theme === "light" ? "github-light" : "github-dark";

  const options = useMemo(
    () => ({
      theme: diffTheme,
      diffStyle: props.mode === "split" ? ("split" as const) : ("unified" as const),
      disableLineNumbers: false,
      overflow: "scroll" as const,
    }),
    [diffTheme, props.mode],
  );

  const diffContent = (
    <PatchDiff
      patch={props.diffText}
      options={options}
      className="h-full"
    />
  );

  return (
    <DiffErrorBoundary
      fallback={
        <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
          <p className="text-xs text-[var(--color-text-muted)]">
            Diff rendering error — using fallback viewer
          </p>
        </div>
      }
    >
      {diffContent}
    </DiffErrorBoundary>
  );
}
