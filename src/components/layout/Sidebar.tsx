import type { ReactNode } from "react";
import { useAppStore } from "../../stores/app-store";
import { cn } from "../../lib/cn";
import {
  AlertTriangle,
  Archive,
  Box,
  Command,
  Database,
  FolderOpen,
  GitBranch,
  GitFork,
  GitPullRequest,
  Globe,
  History,
  Layers,
  PanelLeft,
  PanelLeftClose,
  Settings,
  Tag,
} from "lucide-react";
import { useBranches } from "../../hooks/useBranches";
import { useGitStatus } from "../../hooks/useGitStatus";
import { useRepositoryInfo } from "../../hooks/useRepository";
import {
  useRepositoryGithubOverview,
  useRebaseState,
  useSubmodules,
  useWorktrees,
} from "../../hooks/useAdvancedGit";
import type { ViewType } from "../../types/git";


export function Sidebar() {
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const setActiveRepoPath = useAppStore((s) => s.setActiveRepoPath);

  const { data: branches } = useBranches(activeRepoPath);
  const { data: repoInfo } = useRepositoryInfo(activeRepoPath);
  const { data: statusFiles } = useGitStatus(activeRepoPath);
  const { data: githubOverview } = useRepositoryGithubOverview(activeRepoPath);
  const worktreesQuery = useWorktrees(activeRepoPath);
  const submodulesQuery = useSubmodules(activeRepoPath);
  const { data: rebaseState } = useRebaseState(activeRepoPath);

  const localBranches = branches?.filter((b) => !b.isRemote) ?? [];
  const remoteBranches = branches?.filter((b) => b.isRemote) ?? [];
  const activeBranch = repoInfo?.currentBranch;
  const statusFileCount = statusFiles?.length;
  const pullRequestCount = githubOverview?.pullRequests.length;
  const conflictCount = rebaseState?.inProgress ? rebaseState.conflicts.length : undefined;
  const worktrees = worktreesQuery.data ?? [];
  const submodules = submodulesQuery.data ?? [];

  const navigate = (view: ViewType) => {
    setActiveView(view);
  };

  if (sidebarCollapsed) {
    return (
      <div className="flex w-10 shrink-0 flex-col items-center border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <button
          onClick={toggleSidebar}
          className="mt-2 rounded-md p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="Expand sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <aside className="giteye-sidebar flex shrink-0 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      <div className="border-b border-[var(--color-border-muted)] px-2.5 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)]">
            <FolderOpen className="h-4 w-4 text-[var(--color-accent)]" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
              {repoInfo?.name ?? "No Repository"}
            </div>
            {activeBranch && (
              <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--color-text-muted)]">
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
                <span className="truncate">{activeBranch}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1.5">
        <SidebarSection title="Workspace" />
        <SidebarNavItem
          icon={<FolderOpen className="h-4 w-4" />}
          label="Working Tree"
          active={activeView === "working-tree"}
          count={statusFileCount}
          onClick={() => navigate("working-tree")}
        />
        <SidebarNavItem
          icon={<History className="h-4 w-4" />}
          label="History"
          active={activeView === "history"}
          onClick={() => navigate("history")}
        />
        <SidebarNavItem
          icon={<GitPullRequest className="h-4 w-4" />}
          label="Stacked PRs"
          count={pullRequestCount}
          active={activeView === "stacked-prs"}
          onClick={() => navigate("stacked-prs")}
        />
        <SidebarNavItem
          icon={<GitFork className="h-4 w-4" />}
          label="Review Studio"
          active={activeView === "review-studio"}
          onClick={() => navigate("review-studio")}
        />
        <SidebarNavItem
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Rebase Conflicts"
          count={conflictCount}
          active={activeView === "rebase-conflicts"}
          tone="warning"
          onClick={() => navigate("rebase-conflicts")}
        />

        <SidebarSection title="Repository Workspace" />
        <SidebarNavItem
          icon={<GitBranch className="h-4 w-4" />}
          label="Branches"
          count={localBranches.length}
          active={activeView === "history"}
          onClick={() => navigate("history")}
        />
        <SidebarNavItem
          icon={<GitPullRequest className="h-4 w-4" />}
          label="Pull Requests"
          count={pullRequestCount}
          active={activeView === "stacked-prs"}
          onClick={() => navigate("stacked-prs")}
        />
        <SidebarNavItem
          icon={<Layers className="h-4 w-4" />}
          label="Worktrees"
          count={worktrees.length}
          active={activeView === "worktrees"}
          onClick={() => navigate("worktrees")}
        />
        <SidebarNavItem
          icon={<Box className="h-4 w-4" />}
          label="Submodules"
          count={submodules.length}
          active={activeView === "submodules"}
          onClick={() => navigate("submodules")}
        />

        <SidebarSection title="Branches" count={localBranches.length} />
        {localBranches.length === 0 ? (
          <div className="px-8 py-1.5 text-[12px] italic text-[var(--color-text-muted)]">
            No branches
          </div>
        ) : (
          localBranches.slice(0, 8).map((branch) => (
            <SidebarNavItem
              key={branch.name}
              icon={
                <GitBranch
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    branch.isCurrent
                      ? "text-[var(--color-accent)]"
                      : "text-[var(--color-text-muted)]"
                  )}
                />
              }
              label={branch.shortName}
              active={branch.isCurrent}
              indent
            />
          ))
        )}

        {remoteBranches.length > 0 && (
          <>
            <SidebarSection title="Remote Branches" count={remoteBranches.length} />
            {remoteBranches.slice(0, 8).map((branch) => (
              <SidebarNavItem
                key={branch.name}
                icon={<Globe className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />}
                label={branch.shortName}
                indent
              />
            ))}
          </>
        )}

        <SidebarSection title="Worktrees" count={worktrees.length} />
        {worktreesQuery.isLoading ? (
          <SidebarNote>Loading worktrees…</SidebarNote>
        ) : worktreesQuery.error ? (
          <SidebarNote>Worktrees unavailable</SidebarNote>
        ) : worktrees.length === 0 ? (
          <SidebarNote>No linked worktrees</SidebarNote>
        ) : (
          worktrees.slice(0, 3).map((worktree) => (
            <SidebarNavItem
              key={worktree.path}
              icon={<Layers className="h-3.5 w-3.5" />}
              label={worktree.branch ?? (worktree.isDetached ? "Detached HEAD" : basename(worktree.path))}
              active={activeView === "worktrees" && worktree.isCurrent}
              indent
              onClick={() => navigate("worktrees")}
            />
          ))
        )}

        <SidebarSection title="Submodules" count={submodules.length} />
        {submodulesQuery.isLoading ? (
          <SidebarNote>Loading submodules…</SidebarNote>
        ) : submodulesQuery.error ? (
          <SidebarNote>Submodules unavailable</SidebarNote>
        ) : submodules.length === 0 ? (
          <SidebarNote>No submodules configured</SidebarNote>
        ) : (
          submodules.slice(0, 3).map((submodule) => (
            <SidebarNavItem
              key={submodule.path}
              icon={<Box className="h-3.5 w-3.5" />}
              label={submodule.name || submodule.path}
              active={activeView === "submodules"}
              indent
              onClick={() => navigate("submodules")}
            />
          ))
        )}

        <SidebarSection title="Repository" />
        <SidebarNavItem icon={<Archive className="h-4 w-4" />} label="Stashes" />
        <SidebarNavItem icon={<Tag className="h-4 w-4" />} label="Tags" />
        <SidebarNavItem icon={<Database className="h-4 w-4" />} label="Remotes" />
        <SidebarNavItem
          icon={<Settings className="h-4 w-4" />}
          label="Settings"
          active={activeView === "settings"}
          onClick={() => navigate("settings")}
        />
      </div>

      <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
        <SidebarNavItem
          icon={<FolderOpen className="h-4 w-4" />}
          label="Switch Repository"
          onClick={() => setActiveRepoPath(null)}
        />

        <button
          onClick={toggleSidebar}
          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[13px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
        >
          <PanelLeftClose className="h-4 w-4" />
          <span>Collapse Sidebar</span>
        </button>

        <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-[var(--color-text-muted)]">
          <Command className="h-3.5 w-3.5" />
          <kbd className="rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] px-1.5 py-0.5 text-[10px]">K</kbd>
          <span className="ml-auto">Command Menu</span>
        </div>
      </div>
    </aside>
  );
}

