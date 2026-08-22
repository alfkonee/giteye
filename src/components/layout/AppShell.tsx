import { Toolbar } from "./Toolbar";
import { Sidebar } from "./Sidebar";
import { PanelLayout } from "./PanelLayout";
import { AppChrome } from "./AppChrome";
import { RepositoryTabs } from "./RepositoryTabs";
import { useAppChromeSlots } from "./AppSidebar";
import { useAppStore } from "../../stores/app-store";
import { useJobStore, isTerminalStatus } from "../../stores/job-store";
import { ErrorCallout } from "../common/ErrorCallout";
import { useQuery } from "@tanstack/react-query";
import { gitQueries } from "../../lib/git-data";
import { Circle, GitBranch, TerminalSquare } from "lucide-react";
import type { RepositoryParent, ViewType } from "../../types/git";
import { getViewDefinition } from "../../lib/view-registry";
import { cn } from "../../lib/cn";

export function AppShell() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const activeView = useAppStore((s) => s.activeView);
  const { data: snapshot, error } = useQuery(gitQueries.repositorySnapshot(activeRepoPath));
  const { data: rebaseState } = useQuery(
    gitQueries.rebaseState(activeRepoPath, Boolean(activeRepoPath)),
  );
  const chrome = useAppChromeSlots();

  const repoInfo = snapshot?.repositoryInfo;
  const fallbackRepoName = activeRepoPath ? basename(activeRepoPath) : undefined;
  const repoName = repoInfo?.name ?? fallbackRepoName ?? "Repository";
  const chromeTitle = repoInfo?.currentBranch ? `GitEye · ${repoName} · ${repoInfo.currentBranch}` : `GitEye · ${repoName}`;

  return (
    <AppChrome title={chromeTitle} subtitle={viewLabel(activeView)} leading={chrome.leading} trailing={chrome.trailing}>
      <div className="flex h-full min-h-0 w-full flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
        <RepositoryTabs />
        <Toolbar
          repoName={repoInfo?.name ?? fallbackRepoName}
          currentBranch={repoInfo?.currentBranch}
          isClean={repoInfo?.isClean}
          submoduleParent={repoInfo?.submoduleParent ?? null}
        />
        {error ? (
          <div className="giteye-banner border-b border-[var(--color-border)] p-3">
            <ErrorCallout message="Failed to load repository snapshot" />
          </div>
        ) : null}
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <Sidebar />
          <div className="min-w-0 flex-1 overflow-hidden">
            <PanelLayout />
          </div>
        </div>
        <StatusBar
          repoName={repoInfo?.name ?? fallbackRepoName}
          branchName={repoInfo?.currentBranch}
          isClean={repoInfo?.isClean}
          submoduleParent={repoInfo?.submoduleParent ?? null}
          activeView={activeView}
          isRebasing={Boolean(rebaseState?.inProgress)}
        />
      </div>
    </AppChrome>
  );
}

function StatusBar({
  repoName,
  branchName,
  isClean,
  activeView,
  isRebasing,
  submoduleParent,
}: {
  repoName?: string;
  branchName?: string;
  isClean?: boolean;
  activeView: ViewType;
  submoduleParent?: RepositoryParent | null;
  isRebasing: boolean;
}) {
  return (
    <div className="giteye-statusbar flex shrink-0 items-center gap-1.5 overflow-hidden border-t border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-2 text-xs text-[var(--color-text-muted)]">
      <span className="min-w-0 max-w-[220px] truncate px-1">{repoName ?? "No repository"}</span>
      {branchName && (
        <span className="giteye-chip max-w-[240px] px-1.5 text-[10.5px]" data-tone="accent" title={branchName}>
          <GitBranch className="h-3 w-3 shrink-0" />
          <span className="truncate">{branchName}</span>
        </span>
      )}
      {submoduleParent ? (
        <span
          className="giteye-status-optional giteye-chip max-w-[280px] px-1.5 text-xs"
          data-tone="accent"
          title={`Submodule ${submoduleParent.submodulePath} of ${submoduleParent.path}`}
        >
          <span className="truncate">
            Submodule {submoduleParent.submodulePath} of {submoduleParent.name}
          </span>
        </span>
      ) : null}
      {isClean !== undefined && (
        <span className="giteye-chip px-1.5 text-[10.5px]" data-tone={isClean ? "success" : "warning"}>
          <Circle className="h-2 w-2 fill-current" />
          {isClean ? "Clean" : "Changes"}
        </span>
      )}
      {isRebasing && (
        <span className="giteye-chip px-1.5 text-[10.5px]" data-tone="warning">
          <Circle className="h-2 w-2 fill-current" />
          Rebase active
        </span>
      )}
      <CommandLogStatusButton />
      <span className="giteye-status-optional ml-auto truncate px-1 capitalize text-[var(--color-text-subtle)]">{getViewDefinition(activeView).label}</span>
    </div>
  );
}

/**
 * Status-bar entry point for the Quake console. Replaces the old floating
 * launcher pill; shows running-job pressure without covering the workspace.
 */
function CommandLogStatusButton() {
  const jobsById = useJobStore((state) => state.jobsById);
  const open = useJobStore((state) => state.commandLogOpen);
  const toggleCommandLog = useJobStore((state) => state.toggleCommandLog);
  const runningCount = Object.values(jobsById).filter((job) => !isTerminalStatus(job.status)).length;

  return (
    <button
      type="button"
      onClick={toggleCommandLog}
      aria-pressed={open}
      title="Command log console (`)"
      className={cn(
        "giteye-chip px-1.5 text-[10.5px] transition-colors hover:text-[var(--color-text-primary)]",
        open && "text-[var(--color-text-primary)]",
      )}
      data-tone={runningCount > 0 ? "accent" : undefined}
    >
      <TerminalSquare className="h-3 w-3 shrink-0" />
      <span>{runningCount > 0 ? `${runningCount} running` : "Command log"}</span>
      <kbd className="giteye-kbd ml-0.5">`</kbd>
    </button>
  );
}

function basename(path: string) {
  const normalizedEnd = path.endsWith("/") ? path.length - 1 : path.length;
  const slashIndex = path.lastIndexOf("/", normalizedEnd - 1);
  return path.slice(slashIndex + 1, normalizedEnd);
}

function viewLabel(view: ViewType) {
  return getViewDefinition(view).label;
}
