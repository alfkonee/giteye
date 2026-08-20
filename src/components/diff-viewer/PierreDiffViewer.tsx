import { useMemo } from "react";
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


interface PierreDiffViewerProps extends DiffViewerProps {
  /** 1-based first line of the active hunk on the additions side. */
  activeHunkStart?: number;
  /** Line count the active hunk spans on the additions side. */
  activeHunkLineCount?: number;
}

export function PierreDiffViewer({
  activeHunkStart,
  activeHunkLineCount,
  ...props
}: PierreDiffViewerProps) {
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

  // Marks the hunk chosen in the navigator rail so the reader can see where the
  // Stage/Discard buttons in the rail will apply.
  const selectedLines = useMemo(
    () =>
      activeHunkStart === undefined
        ? null
        : {
            start: activeHunkStart,
            end: activeHunkStart + Math.max(1, activeHunkLineCount ?? 1) - 1,
            side: "additions" as const,
          },
    [activeHunkStart, activeHunkLineCount],
  );

  return (
    <PatchDiff
      patch={props.diffText}
      options={options}
      selectedLines={selectedLines}
      className="h-full"
    />
  );
}
