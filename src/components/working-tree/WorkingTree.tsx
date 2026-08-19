import { useAppStore } from "../../stores/app-store";
import { FileStatusList } from "./FileStatusList";
import { useQuery } from "@tanstack/react-query";
import { gitQueries } from "../../lib/git-data";
import { GitCommitHorizontal } from "lucide-react";
import { WORKING_TREE_COMMIT_HASH } from "../../lib/working-tree-node";

/**
 * Staging surface of the workspace: staged/unstaged lists. The commit UI lives
 * in the detail pane, reached from the Commit button or the history's
 * uncommitted-changes row.
 */
export function WorkingTree() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const setSelectedCommitRange = useAppStore((s) => s.setSelectedCommitRange);
  const { data: snapshot, isLoading } = useQuery(gitQueries.repositorySnapshot(activeRepoPath));

  const status = snapshot?.files ?? [];
  const stagedFiles = status.filter((file) => file.staged);
  const unstagedFiles = status.filter((file) => file.unstaged);
  const summary = snapshot?.summary;
  const stagedCount = summary?.stagedCount ?? stagedFiles.length;
  const unstagedCount = summary?.unstagedCount ?? unstagedFiles.length;
  const ignoredCount = summary?.ignoredCount ?? 0;
  const totalCount = summary?.totalCount ?? stagedFiles.length + unstagedFiles.length;
  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-primary)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 px-2 py-1">
        <h2 className="text-[12px] font-semibold tracking-tight text-[var(--color-text-primary)]">Changes</h2>
        {!isLoading && <span className="giteye-chip tabular-nums">{totalCount}</span>}
        <span className="tabular-nums text-[10.5px] text-[var(--color-text-muted)]">
          {stagedCount} staged · {unstagedCount} unstaged
          {ignoredCount > 0 ? ` · ${ignoredCount} ignored` : ""}
        </span>
        <button
          type="button"
          onClick={() => setSelectedCommitRange([WORKING_TREE_COMMIT_HASH])}
          className="giteye-btn giteye-btn-primary giteye-btn-sm ml-auto shrink-0"
          title="Open the commit UI in the detail pane"
        >
          <GitCommitHorizontal className="h-3.5 w-3.5" />
          Commit
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <FileStatusList
          title="Unstaged"
          files={unstagedFiles}
          isLoading={isLoading}
          repoPath={activeRepoPath}
          staged={false}
        />
        <FileStatusList
          title="Staged"
          files={stagedFiles}
          isLoading={isLoading}
          repoPath={activeRepoPath}
          staged={true}
        />
      </div>
    </div>
  );
}
