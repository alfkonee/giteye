import { useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { formatRebasePreview } from "../../lib/git-preview";
import { gitMutations } from "../../lib/git-data";
import type { Branch, StartRebaseRequest } from "../../types/git";

interface BranchContextMenuProps {
  branch: Branch | null;
  x: number;
  y: number;
  repoPath: string | null;
  onRename?: (branch: Branch) => void;
  onSetUpstream?: (branch: Branch) => void;
  onPushBranch?: (branch: Branch) => void;
  onForcePushBranch?: (branch: Branch) => void;
  onDeleteRemoteBranch?: (branch: Branch) => void;
  onCreateFromBranch: (branch: Branch) => void;
  onFastForward: (branch: Branch) => void;
  onMerge: (branch: Branch) => void;
  onAdvancedMergeRebase?: (branch: Branch) => void;
  onDelete?: (branch: Branch) => void;
  onClose: () => void;
}

export function BranchContextMenu({
  branch,
  repoPath,
  x,
  y,
  onCreateFromBranch,
  onFastForward,
  onMerge,
  onAdvancedMergeRebase,
  onDelete,
  onRename,
  onSetUpstream,
  onPushBranch,
  onForcePushBranch,
  onDeleteRemoteBranch,
  onClose,
}: BranchContextMenuProps) {
  const queryClient = useQueryClient();
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const previewRebaseMutation = useMutation(gitMutations.previewRebase(repoPath));
  const rebaseUpstreamMutation = useMutation(
    gitMutations.rebaseUpstream(queryClient, repoPath),
  );

  useLayoutEffect(() => {
    if (!branch || !menuRef.current) return;

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
  }, [branch, x, y]);

  const rebaseCurrentBranch = async () => {
    if (!branch || branch.isCurrent || !repoPath) return;

    const request: StartRebaseRequest = {
      upstream: branch.shortName,
      onto: null,
      branch: null,
      autostash: true,
    };
    let previewText: string;
    try {
      previewText = formatRebasePreview(
        await previewRebaseMutation.mutateAsync(request),
      );
    } catch (error) {
      window.alert(
        `Unable to preview rebase onto ${branch.shortName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }

    if (
      !window.confirm(
        `Rebase the current branch onto "${branch.shortName}"?\n\nThis rewrites local branch history. GitEye will autostash local changes when Git can do so.\n\nPreview:\n${previewText}\n\nRecovery: abort while the rebase is active, or use ORIG_HEAD/reflog after completion to create a recovery branch or reset back.`,
      )
    ) {
      return;
    }

    rebaseUpstreamMutation.mutate(request);
    onClose();
  };

  if (!branch) return null;

  const canUseLocalBranchTools = !branch.isRemote;
  const canFastForward = canUseLocalBranchTools && Boolean(branch.upstream);
  const canRebaseCurrentBranch =
    !branch.isCurrent &&
    Boolean(repoPath) &&
    !previewRebaseMutation.isPending &&
    !rebaseUpstreamMutation.isPending;
  const canDelete = Boolean(onDelete) && !branch.isCurrent && !branch.isRemote;
  const canDeleteRemote = Boolean(onDeleteRemoteBranch) && branch.isRemote;
  const trackingState = branch.upstream
    ? [
        branch.upstream,
        branch.ahead ? `${branch.ahead} ahead` : null,
        branch.behind ? `${branch.behind} behind` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : branch.isRemote
      ? "Remote tracking branch"
      : "No tracked upstream";

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
        aria-label={`Branch actions for ${branch.shortName}`}
        className="fixed max-h-[calc(100vh-16px)] min-w-56 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] py-1 shadow-[var(--shadow-elevated)]"
        style={position}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--color-border-muted)] px-3 py-2 text-xs">
          <div className="max-w-64 truncate font-medium text-[var(--color-text-primary)]">{branch.shortName}</div>
          <div className="mt-0.5 max-w-64 truncate text-[11px] text-[var(--color-text-muted)]">{trackingState}</div>
        </div>
        <button
          type="button"
          role="menuitem"
          disabled={!canUseLocalBranchTools || !onRename}
          onClick={() => {
            if (!canUseLocalBranchTools) return;
            onRename?.(branch);
            onClose();
          }}
          className="flex w-full flex-col px-3 py-2 text-left text-xs text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
        >
          <span className="font-medium">Rename branch</span>
          <span className="mt-0.5 max-w-64 truncate text-[11px] text-[var(--color-text-muted)]">
            {canUseLocalBranchTools ? branch.shortName : "Only local branches can be renamed"}
          </span>
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!canUseLocalBranchTools || !onSetUpstream}
          onClick={() => {
            if (!canUseLocalBranchTools) return;
            onSetUpstream?.(branch);
            onClose();
          }}
          className="flex w-full flex-col px-3 py-2 text-left text-xs text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
        >
          <span className="font-medium">Set tracking upstream</span>
          <span className="mt-0.5 max-w-64 truncate text-[11px] text-[var(--color-text-muted)]">
            {branch.upstream ?? "Leave prompt empty to clear tracking"}
          </span>
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!canUseLocalBranchTools || !onPushBranch}
          onClick={() => {
            if (!canUseLocalBranchTools) return;
            onPushBranch?.(branch);
            onClose();
          }}
          className="flex w-full flex-col px-3 py-2 text-left text-xs text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
        >
          <span className="font-medium">Push branch…</span>
          <span className="mt-0.5 max-w-64 truncate text-[11px] text-[var(--color-text-muted)]">Choose remote, target branch, and upstream tracking</span>
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!canUseLocalBranchTools || !onForcePushBranch}
          onClick={() => {
            if (!canUseLocalBranchTools) return;
            onForcePushBranch?.(branch);
            onClose();
          }}
          className="flex w-full flex-col px-3 py-2 text-left text-xs text-[var(--color-danger)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
        >
          <span className="font-medium">Force-with-lease push…</span>
          <span className="mt-0.5 max-w-64 truncate text-[11px] text-[var(--color-text-muted)]">Confirms before rewriting remote history</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onCreateFromBranch(branch);
            onClose();
          }}
          className="flex w-full flex-col px-3 py-2 text-left text-xs text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)]"
        >
          <span className="font-medium">New branch from here</span>
          <span className="mt-0.5 max-w-64 truncate text-[11px] text-[var(--color-text-muted)]">{branch.shortName}</span>
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!canFastForward}
          onClick={() => {
            if (!canFastForward) return;
            onFastForward(branch);
            onClose();
          }}
          className="flex w-full flex-col px-3 py-2 text-left text-xs text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
        >
          <span className="font-medium">Fast-forward from upstream</span>
          <span className="mt-0.5 max-w-64 truncate text-[11px] text-[var(--color-text-muted)]">
            {branch.upstream ?? "Only local branches with tracking can fast-forward"}
          </span>
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!canRebaseCurrentBranch}
          onClick={() => void rebaseCurrentBranch()}
          className="flex w-full flex-col px-3 py-2 text-left text-xs text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
        >
          <span className="font-medium">Rebase current branch onto this branch</span>
          <span className="mt-0.5 max-w-64 truncate text-[11px] text-[var(--color-text-muted)]">
            {branch.isCurrent
              ? "Select another branch as the rebase upstream"
              : branch.shortName}
          </span>
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={branch.isCurrent}
          onClick={() => {
            if (branch.isCurrent) return;
            onMerge(branch);
            onClose();
          }}
          className="flex w-full flex-col px-3 py-2 text-left text-xs text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
        >
          <span className="font-medium">Merge into current branch</span>
          <span className="mt-0.5 max-w-64 truncate text-[11px] text-[var(--color-text-muted)]">
            {branch.isCurrent ? "Current branch cannot be merged into itself" : branch.shortName}
          </span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onAdvancedMergeRebase?.(branch);
            onClose();
          }}
          className="flex w-full flex-col px-3 py-2 text-left text-xs text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)]"
        >
          <span className="font-medium">Advanced merge &amp; rebase…</span>
          <span className="mt-0.5 max-w-64 truncate text-[11px] text-[var(--color-text-muted)]">
            Open strategy, --onto, rerere, and conflict status controls
          </span>
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!canDelete}
          onClick={() => {
            if (!canDelete) return;
            onDelete?.(branch);
            onClose();
          }}
          className="flex w-full flex-col border-t border-[var(--color-border-muted)] px-3 py-2 text-left text-xs text-[var(--color-danger)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
        >
          <span className="font-medium">Delete local branch</span>
          <span className="mt-0.5 max-w-64 truncate text-[11px] text-[var(--color-text-muted)]">
            {branch.isCurrent
              ? "Current branch cannot be deleted"
              : branch.isRemote
                ? "Use Delete remote branch below"
                : branch.shortName}
          </span>
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!canDeleteRemote}
          onClick={() => {
            if (!canDeleteRemote) return;
            onDeleteRemoteBranch?.(branch);
            onClose();
          }}
          className="flex w-full flex-col px-3 py-2 text-left text-xs text-[var(--color-danger)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
        >
          <span className="font-medium">Delete remote branch</span>
          <span className="mt-0.5 max-w-64 truncate text-[11px] text-[var(--color-text-muted)]">
            {branch.isRemote ? branch.shortName : "Only remote branches can be deleted here"}
          </span>
        </button>
      </div>
    </div>,
    document.body,
  );
}
