import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
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
  HardDrive,
  History,
  Layers,
  PanelLeft,
  PanelLeftClose,
  Settings,
  Tag,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { gitApi } from "../../lib/tauri-api";
import type { Branch, ViewType } from "../../types/git";
import type { CheckoutBranchStrategy } from "../../lib/tauri-api";
import { BranchSwitchDialog } from "../branches/BranchSwitchDialog";
import { BranchContextMenu } from "../branches/BranchContextMenu";

export function Sidebar() {
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const setActiveRepoPath = useAppStore((s) => s.setActiveRepoPath);
  const setSelectedWorktreePath = useAppStore((s) => s.setSelectedWorktreePath);
  const setSelectedSubmodulePath = useAppStore(
    (s) => s.setSelectedSubmodulePath,
  );

  const queryClient = useQueryClient();
  const [branchToSwitch, setBranchToSwitch] = useState<Branch | null>(null);
  const [contextBranch, setContextBranch] = useState<{
    branch: Branch;
    x: number;
    y: number;
  } | null>(null);

  const { data: snapshot } = useQuery(
    gitQueries.repositorySnapshot(activeRepoPath),
  );
  const { data: branchSummary } = useQuery(
    gitQueries.branchSummary(activeRepoPath),
  );
  const { data: workspaceSummary } = useQuery(
    gitQueries.workspaceSummary(activeRepoPath),
  );

  const shouldLoadBranches = Boolean(activeRepoPath);
  const shouldLoadGithub =
    activeView === "stacked-prs" || activeView === "review-studio";
  const shouldLoadWorktrees = activeView === "worktrees";
  const shouldLoadSubmodules = activeView === "submodules";

  const branchesQuery = useQuery(
    gitQueries.branches(activeRepoPath, shouldLoadBranches),
  );
  const checkoutBranch = useMutation(
    gitMutations.checkoutBranch(queryClient, activeRepoPath),
  );
  const createBranch = useMutation(
    gitMutations.createBranch(queryClient, activeRepoPath),
  );
  const fastForwardBranchMutation = useMutation(
    gitMutations.fastForwardBranch(queryClient, activeRepoPath),
  );
  const mergeBranchMutation = useMutation(
    gitMutations.mergeBranch(queryClient, activeRepoPath),
  );
  const githubOverviewQuery = useQuery(
    gitQueries.githubOverview(activeRepoPath, shouldLoadGithub),
  );
  const worktreesQuery = useQuery(
    gitQueries.worktrees(activeRepoPath, shouldLoadWorktrees),
  );
  const submodulesQuery = useQuery(
    gitQueries.submodules(activeRepoPath, shouldLoadSubmodules),
  );

  const remotesQuery = useQuery(
    gitQueries.remotes(activeRepoPath, activeView === "remotes"),
  );
  const stashesQuery = useQuery(
    gitQueries.stashes(activeRepoPath, activeView === "stashes"),
  );
  const lfsQuery = useQuery(
    gitQueries.lfsStatus(activeRepoPath, activeView === "lfs"),
  );
  const tagsQuery = useQuery(
    gitQueries.tags(activeRepoPath, activeView === "tags"),
  );

  const repoInfo = snapshot?.repositoryInfo;
  const statusFileCount = snapshot?.summary.totalCount;
  const pullRequestCount = githubOverviewQuery.data?.pullRequests.length;
  const localBranches = branchesQuery.data?.filter((b) => !b.isRemote) ?? [];
  const remoteBranches = branchesQuery.data?.filter((b) => b.isRemote) ?? [];
  const activeBranch = repoInfo?.currentBranch ?? branchSummary?.currentBranch;
  const branchCount = branchSummary
    ? branchSummary.localCount + branchSummary.remoteCount
    : undefined;
  const isClean = snapshot?.repositoryInfo.isClean ?? true;
  const conflictCount =
    snapshot?.files.filter((file) => isUnmergedStatus(file.status)).length ?? 0;
  const hasConflicts = conflictCount > 0;

  useEffect(() => {
    if (!activeRepoPath || !shouldLoadGithub) return;
    return () => {
      void gitApi.cancelRepositoryGithubWork(activeRepoPath);
    };
  }, [activeRepoPath, shouldLoadGithub]);
  const worktrees = worktreesQuery.data ?? [];
  const submodules = submodulesQuery.data ?? [];

  const navigate = (view: ViewType) => {
    setActiveView(view);
  };

  const requestBranchSwitch = (branch: Branch) => {
    if (!branch.isCurrent) {
      setBranchToSwitch(branch);
    }
  };

  const confirmBranchSwitch = (strategy: CheckoutBranchStrategy) => {
    if (!branchToSwitch) return;
    checkoutBranch.mutate(
      { branchName: branchToSwitch.shortName, strategy },
      { onSuccess: () => setBranchToSwitch(null) },
    );
  };

  const openBranchContextMenu = (event: MouseEvent, branch: Branch) => {
    event.preventDefault();
    setContextBranch({ branch, x: event.clientX, y: event.clientY });
  };

  const createBranchFrom = (branch: Branch) => {
    const name = window.prompt(`New branch name from ${branch.shortName}`);
    const trimmedName = name?.trim();
    if (!trimmedName) return;
    createBranch.mutate({
      name: trimmedName,
      checkout: false,
      startPoint: branch.shortName,
    });
  };

  const fastForwardBranch = (branch: Branch) => {
    if (!branch.upstream) return;
    fastForwardBranchMutation.mutate({
      branchName: branch.shortName,
      upstream: branch.upstream,
    });
  };
  const mergeBranch = (branch: Branch) => {
    if (branch.isCurrent) return;
    if (
      !window.confirm(
        `Merge "${branch.shortName}" into the current branch? Your working tree must be clean.`,
      )
    )
      return;
    mergeBranchMutation.mutate(branch.shortName);
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
        {hasConflicts && (
          <SidebarNavItem
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Resolve Conflicts"
            count={conflictCount}
            active={activeView === "rebase-conflicts"}
            tone="warning"
            onClick={() => navigate("rebase-conflicts")}
          />
        )}

        <SidebarSection title="Repository Workspace" />
        <SidebarNavItem
          icon={<GitBranch className="h-4 w-4" />}
          label="Branches"
          count={branchCount}
          active={activeView === "branches"}
          onClick={() => navigate("branches")}
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
          count={workspaceSummary?.worktreeCount}
          active={activeView === "worktrees"}
          onClick={() => navigate("worktrees")}
        />
        <SidebarNavItem
          icon={<Box className="h-4 w-4" />}
          label="Submodules"
          count={workspaceSummary?.submoduleCount}
          active={activeView === "submodules"}
          onClick={() => navigate("submodules")}
        />

        <SidebarSection
          title="Local Branches"
          count={branchSummary?.localCount}
        />
        {branchesQuery.isLoading ? (
          <SidebarNote>Loading branches…</SidebarNote>
        ) : branchesQuery.error ? (
          <SidebarNote>Branches unavailable</SidebarNote>
        ) : localBranches.length === 0 ? (
          <SidebarNote>No branches</SidebarNote>
        ) : (
          localBranches
            .slice(0, 8)
            .map((branch) => (
              <SidebarNavItem
                key={branch.name}
                icon={
                  <GitBranch
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      branch.isCurrent
                        ? "text-[var(--color-accent)]"
                        : "text-[var(--color-text-muted)]",
                    )}
                  />
                }
                label={branch.shortName}
                description={
                  branch.upstream ? trackingLabel(branch) : undefined
                }
                active={branch.isCurrent}
                indent
                onDoubleClick={() => requestBranchSwitch(branch)}
                title={
                  branch.isCurrent
                    ? "Current branch"
                    : "Double-click to switch branch"
                }
                onContextMenu={(event) => openBranchContextMenu(event, branch)}
              />
            ))
        )}

        {shouldLoadBranches && remoteBranches.length > 0 && (
          <>
            <SidebarSection
              title="Remote Branches"
              count={remoteBranches.length}
            />
            {remoteBranches.slice(0, 8).map((branch) => (
              <SidebarNavItem
                key={branch.name}
                icon={
                  <Globe className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
                }
                label={branch.shortName}
                indent
                onDoubleClick={() => requestBranchSwitch(branch)}
                title="Double-click to switch remote branch"
                onContextMenu={(event) => openBranchContextMenu(event, branch)}
              />
            ))}
          </>
        )}

        <SidebarSection
          title="Worktrees"
          count={workspaceSummary?.worktreeCount}
        />
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
              label={
                worktree.branch ??
                (worktree.isDetached
                  ? "Detached HEAD"
                  : basename(worktree.path))
              }
              active={activeView === "worktrees" && worktree.isCurrent}
              indent
              onClick={() => {
                setSelectedWorktreePath(worktree.path);
                navigate("worktrees");
              }}
            />
          ))
        )}

        <SidebarSection
          title="Submodules"
          count={workspaceSummary?.submoduleCount}
        />
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
              onClick={() => {
                setSelectedSubmodulePath(submodule.path);
                navigate("submodules");
              }}
            />
          ))
        )}

        <SidebarSection title="Repository" />
        <SidebarNavItem
          icon={<Archive className="h-4 w-4" />}
          label="Stashes"
          count={stashesQuery.data?.length}
          active={activeView === "stashes"}
          onClick={() => navigate("stashes")}
        />
        <SidebarNavItem
          icon={<Tag className="h-4 w-4" />}
          label="Tags"
          count={tagsQuery.data?.length}
          active={activeView === "tags"}
          onClick={() => navigate("tags")}
        />
        <SidebarNavItem
          icon={<HardDrive className="h-4 w-4" />}
          label="Git LFS"
          count={lfsQuery.data?.files.length}
          active={activeView === "lfs"}
          onClick={() => navigate("lfs")}
        />
        <SidebarNavItem
          icon={<Database className="h-4 w-4" />}
          label="Remotes"
          count={remotesQuery.data?.length}
          active={activeView === "remotes"}
          onClick={() => navigate("remotes")}
        />
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
          <kbd className="rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] px-1.5 py-0.5 text-[10px]">
            K
          </kbd>
          <span className="ml-auto">Command Menu</span>
        </div>
        <BranchSwitchDialog
          branch={branchToSwitch}
          isClean={isClean}
          isPending={checkoutBranch.isPending}
          onCancel={() => setBranchToSwitch(null)}
          onConfirm={confirmBranchSwitch}
        />
        <BranchContextMenu
          branch={contextBranch?.branch ?? null}
          x={contextBranch?.x ?? 0}
          y={contextBranch?.y ?? 0}
          onCreateFromBranch={createBranchFrom}
          onFastForward={fastForwardBranch}
          onMerge={mergeBranch}
          onClose={() => setContextBranch(null)}
        />
      </div>
    </aside>
  );
}

