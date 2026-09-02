import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  GitBranch,
  RefreshCw,
  Scissors,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  gitActionErrorMessage,
  gitMutations,
  gitQueries,
} from "../../lib/git-data";
import type { LocalBranchPruneCandidate } from "../../types/git";
import { Button, Select } from "../ui";
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
      {open ? (
        <BranchPruneDialog repoPath={repoPath} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function BranchPruneDialog({
  repoPath,
  onClose,
}: {
  repoPath: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const dialog = useAppDialog();
  const remotesQuery = useQuery(gitQueries.remotes(repoPath));
  const previewMutation = useMutation(gitMutations.pruneRemoteDryRun(repoPath));
  const pruneMutation = useMutation(
    gitMutations.pruneRemote(queryClient, repoPath),
  );
  const localPlanMutation = useMutation(
    gitMutations.localBranchPrunePlan(repoPath),
  );
  const localPruneMutation = useMutation(
    gitMutations.pruneLocalBranches(queryClient, repoPath),
  );
  const [remote, setRemote] = useState("");
  const [preview, setPreview] = useState<string[] | null>(null);
  const [localCandidates, setLocalCandidates] = useState<
    LocalBranchPruneCandidate[]
  >([]);
  const [selectedLocal, setSelectedLocal] = useState<Set<string>>(new Set());
  const [forceLocalPrune, setForceLocalPrune] = useState(false);
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
        lines.filter(
          (line) => !/^no stale remote-tracking branches/i.test(line.trim()),
        ),
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
      detail:
        preview.length > 0
          ? preview.join("\n")
          : "No stale refs reported by git remote prune --dry-run.",
      confirmLabel: "Prune stale branches",
      tone: staleCount > 0 ? "warning" : "default",
    });
    if (!confirmed) return;
    pruneMutation.mutate(remote, { onSuccess: onClose });
  };

  const scanLocal = async () => {
    try {
      const candidates = await localPlanMutation.mutateAsync();
      setLocalCandidates(candidates);
      setSelectedLocal(
        new Set(candidates.map((candidate) => candidate.branch)),
      );
      setForceLocalPrune(false);
    } catch (error) {
      await dialog.alert({
        title: "Unable to scan local branches",
        message: gitActionErrorMessage(error),
        tone: "danger",
      });
    }
  };

  const toggleLocal = (branch: string) => {
    setSelectedLocal((current) => {
      const next = new Set(current);
      if (next.has(branch)) next.delete(branch);
      else next.add(branch);
      return next;
    });
  };

  const pruneLocal = async () => {
    const branches = localCandidates
      .map((candidate) => candidate.branch)
      .filter((branch) => selectedLocal.has(branch));
    if (branches.length === 0) return;
    const confirmed = await dialog.confirm({
      title: forceLocalPrune
        ? "Force prune stale local branches?"
        : "Prune stale local branches?",
      message: forceLocalPrune
        ? `Permanently delete ${branches.length} local ${branches.length === 1 ? "branch" : "branches"} with force (-D), including branches that are not fully merged? Unmerged commits may become unreachable.`
        : `Delete ${branches.length} local ${branches.length === 1 ? "branch" : "branches"}? Safe delete (-d) is used; branches that are not fully merged are skipped and reported.`,
      detail: branches.join("\n"),
      confirmLabel: forceLocalPrune
        ? "Force prune local branches"
        : "Prune local branches",
      tone: forceLocalPrune ? "danger" : "warning",
    });
    if (!confirmed) return;
    localPruneMutation.mutate(
      { branches, force: forceLocalPrune },
      {
        onSuccess: (result) => {
          setLocalCandidates((current) =>
            current.filter(
              (candidate) => !result.deleted.includes(candidate.branch),
            ),
          );
          setSelectedLocal(new Set());
          setForceLocalPrune(false);
        },
      },
    );
  };

  const error =
    remotesQuery.error ?? previewMutation.error ?? pruneMutation.error;
  const busy = previewMutation.isPending || pruneMutation.isPending;
  const localBusy = localPlanMutation.isPending || localPruneMutation.isPending;
  const selectedLocalCount = localCandidates.filter((candidate) =>
    selectedLocal.has(candidate.branch),
  ).length;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
      role="presentation"
    >
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
            <h2
              id="branch-prune-title"
              className="text-sm font-semibold text-[var(--color-text-primary)]"
            >
              Prune stale branches
            </h2>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Preview remote-tracking refs whose branches no longer exist on the
              selected remote.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={onClose}
            aria-label="Close prune dialog"
            icon={<X className="h-3.5 w-3.5" />}
          >
            Close prune dialog
          </Button>
        </header>

        <div className="space-y-3 px-4 py-3">
          <label className="block space-y-1.5 text-xs text-[var(--color-text-secondary)]">
            <span>Remote</span>
            <Select
              value={remote}
              onValueChange={(item) => setRemote(item)}
              options={remotes.map((item) => ({
                value: item.name,
                label: item.name,
              }))}
              disabled={busy || remotes.length === 0}
              className="w-full"
              ariaLabel="Remote"
            />
          </label>

          {remotes.length === 0 && !remotesQuery.isLoading ? (
            <p className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
              Add a Git remote before pruning remote-tracking branches.
            </p>
          ) : null}

          {preview !== null ? (
            <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)]">
              <div className="flex items-center border-b border-[var(--color-border-muted)] px-3 py-2 text-xs">
                <span className="font-medium text-[var(--color-text-primary)]">
                  Dry-run result
                </span>
                <span
                  className="ml-auto giteye-chip tabular-nums"
                  data-tone={preview.length > 0 ? "warning" : "success"}
                >
                  {preview.length} stale
                </span>
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-5 text-[var(--color-text-secondary)]">
                {preview.length > 0
                  ? preview.join("\n")
                  : "No stale remote-tracking branches."}
              </pre>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-[var(--color-danger)]">
              {gitActionErrorMessage(error)}
            </p>
          ) : null}

          <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)]">
            <div className="flex items-center gap-2 border-b border-[var(--color-border-muted)] px-3 py-2 text-xs">
              <span className="font-medium text-[var(--color-text-primary)]">
                Stale local branches
              </span>
              <span className="text-[var(--color-text-muted)]">
                merged into HEAD or with a deleted upstream
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon={
                  <RefreshCw
                    className={
                      localPlanMutation.isPending
                        ? "h-3 w-3 animate-spin"
                        : "h-3 w-3"
                    }
                  />
                }
                onClick={() => void scanLocal()}
                disabled={!repoPath || localBusy}
                className="ml-auto"
              >
                {localCandidates.length > 0 ? "Rescan" : "Scan"}
              </Button>
            </div>
            {localPruneMutation.error ? (
              <p className="border-b border-[var(--color-border-muted)] px-3 py-2 text-[11px] text-[var(--color-danger)]">
                {gitActionErrorMessage(localPruneMutation.error)}
              </p>
            ) : null}
            {localCandidates.length > 0 ? (
              <>
                <ul className="max-h-48 overflow-auto">
                  {localCandidates.map((candidate) => (
                    <li key={candidate.branch}>
                      <label className="flex cursor-pointer items-center gap-2 border-b border-[var(--color-border-muted)] px-3 py-1.5 text-xs last:border-b-0 hover:bg-[var(--color-bg-secondary)]">
                        <input
                          type="checkbox"
                          checked={selectedLocal.has(candidate.branch)}
                          onChange={() => toggleLocal(candidate.branch)}
                          disabled={localBusy}
                          className="accent-[var(--color-danger)]"
                        />
                        <span className="min-w-0 flex-1 truncate font-mono text-[var(--color-text-primary)]">
                          {candidate.branch}
                        </span>
                        {candidate.fullyMerged ? (
                          <span
                            className="giteye-chip shrink-0"
                            data-tone="success"
                          >
                            <CheckCircle2 className="h-3 w-3" /> merged
                          </span>
                        ) : null}
                        {candidate.upstreamGone ? (
                          <span
                            className="giteye-chip shrink-0"
                            data-tone="warning"
                          >
                            <TriangleAlert className="h-3 w-3" /> upstream gone
                          </span>
                        ) : null}
                      </label>
                    </li>
                  ))}
                </ul>
                <label className="flex cursor-pointer items-start gap-2 border-t border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2.5 text-xs">
                  <input
                    type="checkbox"
                    checked={forceLocalPrune}
                    onChange={(event) =>
                      setForceLocalPrune(event.target.checked)
                    }
                    disabled={localBusy}
                    className="mt-0.5 accent-[var(--color-danger)]"
                  />
                  <span>
                    <strong className="block font-semibold text-[var(--color-danger)]">
                      Force prune unmerged branches
                    </strong>
                    <span className="mt-0.5 block text-[11px] leading-4 text-[var(--color-text-secondary)]">
                      Uses <code>git branch -D</code>. Selected branches are
                      deleted even when commits have not been merged.
                    </span>
                  </span>
                </label>
                {localPruneMutation.data &&
                localPruneMutation.data.failed.length > 0 ? (
                  <p className="border-t border-[var(--color-border-muted)] px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
                    Skipped:{" "}
                    {localPruneMutation.data.failed
                      .map((failure) => `${failure.branch} — ${failure.reason}`)
                      .join("; ")}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="px-3 py-3 text-center text-[11px] text-[var(--color-text-muted)]">
                {localPlanMutation.isPending
                  ? "Scanning local branches…"
                  : localCandidates.length === 0 && localPlanMutation.data
                    ? "No stale local branches found."
                    : "Run a scan to find local branches that are fully merged or whose upstream was deleted."}
              </p>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)]/70 px-4 py-2.5">
          {selectedLocalCount > 0 ? (
            <Button
              variant="danger"
              icon={<Scissors className="h-3.5 w-3.5" />}
              onClick={() => void pruneLocal()}
              disabled={localBusy}
              className="mr-auto"
            >
              {forceLocalPrune ? "Force prune" : "Prune"} {selectedLocalCount}{" "}
              local {selectedLocalCount === 1 ? "branch" : "branches"}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
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
