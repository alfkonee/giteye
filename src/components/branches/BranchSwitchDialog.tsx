import type { Branch } from "../../types/git";
import type { CheckoutBranchStrategy } from "../../lib/tauri-api";
import { Archive, ArrowRightLeft, GitBranch, X } from "lucide-react";
import { Button } from "../ui/Button";
import { createPortal } from "react-dom";

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

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 px-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="branch-switch-title"
        className="w-[calc(100vw-2rem)] max-w-2xl rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 shadow-[var(--shadow-elevated)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="branch-switch-title" className="text-base font-semibold text-[var(--color-text-primary)]">
              Switch branch?
            </h2>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Switch to {branchKind} branch.
            </p>
            <code className="mt-1 block break-all font-mono text-xs text-[var(--color-text-secondary)]">
              {branch.shortName}
            </code>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--color-border-muted)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
            {branchKind}
          </span>
        </div>

        {isClean ? (
          <p className="mt-4 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
            The working copy is clean. GitEye will switch branches directly.
          </p>
        ) : (
          <div className="mt-4 space-y-3 text-xs text-[var(--color-text-secondary)]">
            <div className="flex items-start gap-2 rounded-lg border border-[color:rgba(210,153,34,0.35)] bg-[color:rgba(210,153,34,0.08)] px-3 py-2.5 text-[var(--color-warning)]">
              <Archive className="mt-0.5 h-4 w-4 shrink-0" />
              <p>This repository has uncommitted changes. Choose how to handle the existing working copy.</p>
            </div>
            <div className="grid gap-3 min-[480px]:grid-cols-2">
              <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3">
                <div className="flex items-center gap-2 font-medium text-[var(--color-text-primary)]">
                  <ArrowRightLeft className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
                  <span>Move changes</span>
                </div>
                <p className="mt-1.5 text-[var(--color-text-muted)]">Keep modifications in the working copy while switching.</p>
              </div>
              <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3">
                <div className="flex items-center gap-2 font-medium text-[var(--color-text-primary)]">
                  <Archive className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
                  <span>Stash changes</span>
                </div>
                <p className="mt-1.5 text-[var(--color-text-muted)]">Create a stash, including untracked files, before switching.</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 grid gap-2 min-[480px]:grid-cols-[auto_auto_1fr]">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isPending}
            icon={<X className="h-4 w-4" />}
            className="w-full min-[480px]:w-auto"
          >
            Cancel
          </Button>
          {!isClean && (
            <Button
              variant="secondary"
              onClick={() => onConfirm("stash")}
              disabled={isPending}
              icon={<Archive className="h-4 w-4" />}
              className="w-full min-[480px]:w-auto"
            >
              Stash and switch
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => onConfirm("move")}
            disabled={isPending}
            icon={isClean ? <GitBranch className="h-4 w-4" /> : <ArrowRightLeft className="h-4 w-4" />}
            className="w-full min-[480px]:w-auto"
          >
            {isClean ? "Switch branch" : "Move changes and switch"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
