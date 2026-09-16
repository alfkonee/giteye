import type { Branch } from "../../types/git";
import type { CheckoutBranchStrategy } from "../../lib/tauri-api";
import { AlertTriangle, Archive, ArrowRightLeft, GitBranch, Trash2, X } from "lucide-react";
import { Button } from "../ui/Button";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

interface BranchSwitchDialogProps {
  branch: Branch | null;
  isClean: boolean;
  isPending: boolean;
  error?: Error | null;
  /** Extra action GitEye performs right after the checkout succeeds. */
  followUpNote?: string | null;
  onCancel: () => void;
  onConfirm: (strategy: CheckoutBranchStrategy) => void;
}

export function BranchSwitchDialog({ branch, isClean, isPending, error, followUpNote, onCancel, onConfirm }: BranchSwitchDialogProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  useEffect(() => {
    setConfirmingDiscard(false);
  }, [branch]);
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
              {branch.isRemote ? "Create and check out a local tracking branch." : "Switch to local branch."}
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
            <div className="flex items-start gap-2 rounded-lg border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2.5 text-[var(--color-warning)]">
              <Archive className="mt-0.5 h-4 w-4 shrink-0" />
              <p>This repository has uncommitted changes. Choose how to handle the existing working copy.</p>
            </div>
            <div className="grid gap-3 min-[640px]:grid-cols-3">
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
              <div className="rounded-lg border border-[var(--color-danger)] bg-[var(--color-bg-tertiary)] p-3">
                <div className="flex items-center gap-2 font-medium text-[var(--color-danger)]">
                  <Trash2 className="h-4 w-4 shrink-0" />
                  <span>Discard changes</span>
                </div>
                <p className="mt-1.5 text-[var(--color-text-muted)]">Delete staged and unstaged edits and untracked files. Ignored files are kept. GitEye refuses unsafe nested repository or submodule changes.</p>
              </div>
            </div>
          </div>
        )}

        {followUpNote ? (
          <p className="mt-3 rounded-lg border border-[var(--color-info-border)] bg-[var(--color-info-bg)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
            {followUpNote}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 whitespace-pre-wrap break-words text-xs text-[var(--color-danger)]">
            {error.message}
          </p>
        ) : null}

        {confirmingDiscard ? (
          <div role="alert" className="mt-4 rounded-lg border border-[var(--color-danger)] p-3 text-xs text-[var(--color-danger)]">
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 shrink-0" /> Permanently discard changes?</p>
            <p className="mt-2">Staged and unstaged edits and untracked files will be deleted when the switch succeeds. There is no undo in GitEye. Ignored files are preserved; nested repositories and submodule work are never silently deleted.</p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button variant="secondary" disabled={isPending} onClick={() => setConfirmingDiscard(false)}>Keep changes</Button>
              <Button variant="danger" disabled={isPending} onClick={() => onConfirm("discard")}>Discard changes and switch</Button>
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isPending}
            icon={<X className="h-4 w-4" />}
            className="w-full min-[480px]:w-auto"
          >
            Cancel
          </Button>
          {!isClean && !confirmingDiscard && (
            <Button
              variant="danger"
              onClick={() => setConfirmingDiscard(true)}
              disabled={isPending}
              icon={<Trash2 className="h-4 w-4" />}
              className="w-full min-[480px]:w-auto"
            >
              Discard changes…
            </Button>
          )}
          {!isClean && !confirmingDiscard && (
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
          {!confirmingDiscard && <Button
            variant="primary"
            autoFocus
            onClick={() => onConfirm("move")}
            disabled={isPending}
            icon={isClean ? <GitBranch className="h-4 w-4" /> : <ArrowRightLeft className="h-4 w-4" />}
            className="w-full min-[480px]:w-auto"
          >
            {isClean ? "Switch branch" : "Move changes and switch"}
          </Button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
