import { Toolbar } from "./Toolbar";
import { Sidebar } from "./Sidebar";
import { PanelLayout } from "./PanelLayout";
import { useAppStore } from "../../stores/app-store";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { ErrorCallout } from "../common/ErrorCallout";
import { useRepositoryInfo } from "../../hooks/useRepository";
import { Circle, GitBranch } from "lucide-react";
import type { ViewType } from "../../types/git";

export function AppShell() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const activeView = useAppStore((s) => s.activeView);
  const { data: repoInfo, isLoading, error } = useRepositoryInfo(activeRepoPath);

  return (
    <div className="giteye-shell flex h-full w-full flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Toolbar
        repoName={repoInfo?.name}
        currentBranch={repoInfo?.currentBranch}
        isClean={repoInfo?.isClean}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <div className="min-w-0 flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner />
            </div>
          ) : error ? (
            <div className="p-4">
              <ErrorCallout message="Failed to load repository" />
            </div>
          ) : (
            <PanelLayout />
          )}
        </div>
      </div>
      <StatusBar
        repoName={repoInfo?.name}
        branchName={repoInfo?.currentBranch}
        isClean={repoInfo?.isClean}
        activeView={activeView}
      />
    </div>
  );
}

function StatusBar({
  repoName,
  branchName,
  isClean,
  activeView,
}: {
  repoName?: string;
  branchName?: string;
  isClean?: boolean;
  activeView: ViewType;
}) {
  return (
    <div className="giteye-statusbar flex h-7 shrink-0 items-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 text-[11px] text-[var(--color-text-muted)]">
      <span className="truncate">{repoName ?? "No repository"}</span>
      {branchName && (
        <span className="flex min-w-0 items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
          <span className="truncate">{branchName}</span>
        </span>
      )}
      {isClean !== undefined && (
        <span className={isClean ? "flex items-center gap-1.5 text-[var(--color-success)]" : "flex items-center gap-1.5 text-[var(--color-warning)]"}>
          <Circle className="h-2 w-2 fill-current" />
          {isClean ? "Clean" : "Changes"}
        </span>
      )}
      <span className="ml-auto capitalize">{viewLabel(activeView)}</span>
    </div>
  );
}

function viewLabel(view: ViewType) {
  return view.split("-").join(" ");
}
