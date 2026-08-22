import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Circle,
  Download,
  GitBranch,
  GitMerge,
  RefreshCw,
  Upload,
  Zap,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { runBranchPushFlow } from "../../lib/branch-push";
import { formatDryRunPreview } from "../../lib/git-preview";
import { useAppStore } from "../../stores/app-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries, invalidateGitState } from "../../lib/git-data";
import type { Branch } from "../../types/git";
import type { CheckoutBranchStrategy } from "../../lib/tauri-api";
import { BranchSwitchDialog } from "../branches/BranchSwitchDialog";
import { BranchContextMenu } from "../branches/BranchContextMenu";
import { BranchDeleteDialog } from "../branches/BranchDeleteDialog";
import { appDialog } from "../common/AppDialogProvider";

interface ToolbarProps {
  repoName?: string;
  currentBranch?: string;
  isClean?: boolean;
  submoduleParent?: unknown;
}

function remoteNamesFromBranches(branches: Branch[]) {
  return Array.from(
    new Set(
      branches
        .filter((branch) => branch.isRemote)
        .map((branch) => branch.shortName.split("/", 1)[0])
        .filter(Boolean),
    ),
  );
}

function splitRemoteBranch(branch: Branch) {
  const separator = branch.shortName.indexOf("/");
  if (separator < 1) return null;
  return {
    remote: branch.shortName.slice(0, separator),
    branch: branch.shortName.slice(separator + 1),
  };
}


