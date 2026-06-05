import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useAppStore } from "../../stores/app-store";
import { gitQueries } from "../../lib/git-data";
import { WorkingTree } from "../working-tree/WorkingTree";
import { CommitHistory } from "../commit-history/CommitHistory";
import { CommitDetails } from "../commit-history/CommitDetails";
import { SettingsPlaceholder } from "../settings/SettingsPlaceholder";
import { StackedPrBoard } from "../stacked-prs/StackedPrBoard";
import { DiffReviewStudio } from "../review-studio/DiffReviewStudio";
import { WorktreesSubmodules } from "../workspaces/WorktreesSubmodules";
import { RebaseConflictResolver } from "../rebase/RebaseConflictResolver";
import { DiffViewer } from "../diff-viewer/DiffViewer";
import { EmptyState } from "../common/EmptyState";
import { ErrorCallout } from "../common/ErrorCallout";
import { ArrowLeft, FolderOpen } from "lucide-react";

export function PanelLayout() {
  const activeView = useAppStore((s) => s.activeView);
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const selectedFilePath = useAppStore((s) => s.selectedFilePath);
  const selectedFileStaged = useAppStore((s) => s.selectedFileStaged);
  const selectedCommitHash = useAppStore((s) => s.selectedCommitHash);
  const selectedCommitFilePath = useAppStore((s) => s.selectedCommitFilePath);

  const [mainPanelSize, setMainPanelSize] = useState(60);

  const { data: fileDiff, isLoading: diffLoading, error: diffError } = useQuery(
    gitQueries.fileDiff(activeRepoPath, selectedFilePath, selectedFileStaged)
  );

  const renderMainContent = useCallback(() => {
    switch (activeView) {
      case "working-tree":
        return <WorkingTree />;
      case "history":
        return <CommitHistory />;
      case "stacked-prs":
        return <StackedPrBoard />;
      case "review-studio":
        return <DiffReviewStudio />;
      case "worktrees":
      case "submodules":
        return <WorktreesSubmodules />;
      case "rebase-conflicts":
        return <RebaseConflictResolver />;
      case "settings":
        return <SettingsPlaceholder />;
    }
  }, [activeView]);

  const renderDetailPane = useCallback(() => {
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
          mode="unified"
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
          mode="unified"
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
  }, [selectedFilePath, selectedCommitHash, selectedCommitFilePath, fileDiff, diffLoading, diffError]);

  const showDetailPane = activeView === "working-tree" || activeView === "history";

  if (!showDetailPane) {
    return (
      <div className="h-full overflow-hidden bg-[var(--color-bg-primary)]">
        {renderMainContent()}
      </div>
    );
  }

  return (
    <PanelGroup direction="horizontal" className="h-full bg-[var(--color-bg-primary)]">
      <Panel
        defaultSize={mainPanelSize}
        minSize={30}
        onResize={setMainPanelSize}
      >
        <div className="h-full overflow-hidden">
          {renderMainContent()}
        </div>
      </Panel>
      <PanelResizeHandle className="group relative w-px cursor-col-resize bg-[var(--color-border-muted)] transition-colors hover:bg-[var(--color-accent)] active:bg-[var(--color-accent)]">
        <div className="absolute inset-y-0 -left-1 -right-1" />
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
          mode="unified"
          focusedFilePath={selectedCommitFilePath ?? undefined}
        />
      </div>
    </div>
  );
}
