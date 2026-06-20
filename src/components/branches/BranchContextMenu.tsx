import type { Branch } from "../../types/git";

interface BranchContextMenuProps {
  branch: Branch | null;
  x: number;
  y: number;
  onCreateFromBranch: (branch: Branch) => void;
  onFastForward: (branch: Branch) => void;
  onMerge: (branch: Branch) => void;
  onClose: () => void;
}

export function BranchContextMenu({ branch, x, y, onCreateFromBranch, onFastForward, onMerge, onClose }: BranchContextMenuProps) {
  if (!branch) return null;
  const canFastForward = !branch.isRemote && Boolean(branch.upstream);
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


  return (
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
        role="menu"
        aria-label={`Branch actions for ${branch.shortName}`}
        className="min-w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] py-1 shadow-[var(--shadow-elevated)]"
        style={{ left: x, top: y, position: "fixed" }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--color-border-muted)] px-3 py-2 text-xs">
          <div className="max-w-64 truncate font-medium text-[var(--color-text-primary)]">{branch.shortName}</div>
          <div className="mt-0.5 max-w-64 truncate text-[11px] text-[var(--color-text-muted)]">{trackingState}</div>
        </div>
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
      </div>
    </div>
  );
}