function SidebarSection({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center px-2.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
      <span>{title}</span>
      {count !== undefined && count > 0 && (
        <span className="ml-auto tabular-nums">{count}</span>
      )}
    </div>
  );
}

function SidebarNavItem({
  icon,
  description,
  label,
  active = false,
  indent = false,
  count,
  tone = "default",
  onClick,
  onDoubleClick,
  title,
  onContextMenu,
}: {
  icon: ReactNode;
  label: string;
  description?: string;
  active?: boolean;
  indent?: boolean;
  count?: number;
  tone?: "default" | "warning";
  onClick?: () => void;
  onDoubleClick?: () => void;
  title?: string;
  onContextMenu?: (event: MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={title}
      onContextMenu={onContextMenu}
      className={cn(
        "giteye-row flex w-full items-center gap-2.5 text-left text-[13px] transition-colors",
        indent ? "pl-7 pr-2.5" : "px-2.5",
        active
          ? "bg-[var(--color-bg-selected)] text-white"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]",
      )}
    >
      {active ? (
        icon
      ) : (
        <span
          className={
            tone === "warning"
              ? "text-[var(--color-warning)]"
              : "text-[var(--color-text-muted)]"
          }
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {description && (
          <span
            className={cn(
              "block truncate text-[10px]",
              active ? "text-white/75" : "text-[var(--color-text-muted)]",
            )}
          >
            {description}
          </span>
        )}
      </span>
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
            active
              ? "bg-white/20 text-white"
              : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function SidebarNote({ children }: { children: ReactNode }) {
  return (
    <div className="px-7 py-1 text-[12px] italic text-[var(--color-text-muted)]">
      {children}
    </div>
  );
}

function trackingLabel(branch: Branch) {
  const divergence = [
    branch.ahead ? `${branch.ahead} ahead` : null,
    branch.behind ? `${branch.behind} behind` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return divergence
    ? `${branch.upstream} · ${divergence}`
    : `tracks ${branch.upstream}`;
}
function isUnmergedStatus(status: string) {
  return ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(status);
}

function basename(path: string) {
  const normalizedEnd = path.endsWith("/") ? path.length - 1 : path.length;
  const slashIndex = path.lastIndexOf("/", normalizedEnd - 1);
  return path.slice(slashIndex + 1, normalizedEnd);
}
