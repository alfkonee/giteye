import { useAppStore } from "../../stores/app-store";
import { FileStatusList } from "./FileStatusList";
import { CommitBox } from "./CommitBox";
import { RefreshCw, GitBranch, CheckCircle2, AlertCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { gitQueries, invalidateGitState } from "../../lib/git-data";
import { Button } from "../ui";

interface WorkingTreeProps {}

export function WorkingTree(_props: WorkingTreeProps) {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const { data: snapshot, isLoading } = useQuery(gitQueries.repositorySnapshot(activeRepoPath));

  const repoInfo = snapshot?.repositoryInfo;
  const status = snapshot?.files ?? [];
  const stagedFiles = status.filter((file) => file.staged);
  const unstagedFiles = status.filter((file) => file.unstaged);
  const summary = snapshot?.summary;
  const stagedCount = summary?.stagedCount ?? stagedFiles.length;
  const unstagedCount = summary?.unstagedCount ?? unstagedFiles.length;
  const ignoredCount = summary?.ignoredCount ?? 0;
  const totalCount = summary?.totalCount ?? stagedFiles.length + unstagedFiles.length;
  const branchName = repoInfo?.currentBranch ?? "No branch";
  const queryClient = useQueryClient();


  const handleRefresh = () => {
    void invalidateGitState(queryClient, activeRepoPath);
  };

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-primary)]">
      <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold tracking-tight text-[var(--color-text-primary)]">
                Changes
              </h2>
              {!isLoading && (
                <span className="giteye-chip tabular-nums">
                  {totalCount} files
                </span>
              )}
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
                <span className="truncate text-[var(--color-text-secondary)]">{branchName}</span>
              </span>
              <span className="h-3 w-px bg-[var(--color-border-muted)]" />
              <span className="giteye-chip" data-tone={repoInfo?.isClean ? "success" : "warning"}>
                {repoInfo?.isClean ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <AlertCircle className="h-3 w-3" />
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
          <div className="flex items-center gap-2">
            <Button
              onClick={handleRefresh}
              variant="secondary"
              size="sm"
              iconOnly
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              title="Refresh"
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <FileStatusList
          title="Staged"
          files={stagedFiles}
          isLoading={isLoading}
          repoPath={activeRepoPath}
          staged={true}
        />
        <FileStatusList
          title="Unstaged"
          files={unstagedFiles}
          isLoading={isLoading}
          repoPath={activeRepoPath}
          staged={false}
        />
      </div>

      <CommitBox />
    </div>
  );
}
