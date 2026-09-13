import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  GitBranch,
  GitMerge,
  GitPullRequest,
  RefreshCw,
  Tag,
  X,
} from "lucide-react";
import { gitMutations, gitQueries, invalidateGitState } from "../../lib/git-data";
import { gitApi } from "../../lib/tauri-api";
import { cn } from "../../lib/cn";
import { useAppStore } from "../../stores/app-store";
import { CommitHistory } from "../commit-history/CommitHistory";
import { RebaseConflictResolver } from "../rebase/RebaseConflictResolver";
import { IntegratePanel } from "./IntegratePanel";
import { BranchPruneButton } from "../branches/BranchPruneDialog";
import { BranchSwitchDialog } from "../branches/BranchSwitchDialog";
import { appDialog } from "../common/AppDialogProvider";
import { useBranchActivation } from "../../lib/branch-activation";
import type { Branch } from "../../types/git";
import { CreatePullRequestDialog } from "../repository/CreatePullRequestDialog";

type DrawerTab = "integrate" | "conflicts";

/**
 * The single Git working surface: staging and committing, the commit graph,
 * and every integration action (merge, rebase, conflict resolution) in one
 * page so no part of the commit → integrate → resolve loop needs a view switch.
 */
export function GitWorkspace() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const pendingAdvancedBranchName = useAppStore((s) => s.pendingAdvancedBranchName);
  const setPendingAdvancedBranchName = useAppStore((s) => s.setPendingAdvancedBranchName);
  const queryClient = useQueryClient();

  const [drawerTab, setDrawerTab] = useState<DrawerTab | null>(null);
  const [prefillRef, setPrefillRef] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [prBranch, setPrBranch] = useState<Branch | null>(null);
  const autoOpenedOperation = useRef<string | null>(null);

  const { data: snapshot } = useQuery(gitQueries.repositorySnapshot(activeRepoPath));
  const branchesQuery = useQuery(gitQueries.branches(activeRepoPath));
  const operationQuery = useQuery(
    gitQueries.operationSummary(activeRepoPath, Boolean(activeRepoPath)),
  );
  const { data: tags = [] } = useQuery(gitQueries.tags(activeRepoPath));
  const continueRebaseMutation = useMutation(
    gitMutations.continueRebase(queryClient, activeRepoPath),
  );
  const skipRebaseMutation = useMutation(gitMutations.skipRebase(queryClient, activeRepoPath));
  const abortRebaseMutation = useMutation(gitMutations.abortRebase(queryClient, activeRepoPath));
  const recoverMutation = useMutation({
    mutationFn: (action: "continue" | "abort") =>
      gitApi.recoverGitOperation(activeRepoPath!, action),
    onSuccess: () => invalidateGitState(queryClient, activeRepoPath),
  });

  const repoInfo = snapshot?.repositoryInfo;
  const summary = snapshot?.summary;
  const branches = branchesQuery.data ?? [];
  const localBranches = branches.filter((branch) => !branch.isRemote);
  const currentBranch = localBranches.find((branch) => branch.isCurrent) ?? null;
  const branchActivation = useBranchActivation({
    repoPath: activeRepoPath,
    branches,
    onAdvancedIntegrate: (ref) => {
      setPrefillRef(ref);
      setDrawerTab("integrate");
    },
  });
  const operation = operationQuery.data;
  const headTags = repoInfo?.headCommit
    ? tags.filter((tag) => tag.commitHash === repoInfo.headCommit)
    : [];
  const conflicts = operation?.conflicts ?? [];
  const activeOperation =
    operation?.operation ?? (operation?.inRebase ? "rebase" : operation?.inMerge ? "merge" : null);
  const inRebase = Boolean(operation?.inRebase || operation?.rebase.inProgress);
  const operationPending =
    continueRebaseMutation.isPending ||
    skipRebaseMutation.isPending ||
    abortRebaseMutation.isPending ||
    recoverMutation.isPending;

  const openContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || !activeRepoPath) return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  // A ref chosen elsewhere (branch context menu, commit menu, sidebar) opens
  // the integrate drawer prefilled instead of navigating to another page.
  useEffect(() => {
    if (!pendingAdvancedBranchName) return;
    setPrefillRef(pendingAdvancedBranchName);
    setDrawerTab("integrate");
    setPendingAdvancedBranchName(null);
  }, [pendingAdvancedBranchName, setPendingAdvancedBranchName]);

  // Never combine a branch selected in one repository with another repository's path.
  useEffect(() => {
    setPrBranch(null);
  }, [activeRepoPath]);

  // Surface conflicts once per operation; reopening stays the user's choice.
  useEffect(() => {
    if (!activeOperation) {
      autoOpenedOperation.current = null;
      return;
    }
    if (autoOpenedOperation.current === activeOperation) return;
    autoOpenedOperation.current = activeOperation;
    setDrawerTab("conflicts");
  }, [activeOperation]);

  const openDrawer = (tab: DrawerTab) => setDrawerTab((current) => (current === tab ? null : tab));
  const abortOperation = async () => {
    if (!activeOperation) return;
    const confirmed = await appDialog.confirm(
      `Abort the in-progress ${activeOperation}?\n\nGit restores the pre-operation state; resolved conflict edits made in this operation are discarded.`,
      `Abort ${activeOperation}?`,
      "danger",
    );
    if (!confirmed) return;
    inRebase ? abortRebaseMutation.mutate() : recoverMutation.mutate("abort");
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)]"
      onContextMenu={openContextMenu}
    >
      <header className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 px-2.5 py-1">
        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
            <span className="truncate text-[12px] font-semibold text-[var(--color-text-primary)]">
              {repoInfo?.currentBranch ?? "No branch"}
            </span>
            {repoInfo && (repoInfo.ahead > 0 || repoInfo.behind > 0) ? (
              <span className="giteye-chip tabular-nums" data-tone="accent">
                {repoInfo.ahead > 0 ? (
                  <>
                    <ArrowUp className="h-3 w-3" />
                    {repoInfo.ahead}
                  </>
                ) : null}
                {repoInfo.behind > 0 ? (
                  <>
                    <ArrowDown className="h-3 w-3" />
                    {repoInfo.behind}
                  </>
                ) : null}
              </span>
            ) : null}
            <span
              className="giteye-chip tabular-nums"
              data-tone={repoInfo?.isClean ? "success" : "warning"}
            >
              {repoInfo?.isClean ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <AlertTriangle className="h-3 w-3" />
              )}
              {repoInfo?.isClean
                ? "Clean"
                : `${summary?.stagedCount ?? 0} staged · ${summary?.unstagedCount ?? 0} unstaged`}
            </span>
          </div>
          {headTags.length > 0 ? (
            <div className="flex min-w-0 items-center gap-1">
              {headTags.slice(0, 3).map((tag) => (
                <span
                  key={tag.name}
                  className="giteye-chip max-w-40 truncate"
                  data-tone="warning"
                  title={`HEAD tag ${tag.name} · ${tag.shortHash}`}
                >
                  <Tag className="h-3 w-3" />
                  {tag.name}
                </span>
              ))}
              {headTags.length > 3 ? (
                <span className="giteye-chip tabular-nums" title={headTags.slice(3).map((tag) => tag.name).join(", ")}>
                  +{headTags.length - 3}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => void invalidateGitState(queryClient, activeRepoPath)}
              className="giteye-btn giteye-btn-ghost giteye-btn-sm giteye-btn-icon"
              title="Refresh repository state"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="sr-only">Refresh</span>
            </button>
            <BranchPruneButton repoPath={activeRepoPath} compact />
            <button
              type="button"
              disabled={!currentBranch}
              onClick={() => setPrBranch(currentBranch)}
              className="giteye-btn giteye-btn-sm giteye-btn-secondary"
              title={
                currentBranch
                  ? `Create a pull request from ${currentBranch.shortName}`
                  : "Check out a local branch to create a pull request"
              }
            >
              <GitPullRequest className="h-3.5 w-3.5" />
              Create PR
            </button>
            <button
              type="button"
              onClick={() => openDrawer("integrate")}
              data-state={drawerTab === "integrate" ? "active" : undefined}
              className={cn(
                "giteye-btn giteye-btn-sm",
                drawerTab === "integrate" ? "giteye-btn-primary" : "giteye-btn-secondary",
              )}
              title="Merge and rebase controls"
            >
              <GitMerge className="h-3.5 w-3.5" />
              Integrate
            </button>
            <button
              type="button"
              onClick={() => openDrawer("conflicts")}
              className={cn(
                "giteye-btn giteye-btn-sm",
                conflicts.length > 0 || inRebase
                  ? "border border-[var(--color-warning)] text-[var(--color-warning)]"
                  : "giteye-btn-secondary",
              )}
              title="Conflict resolver and in-progress operation"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Conflicts
              {conflicts.length > 0 ? (
                <span className="ml-1 tabular-nums">{conflicts.length}</span>
              ) : null}
            </button>
          </div>
        </div>
      </header>

      {activeOperation ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-2.5 py-1 text-[11px] text-[var(--color-warning)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold uppercase tracking-[0.06em]">{activeOperation} in progress</span>
          <span className="text-[var(--color-text-secondary)]">
            {conflicts.length > 0
              ? `${conflicts.length} unmerged file${conflicts.length === 1 ? "" : "s"}`
              : "No unmerged files reported"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              disabled={operationPending}
              onClick={() =>
                inRebase ? continueRebaseMutation.mutate() : recoverMutation.mutate("continue")
              }
              className="giteye-btn giteye-btn-sm giteye-btn-secondary"
            >
              Continue
            </button>
            {inRebase ? (
              <button
                type="button"
                disabled={operationPending}
                onClick={() => skipRebaseMutation.mutate()}
                className="giteye-btn giteye-btn-sm giteye-btn-secondary"
              >
                Skip commit
              </button>
            ) : null}
            <button
              type="button"
              disabled={operationPending}
              onClick={() => void abortOperation()}
              className="giteye-btn giteye-btn-sm border border-[var(--color-danger)] text-[var(--color-danger)]"
            >
              Abort
            </button>
            <button
              type="button"
              onClick={() => setDrawerTab("conflicts")}
              className="giteye-btn giteye-btn-sm giteye-btn-secondary"
            >
              Open resolver
            </button>
          </div>
        </div>
      ) : null}

      <PanelGroup direction="vertical" className="min-h-0 flex-1">
        <Panel id="workspace-main" order={1} minSize={30}>
          <div className="h-full overflow-hidden">
            <CommitHistory />
          </div>
        </Panel>

        {drawerTab ? (
          <>
            <PanelResizeHandle className="group relative h-px cursor-row-resize bg-[var(--color-border-muted)] transition-colors hover:bg-[var(--color-accent)] active:bg-[var(--color-accent)]">
              <div className="absolute -inset-y-1.5 inset-x-0" />
            </PanelResizeHandle>
            <Panel id="workspace-drawer" order={2} defaultSize={42} minSize={18}>
              <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)]">
                <div className="flex shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1">
                  <div className="giteye-segmented">
                    <button
                      type="button"
                      data-state={drawerTab === "integrate" ? "active" : undefined}
                      onClick={() => setDrawerTab("integrate")}
                    >
                      Integrate
                    </button>
                    <button
                      type="button"
                      data-state={drawerTab === "conflicts" ? "active" : undefined}
                      onClick={() => setDrawerTab("conflicts")}
                    >
                      Conflicts{conflicts.length > 0 ? ` (${conflicts.length})` : ""}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawerTab(null)}
                    className="giteye-btn giteye-btn-ghost giteye-btn-sm giteye-btn-icon ml-auto"
                    title="Close panel"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span className="sr-only">Close panel</span>
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                  {drawerTab === "integrate" ? (
                    <IntegratePanel prefillRef={prefillRef} activeOperation={activeOperation} />
                  ) : (
                    <ConflictsTab conflicts={conflicts} inRebase={inRebase} />
                  )}
                </div>
              </section>
            </Panel>
          </>
        ) : null}
      </PanelGroup>
      <WorkspaceContextMenu
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        open={Boolean(contextMenu)}
        localBranches={localBranches}
        branchesLoading={branchesQuery.isLoading}
        branchesUnavailable={Boolean(branchesQuery.error)}
        switching={branchActivation.isPending}
        onSwitch={(branch) => void branchActivation.activateBranch(branch)}
        onClose={() => setContextMenu(null)}
      />
      <BranchSwitchDialog
        branch={branchActivation.switchBranch}
        isClean={repoInfo?.isClean ?? true}
        isPending={branchActivation.switchPending}
        followUpNote={branchActivation.switchFollowUp}
        onCancel={branchActivation.cancelSwitch}
        onConfirm={branchActivation.confirmSwitch}
      />
      <CreatePullRequestDialog
        branch={prBranch}
        repoPath={activeRepoPath}
        onClose={() => setPrBranch(null)}
      />
    </div>
  );
}

