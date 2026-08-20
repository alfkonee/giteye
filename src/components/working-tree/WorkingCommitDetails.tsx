import { useAppStore } from "../../stores/app-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { History } from "lucide-react";
import { FileStatusList } from "./FileStatusList";
import { CommitBox } from "./CommitBox";
import { Button } from "../ui";

/**
 * The detail-pane face of the uncommitted-changes row: the staged/unstaged
 * file lists on top (scrollable) and the commit form pinned at the bottom.
 * Replaces the old standalone Changes column so staging and committing happen
 * in one place with no view switch.
 */
export function WorkingCommitDetails() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const queryClient = useQueryClient();
  const { data: snapshot, isLoading } = useQuery(gitQueries.repositorySnapshot(activeRepoPath));
  const resetMutation = useMutation(gitMutations.resetToCommit(queryClient, activeRepoPath));

  const status = snapshot?.files ?? [];
  const stagedFiles = status.filter((file) => file.staged);
  const unstagedFiles = status.filter((file) => file.unstaged);
  const summary = snapshot?.summary;
  const stagedCount = summary?.stagedCount ?? stagedFiles.length;
  const unstagedCount = summary?.unstagedCount ?? unstagedFiles.length;
  const headCommit = snapshot?.repositoryInfo?.headCommit;
  const hasChanges = stagedCount > 0 || unstagedCount > 0;

  /**
   * `git reset --hard HEAD`: drops staged and unstaged changes to tracked files
   * in one step. Untracked files survive a hard reset, so they stay listed and
   * have to go through "Discard all" in the Unstaged section.
   */
  const handleResetToHead = () => {
    if (!headCommit) return;
    if (
      !confirm(
        `Reset the working tree to HEAD?\n\nThis discards all staged and unstaged changes to tracked files (${stagedCount} staged, ${unstagedCount} unstaged). Untracked files are left in place.\n\nThis cannot be undone from GitEye; stash or commit first if you need a Git safety net.`,
      )
    ) {
      return;
    }
    resetMutation.mutate({
      commitHash: headCommit,
      mode: "hard",
      confirmDiscardChanges: true,
    });
  };

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
        <div className="flex-1" />
        <Button
          size="sm"
          variant="danger"
          icon={<History className="h-3.5 w-3.5" />}
          onClick={handleResetToHead}
          disabled={!hasChanges || !headCommit || resetMutation.isPending}
          title="git reset --hard HEAD — discard every staged and unstaged change to tracked files"
        >
          Reset to HEAD
        </Button>
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
