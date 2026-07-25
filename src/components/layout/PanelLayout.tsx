import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useAppStore } from "../../stores/app-store";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { getViewDefinition } from "../../lib/view-registry";
import { CommitDetails } from "../commit-history/CommitDetails";
import { DiffViewer } from "../diff-viewer/DiffViewer";
import type { DiffHunkActionContext } from "../diff-viewer/DiffViewer.types";
import { EmptyState } from "../common/EmptyState";
import { FileTree } from "../common/FileTree";
import { ErrorCallout } from "../common/ErrorCallout";
import { ArrowLeft, FolderOpen } from "lucide-react";

export function PanelLayout() {
  const activeView = useAppStore((s) => s.activeView);
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const selectedFilePath = useAppStore((s) => s.selectedFilePath);
  const selectedFileStaged = useAppStore((s) => s.selectedFileStaged);
  const diffMode = useAppStore((s) => s.diffMode);
  const selectedCommitHash = useAppStore((s) => s.selectedCommitHash);
  const selectedCommitRange = useAppStore((s) => s.selectedCommitRange);
  const selectedCommitFilePath = useAppStore((s) => s.selectedCommitFilePath);
  const queryClient = useQueryClient();
  const activeViewDefinition = getViewDefinition(activeView);

  const { data: fileDiff, isLoading: diffLoading, error: diffError } = useQuery(
    gitQueries.fileDiff(activeRepoPath, selectedFilePath, selectedFileStaged)
  );
  const { mutate: stageHunk, isPending: isStageHunkPending } = useMutation(gitMutations.stageHunk(queryClient, activeRepoPath));
  const { mutate: unstageHunk, isPending: isUnstageHunkPending } = useMutation(gitMutations.unstageHunk(queryClient, activeRepoPath));
  const { mutate: discardHunk, isPending: isDiscardHunkPending } = useMutation(gitMutations.discardHunk(queryClient, activeRepoPath));

  const handleStageHunk = useCallback((hunk: DiffHunkActionContext) => {
    if (!activeRepoPath) return;
    stageHunk({ filePath: hunk.filePath, hunkPatch: hunk.patchText });
  }, [activeRepoPath, stageHunk]);

  const handleUnstageHunk = useCallback((hunk: DiffHunkActionContext) => {
    if (!activeRepoPath) return;
    unstageHunk({ filePath: hunk.filePath, hunkPatch: hunk.patchText });
  }, [activeRepoPath, unstageHunk]);

  const handleDiscardHunk = useCallback((hunk: DiffHunkActionContext) => {
    if (!activeRepoPath) return;
    if (
      !window.confirm(
        `Discard this hunk from "${hunk.filePath}"?\n\nThis cannot be undone from GitEye. Recovery may only be possible from editor/OS backups, so stash or commit first if you need a Git safety net.`,
      )
    ) {
      return;
    }
    discardHunk({ filePath: hunk.filePath, hunkPatch: hunk.patchText, staged: Boolean(hunk.staged) });
  }, [activeRepoPath, discardHunk]);

  const mainContent = activeViewDefinition.render();

  const renderDetailPane = useCallback(() => {
    if (selectedCommitRange.length === 2) {
      return <CommitRangeDiffWrapper />;
    }

    if (selectedCommitHash && selectedCommitFilePath) {
      return <CommitDiffWrapper />;
    }

    if (selectedCommitHash) {
      return <CommitDetailsWrapper />;
    }

    if (selectedFilePath && fileDiff) {
      return (
        <DiffViewer
          diffText={fileDiff.diffText}
          filePath={fileDiff.filePath}
          oldFilePath={fileDiff.oldFilePath ?? undefined}
          isBinary={fileDiff.isBinary}
          isLoading={diffLoading}
          error={diffError?.toString() ?? null}
          mode={diffMode}
          isStaged={selectedFileStaged}
          isHunkActionPending={isStageHunkPending || isUnstageHunkPending || isDiscardHunkPending}
          onStageHunk={selectedFileStaged ? undefined : handleStageHunk}
          onUnstageHunk={selectedFileStaged ? handleUnstageHunk : undefined}
          onDiscardHunk={handleDiscardHunk}
        />
      );
    }

    if (selectedFilePath && diffLoading) {
      return (
        <DiffViewer
          diffText=""
          filePath={selectedFilePath}
          isLoading={true}
          error={null}
          mode={diffMode}
        />
      );
    }

    return (
      <EmptyState
        icon={<FolderOpen className="w-8 h-8" />}
        title="No Selection"
        description="Select a file or commit to view details"
      />
    );
  }, [selectedFilePath, selectedCommitHash, selectedCommitRange, selectedCommitFilePath, fileDiff, diffLoading, diffError, diffMode, selectedFileStaged, isStageHunkPending, isUnstageHunkPending, isDiscardHunkPending, handleStageHunk, handleUnstageHunk, handleDiscardHunk]);

  const showDetailPane = Boolean(activeViewDefinition.detailPane);

  if (!showDetailPane) {
    return (
      <div className="h-full overflow-hidden bg-[var(--color-bg-primary)]">
        {mainContent}
      </div>
    );
  }

  return (
    <PanelGroup direction="horizontal" className="h-full bg-[var(--color-bg-primary)]">
      <Panel
        defaultSize={60}
        minSize={30}
      >
        <div className="h-full overflow-hidden">
          {mainContent}
        </div>
      </Panel>
      <PanelResizeHandle className="group relative w-px cursor-col-resize bg-[var(--color-border-muted)] transition-colors hover:bg-[var(--color-accent)] active:bg-[var(--color-accent)]">
        <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
        <div className="absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-border-strong)] opacity-0 transition-opacity group-hover:opacity-80 group-active:bg-[var(--color-accent)] group-active:opacity-100" />
      </PanelResizeHandle>
      <Panel defaultSize={40} minSize={20}>
        <div className="h-full overflow-auto bg-[var(--color-bg-primary)]">
          {renderDetailPane()}
        </div>
      </Panel>
    </PanelGroup>
  );
}

