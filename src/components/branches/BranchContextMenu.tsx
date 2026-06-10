import type { Branch } from "../../types/git";

interface BranchContextMenuProps {
  branch: Branch | null;
  x: number;
  y: number;
  onCreateFromBranch: (branch: Branch) => void;
  onClose: () => void;
}

export function BranchContextMenu({ branch, x, y, onCreateFromBranch, onClose }: BranchContextMenuProps) {
  if (!branch) return null;

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
      </div>
    </div>
  );
}