function WorkspaceContextMenu({
  x,
  y,
  open,
  localBranches,
  branchesLoading,
  branchesUnavailable,
  switching,
  onSwitch,
  onClose,
}: {
  x: number;
  y: number;
  open: boolean;
  localBranches: Branch[];
  branchesLoading: boolean;
  branchesUnavailable: boolean;
  switching: boolean;
  onSwitch: (branch: Branch) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;

    const updatePosition = () => {
      const { width, height } = menuRef.current!.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [open, x, y]);

  if (!open) return null;

  const visibleBranches = localBranches.slice(0, 20);

  return createPortal(
    <div
      className="fixed inset-0 z-[110]"
      role="presentation"
      onMouseDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        role="menu"
        aria-label="Workspace actions"
        className="giteye-context-menu fixed max-h-[calc(100vh-16px)] w-[300px] overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] shadow-[var(--shadow-elevated)]"
        style={position}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="giteye-context-header border-b border-[var(--color-border-muted)]">
          <span className="text-[11.5px] font-medium text-[var(--color-text-primary)]">
            Switch local branch
          </span>
          <p className="mt-0.5 text-[10.5px] text-[var(--color-text-muted)]">
            Uses the same working-copy safeguards as Branches.
          </p>
        </div>
        {branchesLoading ? (
          <WorkspaceMenuNote>Loading branches…</WorkspaceMenuNote>
        ) : branchesUnavailable ? (
          <WorkspaceMenuNote>Branches unavailable</WorkspaceMenuNote>
        ) : visibleBranches.length === 0 ? (
          <WorkspaceMenuNote>No local branches</WorkspaceMenuNote>
        ) : (
          visibleBranches.map((branch) => (
            <button
              key={branch.name}
              type="button"
              role="menuitem"
              disabled={branch.isCurrent || switching}
              title={branch.isCurrent ? `${branch.shortName} is current` : `Switch to ${branch.shortName}`}
              onClick={() => {
                if (branch.isCurrent || switching) return;
                onClose();
                onSwitch(branch);
              }}
              className="giteye-context-item"
            >
              <span className="giteye-context-label">{branch.shortName}</span>
              <span className="giteye-context-detail">
                {branch.isCurrent ? "current" : branch.upstream ?? "local"}
              </span>
            </button>
          ))
        )}
        {localBranches.length > visibleBranches.length ? (
          <WorkspaceMenuNote>
            Showing first {visibleBranches.length} of {localBranches.length} local branches.
          </WorkspaceMenuNote>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function WorkspaceMenuNote({ children }: { children: ReactNode }) {
  return <div className="px-3 py-2 text-[11px] text-[var(--color-text-muted)]">{children}</div>;
}

function ConflictsTab({
  conflicts,
  inRebase,
}: {
  conflicts: Array<{ path: string; status: string; conflictType: string }>;
  inRebase: boolean;
}) {
  if (inRebase) {
    return (
      <div className="h-full overflow-hidden">
        <RebaseConflictResolver />
      </div>
    );
  }

  if (conflicts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-[var(--color-text-muted)]">
        No unmerged files. Conflict tools appear here while a merge, rebase, cherry-pick, or revert is stopped.
      </div>
    );
  }

  return (
    <div className="h-full space-y-0.5 overflow-y-auto p-2">
      {conflicts.map((conflict) => (
        <div
          key={conflict.path}
          title={`${conflict.status} · ${conflict.conflictType}`}
          className="flex items-center gap-2 rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-[11px]"
        >
          <AlertTriangle className="h-3 w-3 shrink-0 text-[var(--color-warning)]" />
          <span className="shrink-0 font-mono text-[10.5px] text-[var(--color-warning)]">{conflict.status}</span>
          <span className="min-w-0 flex-1 truncate text-[var(--color-text-secondary)]">{conflict.path}</span>
          <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">{conflict.conflictType}</span>
        </div>
      ))}
      <p className="pt-1 text-[10.5px] text-[var(--color-text-muted)]">
        Resolve these files from the Changes panel, stage them, then continue the operation from the banner above.
      </p>
    </div>
  );
}