export function Toolbar({ currentBranch, isClean }: ToolbarProps) {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setPendingAdvancedBranchName = useAppStore(
    (s) => s.setPendingAdvancedBranchName,
  );
  const queryClient = useQueryClient();
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [pushMenuOpen, setPushMenuOpen] = useState(false);
  const [branchToSwitch, setBranchToSwitch] = useState<Branch | null>(null);
  const [contextBranch, setContextBranch] = useState<{ branch: Branch; x: number; y: number } | null>(null);
  const [deleteBranchTarget, setDeleteBranchTarget] = useState<Branch | null>(null);
  const branchMenuRef = useRef<HTMLDivElement>(null);
  const pushMenuRef = useRef<HTMLDivElement>(null);
  const { data: branches, isFetching: branchesFetching } = useQuery(
    gitQueries.branches(activeRepoPath),
  );
  const checkoutBranch = useMutation(gitMutations.checkoutBranch(queryClient, activeRepoPath));
  const createBranch = useMutation(gitMutations.createBranch(queryClient, activeRepoPath));
  const fastForwardBranchMutation = useMutation(gitMutations.fastForwardBranch(queryClient, activeRepoPath));
  const mergeBranchMutation = useMutation(gitMutations.mergeBranch(queryClient, activeRepoPath));
  const renameBranchMutation = useMutation(gitMutations.renameBranch(queryClient, activeRepoPath));
  const upstreamMutation = useMutation(gitMutations.setBranchUpstream(queryClient, activeRepoPath));
  const pushBranchMutation = useMutation(gitMutations.pushBranch(queryClient, activeRepoPath));
  const pushBranchDryRunMutation = useMutation(gitMutations.pushBranchDryRun(activeRepoPath));
  const deleteRemoteBranchMutation = useMutation(gitMutations.deleteRemoteBranch(queryClient, activeRepoPath));
  const deleteRemoteBranchDryRunMutation = useMutation(gitMutations.deleteRemoteBranchDryRun(activeRepoPath));
  const fetchMutation = useMutation(gitMutations.fetch(queryClient, activeRepoPath));
  const pullMutation = useMutation(gitMutations.pull(queryClient, activeRepoPath));
  const pushMutation = useMutation(gitMutations.push(queryClient, activeRepoPath));

  const localBranches = branches?.filter((branch) => !branch.isRemote) ?? [];
  const remoteBranches = branches?.filter((branch) => branch.isRemote) ?? [];
  const checkedOutBranch =
    (currentBranch
      ? localBranches.find((branch) => branch.shortName === currentBranch)
      : localBranches.find((branch) => branch.isCurrent)) ?? null;
  const workingTreeState = isClean ? "Clean" : "Uncommitted changes";
  const remoteNames = remoteNamesFromBranches(branches ?? []);
  const isRemoteOperationPending =
    fetchMutation.isPending ||
    pullMutation.isPending ||
    pushMutation.isPending ||
    pushBranchMutation.isPending ||
    pushBranchDryRunMutation.isPending ||
    deleteRemoteBranchMutation.isPending ||
    deleteRemoteBranchDryRunMutation.isPending;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (branchMenuRef.current && !branchMenuRef.current.contains(target)) {
        setBranchMenuOpen(false);
      }
      if (pushMenuRef.current && !pushMenuRef.current.contains(target)) {
        setPushMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const requestBranchSwitch = (branch: Branch) => {
    if (branch.isCurrent) return;
    setBranchToSwitch(branch);
    setBranchMenuOpen(false);
  };

  const confirmBranchSwitch = (strategy: CheckoutBranchStrategy) => {
    if (!branchToSwitch) return;
    checkoutBranch.mutate(
      { branchName: branchToSwitch.shortName, strategy },
      { onSuccess: () => setBranchToSwitch(null) },
    );
  };

  const openBranchContextMenu = (event: ReactMouseEvent, branch: Branch) => {
    event.preventDefault();
    setContextBranch({ branch, x: event.clientX, y: event.clientY });
  };

  const createBranchFrom = async (branch: Branch) => {
    const name = await appDialog.prompt(
      `Create a new branch from ${branch.shortName}.`,
      "",
      "New branch name",
    );
    const trimmedName = name?.trim();
    if (!trimmedName) return;
    createBranch.mutate({ name: trimmedName, checkout: false, startPoint: branch.shortName });
  };

  const fastForwardBranch = (branch: Branch) => {
    if (!branch.upstream) return;
    fastForwardBranchMutation.mutate({ branchName: branch.shortName, upstream: branch.upstream });
  };
  const mergeBranch = async (branch: Branch) => {
    if (branch.isCurrent) return;
    if (!(await appDialog.confirm(
      `Merge "${branch.shortName}" into the current branch? Your working tree must be clean.`,
      "Merge branch?",
    ))) return;
    mergeBranchMutation.mutate(branch.shortName);
  };

  const deleteBranch = (branch: Branch) => {
    if (branch.isCurrent || branch.isRemote) return;
    setDeleteBranchTarget(branch);
  };

  const renameBranch = async (branch: Branch) => {
    if (branch.isRemote) return;
    const newName = (await appDialog.prompt(
      `Rename "${branch.shortName}" to:`,
      branch.shortName,
      "Rename branch",
    ))?.trim();
    if (!newName || newName === branch.shortName) return;
    renameBranchMutation.mutate({ oldName: branch.shortName, newName });
  };
  const setBranchUpstream = async (branch: Branch) => {
    if (branch.isRemote) return;
    const defaultUpstream = branch.upstream ?? (remoteNames[0] ? `${remoteNames[0]}/${branch.shortName}` : "");
    const upstream = await appDialog.prompt(
      `Set the upstream for "${branch.shortName}" as remote/branch. Leave empty to clear tracking.`,
      defaultUpstream,
      "Set tracking upstream",
    );
    if (upstream === null) return;
    upstreamMutation.mutate({ branchName: branch.shortName, upstream: upstream.trim() || null });
  };
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

  const handlePush = () => {
    setPushMenuOpen(false);
    if (branchesFetching) return;
    if (checkedOutBranch && !checkedOutBranch.upstream) {
      void pushBranch(checkedOutBranch, false);
      return;
    }
    pushMutation.mutate({});
  };

  const handleForcePushWithLease = () => {
    setPushMenuOpen(false);
    if (branchesFetching || !checkedOutBranch) return;
    void pushBranch(checkedOutBranch, true);
  };

  const handleSync = () => {
    if (!activeRepoPath || isRemoteOperationPending || branchesFetching) return;
    if (checkedOutBranch && !checkedOutBranch.upstream) {
      void pushBranch(checkedOutBranch, false);
      return;
    }

    pullMutation.mutate(
      {},
      {
        onSuccess: () => {
          pushMutation.mutate({});
        },
      },
    );
  };

  const deleteRemoteBranch = async (branch: Branch) => {
    if (!branch.isRemote) return;
    const parsed = splitRemoteBranch(branch);
    if (!parsed) return;
    const target = `${parsed.remote}/${parsed.branch}`;
    let previewText: string;
    try {
      previewText = formatDryRunPreview(
        await deleteRemoteBranchDryRunMutation.mutateAsync(parsed),
        "Git did not report a ref deletion for this remote branch dry run.",
      );
    } catch (error) {
      await appDialog.alert(
        `Unable to preview remote branch deletion for ${target}: ${error instanceof Error ? error.message : String(error)}`,
        "Remote deletion preview failed",
      );
      return;
    }
    if (!(await appDialog.confirm(
      `Delete remote branch "${target}"?\n\nPreview:\n${previewText}\n\nThis removes it from the remote repository. Recovery: recreate it by pushing any local branch or reflog commit that still points at the deleted tip.`,
      "Delete remote branch?",
      "danger",
    ))) return;
    deleteRemoteBranchMutation.mutate(parsed);
  };


  return (
    <div className="giteye-toolbar flex shrink-0 select-none items-center gap-1 border-b border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-2">
      <div className="giteye-toolbar-repo flex min-w-0 shrink-0 items-center gap-1.5">

        {currentBranch && (
          <div className="relative" ref={branchMenuRef}>
            <button
              onClick={() => setBranchMenuOpen((open) => !open)}
              aria-expanded={branchMenuOpen}
              className="giteye-btn giteye-btn-secondary giteye-btn-sm max-w-[min(200px,28vw)] gap-1.5 px-2 text-[12px] font-medium text-[var(--color-text-secondary)]"
              title="Checkout branch; right-click branch rows for rename, tracking, push, and delete actions"
            >
              <GitBranch className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
              <span className="truncate">{currentBranch}</span>
              <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", branchMenuOpen && "rotate-180")} />
            </button>

            {branchMenuOpen && (
              <div role="menu" aria-label="Branches" className="absolute left-0 top-full z-50 mt-1.5 max-h-[min(20rem,calc(100vh-7rem))] w-[min(320px,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] py-1 shadow-[var(--shadow-elevated)]">
                <div className="border-b border-[var(--color-border-muted)] px-2.5 py-1.5 text-[11px] text-[var(--color-text-muted)]">
                  Right-click any branch for rename, tracking, push, and delete tools.
                </div>
                <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  <span>Local Branches</span>
                  <span>{localBranches.length}</span>
                </div>
                {localBranches.map((branch) => (
                  <button
                    key={branch.name}
                    role="menuitem"
                    onClick={() => requestBranchSwitch(branch)}
                    onContextMenu={(event) => openBranchContextMenu(event, branch)}
                    title={branch.isCurrent ? "Current branch · right-click for branch actions" : "Click to checkout · right-click for branch actions"}
                    className={cn(
                      "giteye-menu-item flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors",
                      branch.isCurrent
                        ? "giteye-selected-row text-[var(--color-text-primary)]"
                        : "text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]",
                    )}
                  >
                    <GitBranch className={cn("h-4 w-4 shrink-0", branch.isCurrent ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{branch.shortName}</span>
                      {branch.upstream && (
                        <span className="block truncate text-[10px] text-[var(--color-text-muted)]">
                          {trackingLabel(branch)}
                        </span>
                      )}
                    </span>
                    {branch.isCurrent && <span className="text-[11px] font-medium text-[var(--color-accent)]">current</span>}
                  </button>
                ))}
                {remoteBranches.length > 0 && (
                  <>
                    <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      <span>Remote Branches</span>
                      <span>{remoteBranches.length}</span>
                    </div>
                    {remoteBranches.map((branch) => (
                      <button
                        key={branch.name}
                        role="menuitem"
                        onClick={() => requestBranchSwitch(branch)}
                        onContextMenu={(event) => openBranchContextMenu(event, branch)}
                        title="Click to checkout remote branch · right-click for remote branch actions"
                        className="giteye-menu-item flex w-full items-center gap-2 px-2.5 py-2 text-left text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)]"
                      >
                        <GitBranch className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
                        <span className="truncate">{branch.shortName}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mx-0.5 h-6 w-px shrink-0 bg-[var(--color-border-muted)]" />

      <div className="giteye-toolbar-sync flex shrink-0 items-center gap-0.5">
        <ToolbarButton
          icon={<Download className="h-4 w-4" />}
          label="Fetch"
          title="Fetch from remote"
          tone="secondary"
          disabled={!activeRepoPath || isRemoteOperationPending}
          onClick={() => fetchMutation.mutate(undefined)}
        />
        <ToolbarButton
          icon={<GitMerge className="h-4 w-4" />}
          label="Pull"
          title="Pull from remote"
          tone="secondary"
          disabled={!activeRepoPath || isRemoteOperationPending}
          onClick={() => pullMutation.mutate({})}
        />
        <div className="relative flex items-center" ref={pushMenuRef}>
          <ToolbarButton
            icon={<Upload className="h-4 w-4" />}
            label="Push"
            title="Push to remote"
            tone="secondary"
            disabled={!activeRepoPath || isRemoteOperationPending || branchesFetching}
            onClick={handlePush}
            className="rounded-r-none"
          />
          <button
            type="button"
            onClick={() => setPushMenuOpen((open) => !open)}
            disabled={!activeRepoPath || isRemoteOperationPending || branchesFetching}
            aria-haspopup="menu"
            aria-expanded={pushMenuOpen}
            aria-label="More push options"
            title="More push options"
            className="giteye-btn giteye-btn-secondary giteye-btn-sm w-4 min-w-4 rounded-l-none border-l-0 px-0 disabled:cursor-not-allowed"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", pushMenuOpen && "rotate-180")} />
          </button>

          {pushMenuOpen && (
            <div
              role="menu"
              className="absolute left-0 top-full z-50 mt-1.5 w-[320px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] py-1 shadow-[var(--shadow-elevated)]"
            >
              <PushMenuItem
                icon={<Upload className="h-4 w-4 text-[var(--color-text-muted)]" />}
                label="Push"
                detail="Fast-forward the remote branch"
                onClick={handlePush}
              />
              <PushMenuItem
                icon={<AlertTriangle className="h-4 w-4 text-[var(--color-warning)]" />}
                label="Force push (with lease)"
                detail={
                  branchesFetching
                    ? "Loading branch details…"
                    : checkedOutBranch
                      ? `Overwrite ${checkedOutBranch.upstream ?? "the remote branch"} — refuses if it moved since your last fetch`
                      : "Unavailable on a detached HEAD"
                }
                tone="warning"
                disabled={branchesFetching || !checkedOutBranch}
                onClick={handleForcePushWithLease}
              />
            </div>
          )}
        </div>
        <ToolbarButton
          icon={<Zap className="h-4 w-4" />}
          label="Sync"
          title="Pull then push"
          tone="success"
          disabled={!activeRepoPath || isRemoteOperationPending || branchesFetching}
          onClick={handleSync}
        />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        {isClean !== undefined && currentBranch && (
          <div className={cn("hidden h-6 items-center gap-1.5 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] px-1.5 text-[11px] xl:flex", isClean ? "text-[var(--color-success)]" : "text-[var(--color-warning)]")}>
            <Circle className="h-2.5 w-2.5 fill-current" />
            <span>{workingTreeState}</span>
          </div>
        )}
        <ToolbarButton
          icon={<RefreshCw className="h-4 w-4" />}
          title="Refresh"
          onClick={() => void invalidateGitState(queryClient, activeRepoPath)}
          disabled={!activeRepoPath}
        />
      </div>
      <BranchSwitchDialog
        branch={branchToSwitch}
        isClean={isClean ?? true}
        isPending={checkoutBranch.isPending}
        onCancel={() => setBranchToSwitch(null)}
        onConfirm={confirmBranchSwitch}
      />
      <BranchContextMenu
        branch={contextBranch?.branch ?? null}
        x={contextBranch?.x ?? 0}
        y={contextBranch?.y ?? 0}
        repoPath={activeRepoPath}
        onRename={renameBranch}
        onSetUpstream={setBranchUpstream}
        onPushBranch={(branch) => pushBranch(branch, false)}
        onForcePushBranch={(branch) => pushBranch(branch, true)}
        onDeleteRemoteBranch={deleteRemoteBranch}
        onCreateFromBranch={createBranchFrom}
        onFastForward={fastForwardBranch}
        onMerge={mergeBranch}
        onAdvancedMergeRebase={(branch) => {
          setPendingAdvancedBranchName(branch.shortName);
          setActiveView("workspace");
        }}
        onDelete={deleteBranch}
        onClose={() => setContextBranch(null)}
      />
      <BranchDeleteDialog
        branch={deleteBranchTarget}
        repoPath={activeRepoPath}
        onClose={() => setDeleteBranchTarget(null)}
      />
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

  return divergence ? `${branch.upstream} · ${divergence}` : `tracks ${branch.upstream}`;
}



function PushMenuItem({
  icon,
  label,
  detail,
  onClick,
  disabled,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "warning";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-start gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate text-[13px] font-medium",
            tone === "warning" ? "text-[var(--color-warning)]" : "text-[var(--color-text-primary)]",
          )}
        >
          {label}
        </span>
        <span className="block text-[11px] text-[var(--color-text-muted)]">{detail}</span>
      </span>
    </button>
  );
}

function ToolbarButton({
  icon,
  label,
  title,
  onClick,
  disabled,
  tone = "ghost",
  className,
}: {
  icon: ReactNode;
  label?: string;
  title?: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "ghost" | "secondary" | "success";
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title ?? label}
      aria-label={title ?? label}
      disabled={disabled}
      className={cn(
        "giteye-btn giteye-btn-sm gap-1 text-[11.5px] disabled:cursor-not-allowed",
        label ? "px-2" : "giteye-btn-icon",
        tone === "success"
          ? "giteye-btn-success"
          : tone === "secondary"
            ? "giteye-btn-secondary"
            : "giteye-btn-ghost",
        className,
      )}
    >
      {icon}
      {label && <span className="hidden lg:inline">{label}</span>}
    </button>
  );
}
