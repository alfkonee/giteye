import { Fragment, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { useAppStore } from "../../stores/app-store";
import { cn } from "../../lib/cn";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Command,
  Folder,
  FolderOpen,
  GitBranch,
  Globe,
  Layers,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { gitApi } from "../../lib/tauri-api";
import {
  getViewsForGroup,
  isCollaborationView,
  viewGroups,
  type ViewDefinition,
} from "../../lib/view-registry";
import type { Branch, ViewType } from "../../types/git";
import type { CheckoutBranchStrategy } from "../../lib/tauri-api";
import { BranchSwitchDialog } from "../branches/BranchSwitchDialog";
import { BranchContextMenu } from "../branches/BranchContextMenu";
import { describeBranchActivation, useBranchActivation } from "../../lib/branch-activation";

export function Sidebar() {
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const setPendingAdvancedBranchName = useAppStore(
    (s) => s.setPendingAdvancedBranchName,
  );
  const setGlobalView = useAppStore((s) => s.setGlobalView);
  const setSelectedWorktreePath = useAppStore((s) => s.setSelectedWorktreePath);
  const setSelectedSubmodulePath = useAppStore(
    (s) => s.setSelectedSubmodulePath,
  );

  const queryClient = useQueryClient();
  const [contextBranch, setContextBranch] = useState<{
    branch: Branch;
    x: number;
    y: number;
  } | null>(null);
  const [localBranchesExpanded, setLocalBranchesExpanded] = useState(true);
  const [remoteBranchesExpanded, setRemoteBranchesExpanded] = useState(false);
  const [showAllLocalBranches, setShowAllLocalBranches] = useState(false);
  const [showAllRemoteBranches, setShowAllRemoteBranches] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => window.matchMedia("(max-width: 820px)").matches);
  const [narrowSidebarOpen, setNarrowSidebarOpen] = useState(false);

  useEffect(() => {
    setLocalBranchesExpanded(true);
    setRemoteBranchesExpanded(false);
    setShowAllLocalBranches(false);
    setShowAllRemoteBranches(false);
  }, [activeRepoPath]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 820px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsNarrowViewport(event.matches);
      if (!event.matches) setNarrowSidebarOpen(false);
    };
    setIsNarrowViewport(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!isNarrowViewport || !narrowSidebarOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNarrowSidebarOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isNarrowViewport, narrowSidebarOpen]);

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
  const shouldLoadGithub = isCollaborationView(activeView);
  const shouldLoadWorktrees = activeView === "worktrees";
  const shouldLoadSubmodules = activeView === "submodules";

  const branchesQuery = useQuery(
    gitQueries.branches(activeRepoPath, shouldLoadBranches),
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
  const deleteBranchMutation = useMutation(
    gitMutations.deleteBranch(queryClient, activeRepoPath),
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
  const rebaseQuery = useQuery(
    gitQueries.rebaseState(activeRepoPath, Boolean(activeRepoPath)),
  );
  const branchActivation = useBranchActivation({
    repoPath: activeRepoPath,
    branches: branchesQuery.data ?? [],
    onAdvancedIntegrate: (ref) => {
      setPendingAdvancedBranchName(ref);
      navigate("workspace");
    },
  });

  const repoInfo = snapshot?.repositoryInfo;
  const statusFileCount = snapshot?.summary.totalCount;
  const pullRequestCount = githubOverviewQuery.data?.pullRequests.length;
  const localBranches = branchesQuery.data?.filter((b) => !b.isRemote) ?? [];
  const remoteBranches = branchesQuery.data?.filter((b) => b.isRemote) ?? [];
  const activeBranch = repoInfo?.currentBranch ?? branchSummary?.currentBranch;
  const isClean = snapshot?.repositoryInfo.isClean ?? true;
  const conflictCount =
    snapshot?.files.filter((file) => isUnmergedStatus(file.status)).length ?? 0;
  const hasConflicts = conflictCount > 0;
  const hasActiveRebase = Boolean(rebaseQuery.data?.inProgress);
  const collaborationOverview = githubOverviewQuery.data;
  const hasCollaborationData = Boolean(
    collaborationOverview &&
      (collaborationOverview.providerAvailable ||
        collaborationOverview.isGithubRepository ||
        collaborationOverview.pullRequests.length > 0 ||
        collaborationOverview.checkRuns.length > 0 ||
        collaborationOverview.reviews.length > 0 ||
        collaborationOverview.activity.length > 0),
  );
  const showCollaborationViews =
    hasCollaborationData || isCollaborationView(activeView);
  const viewCounts: Partial<Record<ViewType, number | undefined>> = {
    workspace: hasConflicts ? conflictCount : statusFileCount,
    worktrees: workspaceSummary?.worktreeCount,
    submodules: workspaceSummary?.submoduleCount,
    remotes: remotesQuery.data?.length,
    stashes: stashesQuery.data?.length,
    tags: tagsQuery.data?.length,
    lfs: lfsQuery.data?.files.length,
    "stacked-prs": pullRequestCount,
  };
  const viewCountBadges: Partial<Record<ViewType, SidebarCountBadge[]>> = {
    branches: branchSummary
      ? [
          {
            key: "local",
            icon: <GitBranch className="h-2.5 w-2.5" />,
            value: branchSummary.localCount,
            title: `${branchSummary.localCount} local branches`,
          },
          {
            key: "remote",
            icon: <Globe className="h-2.5 w-2.5" />,
            value: branchSummary.remoteCount,
            title: `${branchSummary.remoteCount} remote branches`,
          },
        ]
      : undefined,
  };

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
    setNarrowSidebarOpen(false);
  };

  const openBranchContextMenu = (event: MouseEvent, branch: Branch) => {
    event.preventDefault();
    setContextBranch({ branch, x: event.clientX, y: event.clientY });
  };

  const describeActivation = (branch: Branch) =>
    describeBranchActivation(branch, branchesQuery.data ?? []);

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

  const deleteBranch = (branch: Branch) => {
    if (branch.isCurrent || branch.isRemote) return;
    if (
      !window.confirm(`Delete local branch "${branch.shortName}"?`)
    )
      return;
    deleteBranchMutation.mutate(branch.shortName);
  };

  const shouldShowView = (definition: ViewDefinition) => {
    if (!definition.collaboration) {
      return true;
    }

    return definition.connectEntry || showCollaborationViews;
  };

  const renderViewItem = (definition: ViewDefinition) => {
    const Icon = definition.icon;
    return (
      <SidebarNavItem
        key={definition.id}
        icon={<Icon className="h-4 w-4" />}
        label={definition.label}
        description={definition.connectEntry ? definition.description : undefined}
        count={viewCounts[definition.id]}
        countBadges={viewCountBadges[definition.id]}
        active={activeView === definition.id}
        tone={
          definition.id === "workspace" && (hasConflicts || hasActiveRebase)
            ? "warning"
            : "default"
        }
        onClick={() => navigate(definition.id)}
        title={definition.description}
      />
    );
  };

  const sidebarHidden = isNarrowViewport ? !narrowSidebarOpen : sidebarCollapsed;
  if (sidebarHidden) {
    return (
      <div className="giteye-sidebar-rail flex w-12 shrink-0 flex-col items-center border-r border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/90 backdrop-blur-sm">
        <button
          onClick={() => {
            if (isNarrowViewport) setNarrowSidebarOpen(true);
            else toggleSidebar();
          }}
          type="button"
          aria-label="Open repository navigation"
          aria-expanded={false}
          className="giteye-btn giteye-btn-ghost giteye-btn-icon giteye-btn-sm mt-2 text-[var(--color-text-muted)]"
          title="Open repository navigation"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <aside aria-label="Repository navigation" className="giteye-sidebar flex shrink-0 flex-col overflow-hidden border-r border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/92 backdrop-blur-sm">
      <div className="border-b border-[var(--color-border-muted)] px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-soft)]">
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
        {viewGroups.map((group) => {
          const views = getViewsForGroup(group.id).filter(shouldShowView);
          if (views.length === 0) {
            return null;
          }

          return (
            <Fragment key={group.id}>
              <SidebarSection title={group.label} />
              {views.map(renderViewItem)}
            </Fragment>
          );
        })}

        <SidebarSection
          title="Local Branches"
          count={branchSummary?.localCount}
          expanded={localBranchesExpanded}
          onToggle={() => setLocalBranchesExpanded((expanded) => !expanded)}
        />
        {!localBranchesExpanded ? null : branchesQuery.isLoading ? (
          <SidebarNote>Loading branches…</SidebarNote>
        ) : branchesQuery.error ? (
          <SidebarNote>Branches unavailable</SidebarNote>
        ) : localBranches.length === 0 ? (
          <SidebarNote>No branches</SidebarNote>
        ) : (
          <>
            <BranchTree
              branches={visibleBranches(localBranches, showAllLocalBranches)}
              onSwitch={branchActivation.activateBranch}
              onContextMenu={openBranchContextMenu}
              describeActivation={describeActivation}
            />
            {localBranches.length > 8 ? (
              <ShowMoreButton
                expanded={showAllLocalBranches}
                hiddenCount={Math.max(0, localBranches.length - 8)}
                onClick={() => setShowAllLocalBranches((showAll) => !showAll)}
              />
            ) : null}
          </>
        )}

        {shouldLoadBranches && remoteBranches.length > 0 && (
          <>
            <SidebarSection
              title="Remote Branches"
              count={remoteBranches.length}
              expanded={remoteBranchesExpanded}
              onToggle={() => setRemoteBranchesExpanded((expanded) => !expanded)}
            />
            {remoteBranchesExpanded ? (
              <>
                <BranchTree
                  branches={visibleBranches(remoteBranches, showAllRemoteBranches)}
                  onSwitch={branchActivation.activateBranch}
                  onContextMenu={openBranchContextMenu}
                  describeActivation={describeActivation}
                />
                {remoteBranches.length > 8 ? (
                  <ShowMoreButton
                    expanded={showAllRemoteBranches}
                    hiddenCount={Math.max(0, remoteBranches.length - 8)}
                    onClick={() => setShowAllRemoteBranches((showAll) => !showAll)}
                  />
                ) : null}
              </>
            ) : null}
          </>
        )}

        <SidebarSection
          title="Worktree Paths"
          count={workspaceSummary?.worktreeCount}
        />
        {shouldLoadWorktrees && worktreesQuery.isLoading ? (
          <SidebarNote>Loading worktrees…</SidebarNote>
        ) : shouldLoadWorktrees && worktreesQuery.error ? (
          <SidebarNote>Worktrees unavailable</SidebarNote>
        ) : !shouldLoadWorktrees && (workspaceSummary?.worktreeCount ?? 0) > 0 ? (
          <SidebarNote>Open Worktrees to load linked paths</SidebarNote>
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
          title="Submodule Paths"
          count={workspaceSummary?.submoduleCount}
        />
        {shouldLoadSubmodules && submodulesQuery.isLoading ? (
          <SidebarNote>Loading submodules…</SidebarNote>
        ) : shouldLoadSubmodules && submodulesQuery.error ? (
          <SidebarNote>Submodules unavailable</SidebarNote>
        ) : !shouldLoadSubmodules && (workspaceSummary?.submoduleCount ?? 0) > 0 ? (
          <SidebarNote>Open Submodules to load configured paths</SidebarNote>
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
      </div>

      <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
        <SidebarNavItem
          icon={<FolderOpen className="h-4 w-4" />}
          label="Repo Hub"
          onClick={() => {
            setNarrowSidebarOpen(false);
            setGlobalView("repo-hub");
          }}
        />

        <button
          type="button"
          onClick={() => {
            if (isNarrowViewport) setNarrowSidebarOpen(false);
            else toggleSidebar();
          }}
          className="giteye-menu-item flex w-full items-center gap-2 px-2.5 py-2 text-[13px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
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
          branch={branchActivation.switchBranch}
          isClean={isClean}
          isPending={branchActivation.switchPending}
          followUpNote={branchActivation.switchFollowUp}
          onCancel={branchActivation.cancelSwitch}
          onConfirm={branchActivation.confirmSwitch}
        />
        <BranchContextMenu
          branch={contextBranch?.branch ?? null}
          x={contextBranch?.x ?? 0}
          y={contextBranch?.y ?? 0}
          repoPath={activeRepoPath}
          onCreateFromBranch={createBranchFrom}
          onFastForward={fastForwardBranch}
          onMerge={mergeBranch}
          onAdvancedMergeRebase={(branch) => {
            setPendingAdvancedBranchName(branch.shortName);
            navigate("workspace");
          }}
          onDelete={deleteBranch}
          onClose={() => setContextBranch(null)}
        />
      </div>
    </aside>
  );
}

function SidebarSection({
  title,
  count,
  expanded,
  onToggle,
}: {
  title: string;
  count?: number;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const content = (
    <>
      {onToggle ? (expanded ? <ChevronDown className="mr-1 h-3 w-3" /> : <ChevronRight className="mr-1 h-3 w-3" />) : null}
      <span className="truncate">{title}</span>
      {count !== undefined && count > 0 ? (
        <span className="ml-auto tabular-nums text-[10px] text-[var(--color-text-subtle)]">{count}</span>
      ) : null}
    </>
  );
  return (
    onToggle ? (
      <button type="button" aria-expanded={expanded} onClick={onToggle} className="giteye-section-label flex min-h-8 w-full items-center px-3 pb-1 pt-3 text-left hover:text-[var(--color-text-primary)]">
        {content}
      </button>
    ) : (
      <div className="giteye-section-label flex items-center px-3 pb-1 pt-3">{content}</div>
    )
  );
}

interface BranchTreeNode {
  folders: Map<string, BranchTreeNode>;
  branches: Array<{ branch: Branch; label: string }>;
}

function visibleBranches(branches: Branch[], showAll: boolean) {
  if (showAll || branches.length <= 8) return branches;
  const visible = branches.slice(0, 8);
  const current = branches.find((branch) => branch.isCurrent);
  if (current && !visible.includes(current)) visible[visible.length - 1] = current;
  return visible;
}

function buildBranchTree(branches: Branch[]): BranchTreeNode {
  const root: BranchTreeNode = { folders: new Map(), branches: [] };
  for (const branch of branches) {
    const parts = branch.shortName.split("/").filter(Boolean);
    const label = parts.pop() ?? branch.shortName;
    let node = root;
    for (const part of parts) {
      let folder = node.folders.get(part);
      if (!folder) {
        folder = { folders: new Map(), branches: [] };
        node.folders.set(part, folder);
      }
      node = folder;
    }
    node.branches.push({ branch, label });
  }
  return root;
}

function BranchTree({
  branches,
  onSwitch,
  onContextMenu,
  describeActivation,
}: {
  branches: Branch[];
  onSwitch: (branch: Branch) => void;
  onContextMenu: (event: MouseEvent, branch: Branch) => void;
  describeActivation: (branch: Branch) => string;
}) {
  const tree = buildBranchTree(branches);
  return (
    <div className="pb-1">
      <BranchTreeContents
        node={tree}
        depth={0}
        onSwitch={onSwitch}
        onContextMenu={onContextMenu}
        describeActivation={describeActivation}
      />
    </div>
  );
}

function BranchTreeContents({
  node,
  depth,
  onSwitch,
  onContextMenu,
  describeActivation,
}: {
  node: BranchTreeNode;
  depth: number;
  onSwitch: (branch: Branch) => void;
  onContextMenu: (event: MouseEvent, branch: Branch) => void;
  describeActivation: (branch: Branch) => string;
}) {
  return (
    <>
      {[...node.folders.entries()].map(([name, folder]) => (
        <BranchFolder
          key={name}
          name={name}
          node={folder}
          depth={depth}
          onSwitch={onSwitch}
          onContextMenu={onContextMenu}
          describeActivation={describeActivation}
        />
      ))}
      {node.branches.map(({ branch, label }) => (
        <button
          key={branch.name}
          type="button"
          onDoubleClick={() => onSwitch(branch)}
          onContextMenu={(event) => onContextMenu(event, branch)}
          title={describeActivation(branch)}
          style={{ paddingLeft: `${24 + depth * 14}px` }}
          className={cn(
            "giteye-row mx-1.5 flex w-[calc(100%-0.75rem)] items-center gap-2 rounded-md pr-2 text-left text-[12px] transition-colors",
            branch.isCurrent
              ? "giteye-nav-active text-[13px] !font-bold tracking-[0.01em] text-[var(--color-text-primary)]"
              : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]",
          )}
        >
          {branch.isRemote ? <Globe className="h-3.5 w-3.5 shrink-0" /> : <GitBranch className="h-3.5 w-3.5 shrink-0" />}
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {branch.upstream && !branch.isRemote ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-text-muted)]" title={trackingLabel(branch)} />
          ) : null}
        </button>
      ))}
    </>
  );
}

function BranchFolder({
  name,
  node,
  depth,
  onSwitch,
  onContextMenu,
  describeActivation,
}: {
  name: string;
  node: BranchTreeNode;
  depth: number;
  onSwitch: (branch: Branch) => void;
  onContextMenu: (event: MouseEvent, branch: Branch) => void;
  describeActivation: (branch: Branch) => string;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const count = node.branches.length + [...node.folders.values()].reduce((total, folder) => total + countBranchTree(folder), 0);
  return (
    <>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        style={{ paddingLeft: `${18 + depth * 14}px` }}
        className="giteye-row mx-1.5 flex w-[calc(100%-0.75rem)] items-center gap-1.5 rounded-md pr-2 text-left text-[12px] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Folder className="h-3.5 w-3.5" />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="text-[9px] tabular-nums">{count}</span>
      </button>
      {expanded ? (
        <BranchTreeContents
          node={node}
          depth={depth + 1}
          onSwitch={onSwitch}
          onContextMenu={onContextMenu}
          describeActivation={describeActivation}
        />
      ) : null}
    </>
  );
}

function countBranchTree(node: BranchTreeNode): number {
  return node.branches.length + [...node.folders.values()].reduce((total, folder) => total + countBranchTree(folder), 0);
}

function ShowMoreButton({ expanded, hiddenCount, onClick }: { expanded: boolean; hiddenCount: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="giteye-menu-item mx-6 mb-1 rounded px-2 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-bg-hover)]">
      {expanded ? "Show less" : `Show ${hiddenCount} more`}
    </button>
  );
}

interface SidebarCountBadge {
  key: string;
  icon: ReactNode;
  value: number;
  title: string;
}

function SidebarNavItem({
  icon,
  description,
  label,
  active = false,
  indent = false,
  count,
  countBadges,
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
  countBadges?: SidebarCountBadge[];
  tone?: "default" | "warning";
  onClick?: () => void;
  onDoubleClick?: () => void;
  title?: string;
  onContextMenu?: (event: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={title}
      onContextMenu={onContextMenu}
      className={cn(
        "giteye-row flex w-full items-center gap-2.5 rounded-md text-left text-[13px] transition-colors",
        "mx-1.5 w-[calc(100%-0.75rem)]",
        indent ? "pl-6 pr-2" : "px-2",
        active
          ? "giteye-nav-active"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]",
      )}
    >
      {active ? (
        <span className="text-[var(--color-accent)]">{icon}</span>
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
        <span className={cn("block truncate", active && "font-semibold text-[var(--color-text-primary)]")}>
          {label}
        </span>
        {description && (
          <span
            className={cn(
              "block truncate text-[10px]",
              active ? "text-[var(--color-text-muted)]" : "text-[var(--color-text-muted)]",
            )}
          >
            {description}
          </span>
        )}
      </span>
      {countBadges ? (
        <span className="flex shrink-0 items-center gap-1">
          {countBadges
            .filter((badge) => badge.value > 0)
            .map((badge) => (
              <span
                key={badge.key}
                title={badge.title}
                className={cn(
                  "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  active
                    ? "bg-[var(--color-info-bg)] text-[var(--color-accent)]"
                    : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]",
                )}
              >
                {badge.icon}
                {badge.value}
              </span>
            ))}
        </span>
      ) : (
        count !== undefined &&
        count > 0 && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              active
                ? "bg-[var(--color-info-bg)] text-[var(--color-accent)]"
                : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]",
            )}
          >
            {count}
          </span>
        )
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
