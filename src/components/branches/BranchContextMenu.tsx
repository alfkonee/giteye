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
        className="giteye-context-menu fixed max-h-[calc(100vh-16px)] w-[286px] overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] shadow-[var(--shadow-elevated)]"
        style={position}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="giteye-context-header flex items-baseline gap-2 border-b border-[var(--color-border-muted)]">
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-[var(--color-text-primary)]">
            {branch.shortName}
          </span>
          <span className="shrink-0 truncate text-[10.5px] text-[var(--color-text-muted)]">{trackingState}</span>
        </div>

        <BranchMenuItem
          label="Rename branch"
          detail={canUseLocalBranchTools ? branch.shortName : "local branches only"}
          disabled={!canUseLocalBranchTools || !onRename}
          onSelect={() => onRename?.(branch)}
          onClose={onClose}
        />
        <BranchMenuItem
          label="Set tracking upstream"
          detail={branch.upstream ?? "empty prompt clears tracking"}
          disabled={!canUseLocalBranchTools || !onSetUpstream}
          onSelect={() => onSetUpstream?.(branch)}
          onClose={onClose}
        />
        <BranchMenuItem
          label="Push branch…"
          detail="remote, target, tracking"
          disabled={!canUseLocalBranchTools || !onPushBranch}
          onSelect={() => onPushBranch?.(branch)}
          onClose={onClose}
        />
        <BranchMenuItem
          label="Force-with-lease push…"
          detail="confirms before rewrite"
          tone="danger"
          disabled={!canUseLocalBranchTools || !onForcePushBranch}
          onSelect={() => onForcePushBranch?.(branch)}
          onClose={onClose}
        />

        <div className="giteye-context-separator" />
        <BranchMenuItem
          label="New branch from here"
          detail={branch.shortName}
          onSelect={() => onCreateFromBranch(branch)}
          onClose={onClose}
        />
        <BranchMenuItem
          label="Fast-forward from upstream"
          detail={branch.upstream ?? "needs tracking"}
          disabled={!canFastForward}
          onSelect={() => onFastForward(branch)}
          onClose={onClose}
        />
        <BranchMenuItem
          label="Rebase current onto this"
          detail={branch.isCurrent ? "pick another branch" : branch.shortName}
          disabled={!canRebaseCurrentBranch}
          keepOpen
          onSelect={() => void rebaseCurrentBranch()}
          onClose={onClose}
        />
        <BranchMenuItem
          label="Merge into current branch"
          detail={branch.isCurrent ? "cannot merge into itself" : branch.shortName}
          disabled={branch.isCurrent}
          onSelect={() => onMerge(branch)}
          onClose={onClose}
        />
        <BranchMenuItem
          label="Advanced merge & rebase…"
          detail="strategy, --onto, rerere"
          onSelect={() => onAdvancedMergeRebase?.(branch)}
          onClose={onClose}
        />

        <div className="giteye-context-separator" />
        <BranchMenuItem
          label="Delete local branch"
          detail={
            branch.isCurrent
              ? "current branch"
              : branch.isRemote
                ? "use remote delete below"
                : branch.shortName
          }
          tone="danger"
          disabled={!canDelete}
          onSelect={() => onDelete?.(branch)}
          onClose={onClose}
        />
        <BranchMenuItem
          label="Delete remote branch"
          detail={branch.isRemote ? branch.shortName : "remote branches only"}
          tone="danger"
          disabled={!canDeleteRemote}
          onSelect={() => onDeleteRemoteBranch?.(branch)}
          onClose={onClose}
        />
      </div>
    </div>,
    document.body,
  );
}

/**
 * One compact menu row: bold action on the left, muted context (upstream,
 * branch name, or why it is disabled) right-aligned on the same line.
 */
function BranchMenuItem({
  label,
  detail,
  tone = "default",
  disabled = false,
  keepOpen = false,
  onSelect,
  onClose,
}: {
  label: string;
  detail: string;
  tone?: "default" | "danger";
  disabled?: boolean;
  /** Handlers that own their own dismissal (async previews) keep the menu open. */
  keepOpen?: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={`${label} — ${detail}`}
      onClick={() => {
        if (disabled) return;
        if (!keepOpen) onClose();
        onSelect();
      }}
      className={
        tone === "danger"
          ? "giteye-context-item text-[var(--color-danger)]"
          : "giteye-context-item"
      }
    >
      <span className="giteye-context-label">{label}</span>
      <span className="giteye-context-detail">{detail}</span>
    </button>
  );
}
