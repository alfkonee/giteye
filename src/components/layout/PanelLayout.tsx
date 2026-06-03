import { useCallback, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useAppStore } from "../../stores/app-store";
import { WorkingTree } from "../working-tree/WorkingTree";
import { CommitHistory } from "../commit-history/CommitHistory";
import { CommitDetails } from "../commit-history/CommitDetails";
import { SettingsPlaceholder } from "../settings/SettingsPlaceholder";
import { StackedPrBoard } from "../stacked-prs/StackedPrBoard";
import { DiffReviewStudio } from "../review-studio/DiffReviewStudio";
import { WorktreesSubmodules } from "../workspaces/WorktreesSubmodules";
import { RebaseConflictResolver } from "../rebase/RebaseConflictResolver";
import { DiffViewer } from "../diff-viewer/DiffViewer";
import { useFileDiff, useCommitDetails } from "../../hooks/useCommitHistory";
import { EmptyState } from "../common/EmptyState";
import { FolderOpen } from "lucide-react";

export function PanelLayout() {
  const activeView = useAppStore((s) => s.activeView);
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const selectedFilePath = useAppStore((s) => s.selectedFilePath);
  const selectedFileStaged = useAppStore((s) => s.selectedFileStaged);
  const selectedCommitHash = useAppStore((s) => s.selectedCommitHash);

  const [mainPanelSize, setMainPanelSize] = useState(60);

  const { data: fileDiff, isLoading: diffLoading, error: diffError } = useFileDiff(
    activeRepoPath,
    selectedFilePath,
    selectedFileStaged
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
  }, [selectedFilePath, selectedCommitHash, fileDiff, diffLoading, diffError]);

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
        <div className="h-full overflow-hidden border-r border-[var(--color-border-muted)]">
          {renderMainContent()}
        </div>
      </Panel>
      <PanelResizeHandle className="group w-1 bg-[var(--color-border-muted)] hover:bg-[var(--color-accent)] active:bg-[var(--color-accent)] transition-colors cursor-col-resize relative">
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
  const { data: details, isLoading } = useCommitDetails(activeRepoPath, selectedCommitHash);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[var(--color-text-muted)]">
        Loading commit details...
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
