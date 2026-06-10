import type { Branch } from "../../types/git";
import type { CheckoutBranchStrategy } from "../../lib/tauri-api";

interface BranchSwitchDialogProps {
  branch: Branch | null;
  isClean: boolean;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: (strategy: CheckoutBranchStrategy) => void;
}

export function BranchSwitchDialog({ branch, isClean, isPending, onCancel, onConfirm }: BranchSwitchDialogProps) {
  if (!branch) return null;

  const branchKind = branch.isRemote ? "remote" : "local";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 px-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="branch-switch-title"
        className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-elevated)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="branch-switch-title" className="text-sm font-semibold text-[var(--color-text-primary)]">
              Switch branch?
            </h2>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Switch to {branchKind} branch <span className="font-mono text-[var(--color-text-secondary)]">{branch.shortName}</span>.
            </p>
          </div>
          <span className="rounded-full border border-[var(--color-border-muted)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
            {branchKind}
          </span>
        </div>

        {isClean ? (
          <p className="mt-4 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
            The working copy is clean. GitEye will switch branches directly.
          </p>
        ) : (
          <div className="mt-4 space-y-2 text-xs text-[var(--color-text-secondary)]">
            <p className="rounded-lg border border-[color:rgba(210,153,34,0.35)] bg-[color:rgba(210,153,34,0.08)] px-3 py-2 text-[var(--color-warning)]">
              This repository has uncommitted changes. Choose how to handle the existing working copy.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3">
                <div className="font-medium text-[var(--color-text-primary)]">Move changes</div>
                <p className="mt-1 text-[var(--color-text-muted)]">Keep modifications in the working copy while switching.</p>
              </div>
              <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3">
                <div className="font-medium text-[var(--color-text-primary)]">Stash changes</div>
                <p className="mt-1 text-[var(--color-text-muted)]">Create a stash, including untracked files, before switching.</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-md border border-[var(--color-border-muted)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          {!isClean && (
            <button
              type="button"
              onClick={() => onConfirm("stash")}
              disabled={isPending}
              className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Stash and switch
            </button>
          )}
          <button
            type="button"
            onClick={() => onConfirm("move")}
            disabled={isPending}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isClean ? "Switch branch" : "Move changes and switch"}
          </button>
        </div>
      </div>
    </div>
  );
}