function SidebarSection({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center px-2.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
      <span>{title}</span>
      {count !== undefined && count > 0 && <span className="ml-auto tabular-nums">{count}</span>}
    </div>
  );
}

function SidebarNavItem({
  icon,
  label,
  active = false,
  indent = false,
  count,
  tone = "default",
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  indent?: boolean;
  count?: number;
  tone?: "default" | "warning";
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "giteye-row flex w-full items-center gap-2.5 text-left text-[13px] transition-colors",
        indent ? "pl-7 pr-2.5" : "px-2.5",
        active
          ? "bg-[var(--color-bg-selected)] text-white"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
      )}
    >
      {active ? (
        icon
      ) : (
        <span className={tone === "warning" ? "text-[var(--color-warning)]" : "text-[var(--color-text-muted)]"}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] tabular-nums", active ? "bg-white/20 text-white" : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]")}>
          {count}
        </span>
      )}
    </button>
  );
}

function SidebarNote({ children }: { children: ReactNode }) {
  return <div className="px-7 py-1 text-[12px] italic text-[var(--color-text-muted)]">{children}</div>;
}

function basename(path: string) {
  const normalizedEnd = path.endsWith("/") ? path.length - 1 : path.length;
  const slashIndex = path.lastIndexOf("/", normalizedEnd - 1);
  return path.slice(slashIndex + 1, normalizedEnd);
}
