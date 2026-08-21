import { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Globe2, Trash2, X } from "lucide-react";
import { gitActionErrorMessage, gitMutations } from "../../lib/git-data";
import { formatDryRunPreview } from "../../lib/git-preview";
import type { Branch } from "../../types/git";
import { Button } from "../ui";
import { useAppDialog } from "../common/AppDialogProvider";

function splitRemoteRef(value: string | null | undefined) {
  if (!value) return null;
  const separator = value.indexOf("/");
  if (separator < 1 || separator === value.length - 1) return null;
  return { remote: value.slice(0, separator), branch: value.slice(separator + 1) };
}

export function BranchDeleteDialog({
  branch,
  repoPath,
  onClose,
}: {
  branch: Branch | null;
  repoPath: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const appDialog = useAppDialog();
  const deleteLocal = useMutation(gitMutations.deleteBranch(queryClient, repoPath));
  const deleteRemote = useMutation(gitMutations.deleteRemoteBranch(queryClient, repoPath));
  const previewRemote = useMutation(gitMutations.deleteRemoteBranchDryRun(repoPath));
  const upstream = splitRemoteRef(branch?.upstream);
  const [includeRemote, setIncludeRemote] = useState(false);

  if (!branch || branch.isRemote || branch.isCurrent) return null;

  const busy = deleteLocal.isPending || deleteRemote.isPending || previewRemote.isPending;
  const error = deleteLocal.error ?? deleteRemote.error ?? previewRemote.error;

  const performDelete = async () => {
    let preview = "";
    if (includeRemote && upstream) {
      try {
        preview = formatDryRunPreview(
          await previewRemote.mutateAsync(upstream),
          "Git did not report a remote ref deletion for this dry run.",
        );
      } catch (reason) {
        await appDialog.alert({
          title: "Unable to preview remote deletion",
          message: gitActionErrorMessage(reason),
          tone: "danger",
        });
        return;
      }
    }

    const confirmed = await appDialog.confirm({
      title: includeRemote ? "Delete local and remote branches?" : "Delete local branch?",
      message: includeRemote && upstream
        ? `Delete local branch “${branch.shortName}” and its tracked remote branch “${branch.upstream}”?`
        : `Delete local branch “${branch.shortName}”?`,
      detail: includeRemote && upstream
        ? `Remote dry-run:\n${preview}\n\nThe remote branch is removed first so the local branch remains available if that operation fails.`
        : branch.upstream
          ? `Tracking upstream ${branch.upstream} is not deleted.`
          : "No tracking upstream is configured.",
      confirmLabel: includeRemote ? "Delete both branches" : "Delete local branch",
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      // Preserve the local branch as the recovery point until the remote delete succeeds.
      if (includeRemote && upstream) await deleteRemote.mutateAsync(upstream);
      await deleteLocal.mutateAsync(branch.shortName);
      onClose();
    } catch {
      // React Query exposes the exact mutation error in the dialog body below.
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="branch-delete-title"
        className="w-[calc(100vw-2rem)] max-w-xl overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-elevated)]"
      >
        <header className="flex items-start gap-3 border-b border-[var(--color-border-muted)] px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-danger)]/35 bg-[var(--color-danger)]/10 text-[var(--color-danger)]">
            <Trash2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="branch-delete-title" className="text-sm font-semibold text-[var(--color-text-primary)]">Delete branch</h2>
            <p className="mt-1 truncate font-mono text-xs text-[var(--color-text-secondary)]">{branch.shortName}</p>
          </div>
          <button type="button" onClick={onClose} className="giteye-btn giteye-btn-ghost giteye-btn-icon giteye-btn-sm" aria-label="Close branch deletion dialog">
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="space-y-3 px-4 py-3">
          <div className="flex items-start gap-2 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2.5 text-xs">
            <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
            <div>
              <p className="font-medium text-[var(--color-text-primary)]">Delete local branch</p>
              <p className="mt-0.5 text-[var(--color-text-muted)]">Removes the local ref. The current branch cannot be deleted.</p>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2.5 text-xs has-[:checked]:border-[var(--color-danger)]/45 has-[:checked]:bg-[var(--color-danger)]/8">
            <input
              type="checkbox"
              checked={includeRemote}
              disabled={!upstream || busy}
              onChange={(event) => setIncludeRemote(event.target.checked)}
              className="mt-0.5 accent-[var(--color-danger)]"
            />
            <Globe2 className="h-4 w-4 shrink-0 text-[var(--color-warning)]" />
            <div>
              <p className="font-medium text-[var(--color-text-primary)]">Also delete tracking remote branch</p>
              <p className="mt-0.5 text-[var(--color-text-muted)]">
                {branch.upstream ?? "No tracking upstream configured for this branch."}
              </p>
            </div>
          </label>

          {error ? (
            <p className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
              {gitActionErrorMessage(error)}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)]/70 px-4 py-2.5">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => void performDelete()} disabled={busy}>
            {includeRemote ? "Delete local + remote" : "Delete local"}
          </Button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
