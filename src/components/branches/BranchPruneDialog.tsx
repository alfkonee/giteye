import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, RefreshCw, Scissors, X } from "lucide-react";
import { gitActionErrorMessage, gitMutations, gitQueries } from "../../lib/git-data";
import { Button } from "../ui";
import { useAppDialog } from "../common/AppDialogProvider";

export function BranchPruneButton({
  repoPath,
  compact = false,
}: {
  repoPath: string | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        icon={<Scissors className="h-3.5 w-3.5" />}
        disabled={!repoPath}
        onClick={() => setOpen(true)}
        title="Preview and prune stale remote-tracking branches"
        iconOnly={compact}
      >
        {compact ? <span className="sr-only">Prune branches</span> : "Prune"}
      </Button>
      {open ? <BranchPruneDialog repoPath={repoPath} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function BranchPruneDialog({ repoPath, onClose }: { repoPath: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const dialog = useAppDialog();
  const remotesQuery = useQuery(gitQueries.remotes(repoPath));
  const previewMutation = useMutation(gitMutations.pruneRemoteDryRun(repoPath));
  const pruneMutation = useMutation(gitMutations.pruneRemote(queryClient, repoPath));
  const [remote, setRemote] = useState("");
  const [preview, setPreview] = useState<string[] | null>(null);
  const remotes = remotesQuery.data ?? [];

  useEffect(() => {
    if (!remote && remotes[0]) setRemote(remotes[0].name);
  }, [remote, remotes]);

  useEffect(() => {
    setPreview(null);
    previewMutation.reset();
  // reset belongs to the mutation object and is stable for this hook instance
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote]);

  const runPreview = async () => {
    if (!remote) return;
    try {
      const lines = await previewMutation.mutateAsync(remote);
      // The backend returns a human-readable sentinel when Git reports no stale
      // refs; it is status text, not a branch to prune.
      setPreview(
        lines.filter((line) => !/^no stale remote-tracking branches/i.test(line.trim())),
      );
    } catch (error) {
      await dialog.alert({
        title: "Unable to preview branch prune",
        message: gitActionErrorMessage(error),
        tone: "danger",
      });
    }
  };

  const prune = async () => {
    if (!remote || preview === null) return;
    const staleCount = preview.length;
    const confirmed = await dialog.confirm({
      title: `Prune ${remote}?`,
      message:
        staleCount > 0
          ? `Remove ${staleCount} stale remote-tracking ${staleCount === 1 ? "branch" : "branches"} from this repository?`
          : "The dry run found no stale remote-tracking branches. Run prune anyway to refresh Git's remote-tracking state?",
      detail: preview.length > 0 ? preview.join("\n") : "No stale refs reported by git remote prune --dry-run.",
      confirmLabel: "Prune stale branches",
      tone: staleCount > 0 ? "warning" : "default",
    });
    if (!confirmed) return;
    pruneMutation.mutate(remote, { onSuccess: onClose });
  };

  const error = remotesQuery.error ?? previewMutation.error ?? pruneMutation.error;
  const busy = previewMutation.isPending || pruneMutation.isPending;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="branch-prune-title"
        className="w-[calc(100vw-2rem)] max-w-2xl overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-elevated)]"
      >
        <header className="flex items-start gap-3 border-b border-[var(--color-border-muted)] px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] text-[var(--color-accent)]">
            <GitBranch className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="branch-prune-title" className="text-sm font-semibold text-[var(--color-text-primary)]">
              Prune stale branches
            </h2>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Preview remote-tracking refs whose branches no longer exist on the selected remote.
            </p>
          </div>
          <button type="button" onClick={onClose} className="giteye-btn giteye-btn-ghost giteye-btn-icon giteye-btn-sm" aria-label="Close prune dialog">
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="space-y-3 px-4 py-3">
          <label className="block space-y-1.5 text-xs text-[var(--color-text-secondary)]">
            <span>Remote</span>
            <select
              value={remote}
              onChange={(event) => setRemote(event.target.value)}
              disabled={busy || remotes.length === 0}
              className="giteye-input w-full"
            >
              {remotes.map((item) => (
                <option key={item.name} value={item.name}>{item.name}</option>
              ))}
            </select>
          </label>

          {remotes.length === 0 && !remotesQuery.isLoading ? (
            <p className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
              Add a Git remote before pruning remote-tracking branches.
            </p>
          ) : null}

          {preview !== null ? (
            <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)]">
              <div className="flex items-center border-b border-[var(--color-border-muted)] px-3 py-2 text-xs">
                <span className="font-medium text-[var(--color-text-primary)]">Dry-run result</span>
                <span className="ml-auto giteye-chip tabular-nums" data-tone={preview.length > 0 ? "warning" : "success"}>
                  {preview.length} stale
                </span>
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-5 text-[var(--color-text-secondary)]">
                {preview.length > 0 ? preview.join("\n") : "No stale remote-tracking branches."}
              </pre>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
              {gitActionErrorMessage(error)}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)]/70 px-4 py-2.5">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant="secondary"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void runPreview()}
            disabled={!remote || busy}
          >
            Preview prune
          </Button>
          <Button
            variant={preview && preview.length > 0 ? "danger" : "primary"}
            icon={<Scissors className="h-3.5 w-3.5" />}
            onClick={() => void prune()}
            disabled={preview === null || busy}
          >
            Prune
          </Button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
