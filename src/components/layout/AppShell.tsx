import { Toolbar } from "./Toolbar";
import { Sidebar } from "./Sidebar";
import { PanelLayout } from "./PanelLayout";
import { AppChrome } from "./AppChrome";
import { RepositoryTabs } from "./RepositoryTabs";
import { useAppStore } from "../../stores/app-store";
import { ErrorCallout } from "../common/ErrorCallout";
import { useQuery } from "@tanstack/react-query";
import { gitQueries } from "../../lib/git-data";
import { Circle, GitBranch } from "lucide-react";
import type { RepositoryParent, ViewType } from "../../types/git";
import { getViewDefinition } from "../../lib/view-registry";

export function AppShell() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const activeView = useAppStore((s) => s.activeView);
  const { data: snapshot, error } = useQuery(gitQueries.repositorySnapshot(activeRepoPath));
  const { data: rebaseState } = useQuery(
    gitQueries.rebaseState(activeRepoPath, Boolean(activeRepoPath)),
  );

  const repoInfo = snapshot?.repositoryInfo;
  const fallbackRepoName = activeRepoPath ? basename(activeRepoPath) : undefined;
  const repoName = repoInfo?.name ?? fallbackRepoName ?? "Repository";
  const chromeTitle = repoInfo?.currentBranch ? `GitEye · ${repoName} · ${repoInfo.currentBranch}` : `GitEye · ${repoName}`;

  return (
    <AppChrome title={chromeTitle} subtitle={viewLabel(activeView)}>
      <div className="flex h-full min-h-0 w-full flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
        <RepositoryTabs />
        <Toolbar
          repoName={repoInfo?.name ?? fallbackRepoName}
          currentBranch={repoInfo?.currentBranch}
          isClean={repoInfo?.isClean}
          submoduleParent={repoInfo?.submoduleParent ?? null}
        />
        {error ? (
          <div className="border-b border-[var(--color-border)] p-3">
            <ErrorCallout message="Failed to load repository snapshot" />
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 overflow-hidden">
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
    <div className="flex h-[22px] shrink-0 items-center gap-1.5 border-t border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-2 text-[10.5px] text-[var(--color-text-muted)]">
      <span className="min-w-0 max-w-[220px] truncate px-1">{repoName ?? "No repository"}</span>
      {branchName && (
        <span className="giteye-chip max-w-[240px] px-1.5 text-[10.5px]" data-tone="accent" title={branchName}>
          <GitBranch className="h-3 w-3 shrink-0" />
          <span className="truncate">{branchName}</span>
        </span>
      )}
      {submoduleParent ? (
        <span
          className="giteye-chip max-w-[280px] px-1.5 text-[10.5px]"
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
      <span className="ml-auto truncate px-1 capitalize text-[var(--color-text-subtle)]">{getViewDefinition(activeView).label}</span>
    </div>
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
