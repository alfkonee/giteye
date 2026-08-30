import { Fragment, useEffect, useState, type MouseEvent } from "react";
import { useAppStore } from "../../stores/app-store";
import {
  Box,
  Command,
  GitBranch,
  Globe,
  Layers,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { formatDryRunPreview } from "../../lib/git-preview";
import { runBranchPushFlow } from "../../lib/branch-push";
import { gitApi } from "../../lib/tauri-api";
import {
  getViewsForGroup,
  isCollaborationView,
  viewGroups,
  type ViewDefinition,
} from "../../lib/view-registry";
import type { Branch, ViewType } from "../../types/git";
import { BranchSwitchDialog } from "../branches/BranchSwitchDialog";
import { BranchContextMenu } from "../branches/BranchContextMenu";
import {
  BranchTree,
  ShowMoreButton,
  isUnmergedStatus,
  visibleBranches,
} from "./sidebar/BranchTree";
import { SidebarCountBadge, SidebarNavItem, SidebarNote, SidebarSection } from "./sidebar/SidebarNav";
import { BranchDeleteDialog } from "../branches/BranchDeleteDialog";
import { appDialog } from "../common/AppDialogProvider";
import { CreatePullRequestDialog } from "../repository/CreatePullRequestDialog";
import { describeBranchActivation, useBranchActivation } from "../../lib/branch-activation";
import { AppSidebar } from "./AppSidebar";

export function Sidebar() {
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const setPendingAdvancedBranchName = useAppStore(
    (s) => s.setPendingAdvancedBranchName,
  );
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
  const [deleteBranchTarget, setDeleteBranchTarget] = useState<Branch | null>(null);
  const [prBranch, setPrBranch] = useState<Branch | null>(null);
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
  const pushBranchMutation = useMutation(gitMutations.pushBranch(queryClient, activeRepoPath));
  const pushBranchDryRunMutation = useMutation(gitMutations.pushBranchDryRun(activeRepoPath));
  const deleteRemoteBranchMutation = useMutation(gitMutations.deleteRemoteBranch(queryClient, activeRepoPath));
  const deleteRemoteBranchDryRunMutation = useMutation(gitMutations.deleteRemoteBranchDryRun(activeRepoPath));
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

  const statusFileCount = snapshot?.summary.totalCount;
  const pullRequestCount = githubOverviewQuery.data?.pullRequests.length;
  const localBranches = branchesQuery.data?.filter((b) => !b.isRemote) ?? [];
  const remoteBranches = branchesQuery.data?.filter((b) => b.isRemote) ?? [];
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

  const createBranchFrom = async (branch: Branch) => {
    const name = await appDialog.prompt(
      `Create a new branch from ${branch.shortName}.`,
      "",
      "New branch name",
    );
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

  const mergeBranch = async (branch: Branch) => {
    if (branch.isCurrent) return;
    if (
      !(await appDialog.confirm(
        `Merge "${branch.shortName}" into the current branch? Your working tree must be clean.`,
        "Merge branch?",
      ))
    ) return;
    mergeBranchMutation.mutate(branch.shortName);
  };

  const deleteBranch = (branch: Branch) => {
    if (branch.isCurrent || branch.isRemote) return;
    setDeleteBranchTarget(branch);
  };

  const remoteNames = Array.from(
    new Set(remoteBranches.map((branch) => branch.shortName.split("/", 1)[0]).filter(Boolean)),
  );
  const pushBranch = async (branch: Branch, forceWithLease: boolean) => {
    if (branch.isRemote) return;
    await runBranchPushFlow({
      branch,
      remoteNames,
      forceWithLease,
      dryRunPreview: (request) => pushBranchDryRunMutation.mutateAsync(request),
      submitPush: (request) => pushBranchMutation.mutate(request),
    });
  };

  const deleteRemoteBranch = async (branch: Branch) => {
    if (!branch.isRemote) return;
    const separator = branch.shortName.indexOf("/");
    if (separator < 1) return;
    const request = {
      remote: branch.shortName.slice(0, separator),
      branch: branch.shortName.slice(separator + 1),
    };
    const target = `${request.remote}/${request.branch}`;
    try {
      const preview = formatDryRunPreview(
        await deleteRemoteBranchDryRunMutation.mutateAsync(request),
        "Git did not report a ref deletion for this remote branch dry run.",
      );
      if (!(await appDialog.confirm(
        `Delete remote branch “${target}”?\n\nPreview:\n${preview}`,
        "Delete remote branch?",
        "danger",
      ))) return;
      deleteRemoteBranchMutation.mutate(request);
    } catch (error) {
      await appDialog.alert(
        `Unable to preview remote deletion for ${target}: ${String(error)}`,
        "Remote deletion preview failed",
      );
    }
  };

  const shouldShowView = (definition: ViewDefinition) => {
    if (!definition.collaboration) return true;
    return definition.connectEntry || showCollaborationViews;
  };

  const renderViewItem = (definition: ViewDefinition) => {
    const Icon = definition.icon;
    return (
      <SidebarNavItem
        key={definition.id}
        icon={<Icon className="h-4 w-4" />}
        label={definition.label}
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
    <AppSidebar>

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
          onPushBranch={(branch) => void pushBranch(branch, false)}
          onForcePushBranch={(branch) => void pushBranch(branch, true)}
          onDeleteRemoteBranch={(branch) => void deleteRemoteBranch(branch)}
          onAdvancedMergeRebase={(branch) => {
            setPendingAdvancedBranchName(branch.shortName);
            navigate("workspace");
          }}
          onCreatePullRequest={setPrBranch}
          onDelete={deleteBranch}
          onClose={() => setContextBranch(null)}
        />
        <CreatePullRequestDialog
          branch={prBranch}
          repoPath={activeRepoPath}
          onClose={() => setPrBranch(null)}
        />
        <BranchDeleteDialog
          branch={deleteBranchTarget}
          repoPath={activeRepoPath}
          onClose={() => setDeleteBranchTarget(null)}
        />
      </div>
    </AppSidebar>
  );
}


function basename(path: string) {
  const normalizedEnd = path.endsWith("/") ? path.length - 1 : path.length;
  const slashIndex = path.lastIndexOf("/", normalizedEnd - 1);
  return path.slice(slashIndex + 1, normalizedEnd);
}
