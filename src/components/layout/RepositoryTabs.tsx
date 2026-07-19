import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Circle, GitBranch, Home, Loader2, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { gitQueries } from "../../lib/git-data";
import { useAppStore } from "../../stores/app-store";
import { useJobStore } from "../../stores/job-store";

export function RepositoryTabs() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const openRepoPaths = useAppStore((s) => s.openRepoPaths);
  const setActiveRepoPath = useAppStore((s) => s.setActiveRepoPath);
  const closeRepoPath = useAppStore((s) => s.closeRepoPath);
  const jobsById = useJobStore((s) => s.jobsById);
  const setCommandLogOpen = useJobStore((s) => s.setCommandLogOpen);
  const setRepoFilter = useJobStore((s) => s.setRepoFilter);
  const snapshotQueries = useQueries({
    queries: openRepoPaths.map((repoPath) => gitQueries.repositorySnapshot(repoPath)),
  });
  const runningJobsByRepo = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const job of Object.values(jobsById)) {
      if (job.status !== "queued" && job.status !== "running") continue;
      counts[job.repoPath] = (counts[job.repoPath] ?? 0) + 1;
    }
    return counts;
  }, [jobsById]);

  if (openRepoPaths.length === 0) {
    return null;
  }

  const openCommandLog = (repoPath: string) => {
    setRepoFilter(repoPath);
    setCommandLogOpen(true);
  };

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2">
      <button
        type="button"
        onClick={() => setActiveRepoPath(null)}
        className={cn(
          "giteye-btn giteye-btn-sm h-8 gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
          activeRepoPath
            ? "giteye-btn-ghost text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            : "giteye-nav-active border border-[var(--color-border-accent)] text-[var(--color-text-primary)]",
        )}
        title="Open Repo Hub"
      >
        <Home className="h-3.5 w-3.5" />
        Repo Hub
      </button>
      <div className="h-5 w-px bg-[var(--color-border-muted)]" />
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {openRepoPaths.map((repoPath, index) => {
          const snapshot = snapshotQueries[index]?.data;
          const repoInfo = snapshot?.repositoryInfo;
          const repoName = repoInfo?.name ?? basename(repoPath);
          const branchName = repoInfo?.currentBranch;
          const isActive = activeRepoPath === repoPath;
          const runningJobCount = runningJobsByRepo[repoPath] ?? 0;

          return (
            <div
              key={repoPath}
              className={cn(
                "group inline-flex h-8 max-w-[300px] shrink-0 items-stretch overflow-hidden rounded-lg border text-left text-xs transition-colors",
                isActive
                  ? "giteye-nav-active border-[var(--color-border-accent)] text-[var(--color-text-primary)]"
                  : "border-transparent bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]",
              )}
              title={repoPath}
            >
              <button
                type="button"
                onClick={() => setActiveRepoPath(repoPath)}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{repoName}</span>
                  {branchName ? (
                    <span className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[var(--color-text-muted)]">
                      <GitBranch className="h-3 w-3 shrink-0" />
                      <span className="truncate">{branchName}</span>
                    </span>
                  ) : null}
                </span>
                {repoInfo ? (
                  <span
                    className="giteye-chip shrink-0 px-1.5 py-0 text-[10px]"
                    data-tone={repoInfo.isClean ? "success" : "warning"}
                  >
                    <Circle className="h-2 w-2 fill-current" />
                    {repoInfo.isClean ? "Clean" : "Dirty"}
                  </span>
                ) : null}
              </button>
              {runningJobCount > 0 ? (
                <button
                  type="button"
                  onClick={() => openCommandLog(repoPath)}
                  className="giteye-chip shrink-0 self-center px-1.5 py-0 text-[10px]"
                  data-tone="accent"
                  title="Open command log for this repository"
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {runningJobCount}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => closeRepoPath(repoPath)}
                className={cn(
                  "mr-1 self-center rounded p-0.5 opacity-60 transition-colors hover:bg-[var(--color-bg-hover)] hover:opacity-100",
                  isActive ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]",
                )}
                title={`Close ${repoName}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function basename(path: string) {
  const normalizedEnd = path.endsWith("/") ? path.length - 1 : path.length;
  const slashIndex = path.lastIndexOf("/", normalizedEnd - 1);
  return path.slice(slashIndex + 1, normalizedEnd);
}
