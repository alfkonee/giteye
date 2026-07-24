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

  return (
    <PatchDiff
      patch={props.diffText}
      options={options}
      className="h-full"
    />
  );
}
