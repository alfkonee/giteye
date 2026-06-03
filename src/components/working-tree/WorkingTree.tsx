import { useAppStore } from "../../stores/app-store";
import { FileStatusList } from "./FileStatusList";
import { CommitBox } from "./CommitBox";
import { useStagedFiles, useUnstagedFiles, useGitStatus } from "../../hooks/useGitStatus";
import { RefreshCw, GitBranch, CheckCircle2, AlertCircle, GitPullRequestArrow } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRepositoryInfo } from "../../hooks/useRepository";
import { useRepositoryGithubOverview } from "../../hooks/useAdvancedGit";

interface WorkingTreeProps {}

export function WorkingTree(_props: WorkingTreeProps) {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const { data: status } = useGitStatus(activeRepoPath);
  const { data: stagedFiles, isLoading: stagedLoading } = useStagedFiles(activeRepoPath);
  const { data: unstagedFiles, isLoading: unstagedLoading } = useUnstagedFiles(activeRepoPath);
  const { data: repoInfo } = useRepositoryInfo(activeRepoPath);
  const { data: githubOverview } = useRepositoryGithubOverview(activeRepoPath);
  const stagedCount = stagedFiles?.length ?? 0;
  const unstagedCount = unstagedFiles?.length ?? 0;
  const ignoredCount = status?.filter((file) => file.status.includes("!")).length ?? 0;
  const totalCount = stagedCount + unstagedCount;
  const branchName = repoInfo?.currentBranch ?? "No branch";
  const queryClient = useQueryClient();
  const stackedPullRequests = githubOverview?.pullRequests?.slice(0, 4) ?? [];

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["status", activeRepoPath] });
    queryClient.invalidateQueries({ queryKey: ["stagedFiles", activeRepoPath] });
    queryClient.invalidateQueries({ queryKey: ["unstagedFiles", activeRepoPath] });
    queryClient.invalidateQueries({ queryKey: ["repoInfo", activeRepoPath] });
  };

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-primary)]">
      <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <div className="flex items-center justify-between px-5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[17px] font-semibold tracking-tight text-[var(--color-text-primary)]">
                Changes
              </h2>
              {!stagedLoading && !unstagedLoading && (
                <span className="rounded-full border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)] tabular-nums">
                  {totalCount} files
                </span>
              )}
            </div>
            <div className="mt-2 flex min-w-0 items-center gap-3 text-[12px] text-[var(--color-text-muted)]">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
                <span className="truncate text-[var(--color-text-secondary)]">{branchName}</span>
              </span>
              <span className="h-3 w-px bg-[var(--color-border-muted)]" />
              <span className="inline-flex items-center gap-1.5">
                {repoInfo?.isClean ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-success)]" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-[var(--color-warning)]" />
                )}
                <span>{repoInfo?.isClean ? "Working tree clean" : `${stagedCount} staged · ${unstagedCount} unstaged`}</span>
              </span>
              {ignoredCount > 0 && (
                <span className="hidden tabular-nums text-[var(--color-text-muted)] lg:inline">
                  {ignoredCount} ignored
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {stackedPullRequests.length > 0 && (
              <div className="hidden items-center gap-1 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2 py-1.5 xl:flex">
                <GitPullRequestArrow className="h-4 w-4 text-[var(--color-purple)]" />
                {stackedPullRequests.map((pullRequest) => (
                  <button
                    key={pullRequest.number}
                    type="button"
                    className="max-w-[150px] truncate rounded-md border border-[var(--color-purple-border)] bg-[var(--color-purple-bg)] px-2 py-1 text-[11px] font-medium text-[var(--color-purple)]"
                    title={pullRequest.title}
                  >
                    #{pullRequest.number}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={handleRefresh}
              className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-2 text-[var(--color-text-muted)] shadow-sm transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              title="Refresh"
            >
              <RefreshCw className="h-[17px] w-[17px]" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <FileStatusList
          title="Staged"
          files={stagedFiles ?? []}
          isLoading={stagedLoading}
          repoPath={activeRepoPath}
          staged={true}
        />
        <FileStatusList
          title="Unstaged"
          files={unstagedFiles ?? []}
          isLoading={unstagedLoading}
          repoPath={activeRepoPath}
          staged={false}
        />
      </div>

      <CommitBox />
    </div>
  );
}
