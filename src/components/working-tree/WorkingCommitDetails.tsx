import { useAppStore } from "../../stores/app-store";
import { useQuery } from "@tanstack/react-query";
import { gitQueries } from "../../lib/git-data";
import { FileStatusList } from "./FileStatusList";
import { CommitBox } from "./CommitBox";

/**
 * The detail-pane face of the uncommitted-changes row: the staged/unstaged
 * file lists on top (scrollable) and the commit form pinned at the bottom.
 * Replaces the old standalone Changes column so staging and committing happen
 * in one place with no view switch.
 */
export function WorkingCommitDetails() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const { data: snapshot, isLoading } = useQuery(gitQueries.repositorySnapshot(activeRepoPath));

  const status = snapshot?.files ?? [];
  const stagedFiles = status.filter((file) => file.staged);
  const unstagedFiles = status.filter((file) => file.unstaged);
  const summary = snapshot?.summary;
  const stagedCount = summary?.stagedCount ?? stagedFiles.length;
  const unstagedCount = summary?.unstagedCount ?? unstagedFiles.length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)]">
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2.5 py-1">
        <h2 className="text-[12px] font-semibold text-[var(--color-text-primary)]">Uncommitted changes</h2>
        <span className="giteye-chip tabular-nums" data-tone={stagedCount > 0 ? "accent" : undefined}>
          {stagedCount} staged
        </span>
        <span className="giteye-chip tabular-nums" data-tone={unstagedCount > 0 ? "warning" : undefined}>
          {unstagedCount} unstaged
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
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

      <CommitBox />
    </div>
  );
}
