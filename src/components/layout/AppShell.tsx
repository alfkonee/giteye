import { Toolbar } from "./Toolbar";
import { Sidebar } from "./Sidebar";
import { PanelLayout } from "./PanelLayout";
import { useAppStore } from "../../stores/app-store";
import { ErrorCallout } from "../common/ErrorCallout";
import { useQuery } from "@tanstack/react-query";
import { gitQueries } from "../../lib/git-data";
import { Circle, GitBranch } from "lucide-react";
import type { ViewType } from "../../types/git";

export function AppShell() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const activeView = useAppStore((s) => s.activeView);
  const { data: snapshot, error } = useQuery(gitQueries.repositorySnapshot(activeRepoPath));
  const { data: rebaseState } = useQuery(
    gitQueries.rebaseState(activeRepoPath, Boolean(activeRepoPath)),
  );

  const repoInfo = snapshot?.repositoryInfo;
  const fallbackRepoName = activeRepoPath ? basename(activeRepoPath) : undefined;


  return (
    <div className="giteye-shell flex h-full w-full flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Toolbar
        repoName={repoInfo?.name ?? fallbackRepoName}
        currentBranch={repoInfo?.currentBranch}
        isClean={repoInfo?.isClean}
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
        activeView={activeView}
        isRebasing={Boolean(rebaseState?.inProgress)}
      />
    </div>
  );
}

function StatusBar({
  repoName,
  branchName,
  isClean,
  activeView,
  isRebasing,
}: {
  repoName?: string;
  branchName?: string;
  isClean?: boolean;
  activeView: ViewType;
  isRebasing: boolean;
}) {
  return (
    <div className="giteye-statusbar flex h-6 shrink-0 items-center gap-2.5 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2.5 text-[11px] text-[var(--color-text-muted)]">
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
      {isRebasing && (
        <span className="flex items-center gap-1.5 text-[var(--color-warning)]">
          <Circle className="h-2 w-2 fill-current" />
          Rebase active
        </span>
      )}
      <span className="ml-auto capitalize">{viewLabel(activeView)}</span>
    </div>
  );
}

function viewLabel(view: ViewType) {
  if (view === "rebase-conflicts") {
    return "merge & rebase";
  }

  return view.split("-").join(" ");
}

function basename(path: string) {
  const normalizedEnd = path.endsWith("/") ? path.length - 1 : path.length;
  const slashIndex = path.lastIndexOf("/", normalizedEnd - 1);
  return path.slice(slashIndex + 1, normalizedEnd);
}