function CommitDetailsWrapper() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const selectedCommitHash = useAppStore((s) => s.selectedCommitHash);
  const { data: details, isLoading, error } = useQuery(gitQueries.commitDetails(activeRepoPath, selectedCommitHash));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[var(--color-text-muted)]">
        Loading commit details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <ErrorCallout message={`Failed to load commit details: ${String(error)}`} />
      </div>
    );
  }

  if (!details) {
    return (
      <EmptyState
        icon={<FolderOpen className="w-8 h-8" />}
        title="Commit Not Found"
        description="The selected commit could not be loaded"
      />
    );
  }

  return <CommitDetails commit={details} />;
}

function CommitDiffWrapper() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const selectedCommitHash = useAppStore((s) => s.selectedCommitHash);
  const selectedCommitFilePath = useAppStore((s) => s.selectedCommitFilePath);
  const setSelectedCommitFilePath = useAppStore((s) => s.setSelectedCommitFilePath);
  const diffMode = useAppStore((s) => s.diffMode);
  const { data: commitDiff, isLoading, error } = useQuery(gitQueries.commitDiff(activeRepoPath, selectedCommitHash));

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-xs">
        <button
          type="button"
          onClick={() => setSelectedCommitFilePath(null)}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Commit details
        </button>
        <span className="min-w-0 truncate text-[var(--color-text-muted)]">
          Focusing <span className="font-mono text-[var(--color-text-secondary)]">{selectedCommitFilePath}</span> inside the full commit diff
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <DiffViewer
          diffText={commitDiff?.diffText ?? ""}
          filePath={commitDiff?.filePath ?? selectedCommitHash ?? "commit"}
          oldFilePath={commitDiff?.oldFilePath ?? undefined}
          isBinary={commitDiff?.isBinary}
          isLoading={isLoading}
          error={error?.toString() ?? null}
          mode={diffMode}
          focusedFilePath={selectedCommitFilePath ?? undefined}
        />
      </div>
    </div>
  );
}

function CommitRangeDiffWrapper() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const [baseHash, targetHash] = useAppStore((s) => s.selectedCommitRange);
  const setSelectedCommitRange = useAppStore((s) => s.setSelectedCommitRange);
  const diffMode = useAppStore((s) => s.diffMode);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const {
    data: changedFiles,
    isLoading: isFilesLoading,
    error: filesError,
  } = useQuery(
    gitQueries.commitRangeFiles(activeRepoPath, baseHash ?? null, targetHash ?? null),
  );
  const { data: commitDiff, isLoading, error } = useQuery(
    gitQueries.commitRangeDiff(
      activeRepoPath,
      baseHash ?? null,
      targetHash ?? null,
      selectedFilePath,
    ),
  );
  const rangeLabel = `${baseHash?.slice(0, 8) ?? "base"} → ${targetHash?.slice(0, 8) ?? "target"}`;

  useEffect(() => {
    setSelectedFilePath((current) =>
      current && changedFiles?.includes(current) ? current : changedFiles?.[0] ?? null,
    );
  }, [baseHash, changedFiles, targetHash]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-xs">
        <button
          type="button"
          onClick={() => setSelectedCommitRange(targetHash ? [targetHash] : [])}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Target commit
        </button>
        <span className="min-w-0 truncate text-[var(--color-text-muted)]">
          Comparing <span className="font-mono text-[var(--color-text-secondary)]">{rangeLabel}</span>
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-52 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]/45">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border-muted)] px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              Changed files
            </span>
            <span className="rounded-full border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--color-text-muted)]">
              {changedFiles?.length ?? 0}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {isFilesLoading ? (
              <p className="px-1 py-2 text-[11px] text-[var(--color-text-muted)]">Loading files...</p>
            ) : filesError ? (
              <ErrorCallout message={`Failed to load changed files: ${String(filesError)}`} />
            ) : changedFiles?.length ? (
              <FileTree
                items={changedFiles}
                getPath={(file) => file}
                selectedKey={selectedFilePath}
                onSelect={setSelectedFilePath}
                className="rounded-md"
              />
            ) : (
              <p className="px-1 py-2 text-[11px] text-[var(--color-text-muted)]">No files changed</p>
            )}
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          {selectedFilePath ? (
            <DiffViewer
              diffText={commitDiff?.diffText ?? ""}
              filePath={commitDiff?.filePath ?? selectedFilePath}
              oldFilePath={commitDiff?.oldFilePath ?? undefined}
              isBinary={commitDiff?.isBinary}
              isLoading={isLoading}
              error={error?.toString() ?? null}
              mode={diffMode}
            />
          ) : (
            <EmptyState
              icon={<FolderOpen className="w-8 h-8" />}
              title="No Changed Files"
              description="The selected commits have no file differences"
            />
          )}
        </div>
      </div>
    </div>
  );
}
