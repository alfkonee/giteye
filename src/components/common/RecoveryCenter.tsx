import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, History, Loader2, RotateCcw, X } from "lucide-react";
import { useAppStore } from "../../stores/app-store";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { ErrorCallout } from "./ErrorCallout";

/** A stable, human-readable recovery branch name from a short hash. */
function recoveryBranchName(hash: string) {
  return `recover-${(hash || "commit").slice(0, 8)}`;
}

export function RecoveryCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const activeRepoPath = useAppStore((state) => state.activeRepoPath);
  const queryClient = useQueryClient();

  const enabled = open && Boolean(activeRepoPath);
  const reflog = useQuery({
    ...gitQueries.reflog(activeRepoPath, 50),
    enabled,
  });
  const lost = useQuery({
    ...gitQueries.lostCommits(activeRepoPath, 50),
    enabled,
  });
  const checkout = useMutation(gitMutations.checkoutReflogEntry(queryClient, activeRepoPath));
  const createBranch = useMutation(gitMutations.createBranchFromReflogEntry(queryClient, activeRepoPath));

  if (!open) return null;

  const reflogEntries = reflog.data ?? [];
  const lostCommits = lost.data ?? [];
  const busy = checkout.isPending || createBranch.isPending;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-6 pt-[8vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recovery center"
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[var(--color-accent)]" />
            <h2 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Recovery center</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close recovery center"
            className="rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!activeRepoPath ? (
          <div className="px-4 py-8 text-center text-[12px] text-[var(--color-text-muted)]">
            Open a repository to browse its reflog and recover lost commits.
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <section className="border-b border-[var(--color-border)]">
              <header className="sticky top-0 flex items-center justify-between border-b border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-4 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                  Reflog — undo recent HEAD moves
                </span>
              </header>
              {reflog.isLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-6 text-[12px] text-[var(--color-text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading reflog…
                </div>
              ) : reflog.error ? (
                <ErrorCallout message={`Failed to load reflog: ${String(reflog.error)}`} />
              ) : reflogEntries.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12px] text-[var(--color-text-muted)]">Reflog is empty.</p>
              ) : (
                <ul className="divide-y divide-[var(--color-border-muted)]">
                  {reflogEntries.map((entry) => (
                    <li key={entry.selector} className="flex items-center gap-3 px-4 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] text-[var(--color-text-primary)]">{entry.message}</p>
                        <p className="mt-0.5 font-mono text-[10.5px] text-[var(--color-text-muted)]">
                          {entry.selector} · {entry.shortHash || entry.hash.slice(0, 8)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => checkout.mutate({ selector: entry.selector })}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-muted)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Checkout
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          createBranch.mutate({
                            selector: entry.selector,
                            branchName: recoveryBranchName(entry.shortHash || entry.hash),
                            checkout: false,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-muted)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                      >
                        <GitBranch className="h-3.5 w-3.5" />
                        Branch
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <header className="sticky top-0 flex items-center justify-between border-b border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-4 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                  Lost commits — dangling objects found by fsck
                </span>
              </header>
              {lost.isLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-6 text-[12px] text-[var(--color-text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Scanning for lost commits…
                </div>
              ) : lost.error ? (
                <ErrorCallout message={`Failed to scan lost commits: ${String(lost.error)}`} />
              ) : lostCommits.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12px] text-[var(--color-text-muted)]">No dangling commits found.</p>
              ) : (
                <ul className="divide-y divide-[var(--color-border-muted)]">
                  {lostCommits.map((commit) => (
                    <li key={`${commit.source}-${commit.hash}`} className="flex items-center gap-3 px-4 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] text-[var(--color-text-primary)]">{commit.message}</p>
                        <p className="mt-0.5 font-mono text-[10.5px] text-[var(--color-text-muted)]">
                          {commit.shortHash} · {commit.source}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          createBranch.mutate({
                            selector: commit.hash,
                            branchName: recoveryBranchName(commit.shortHash),
                            checkout: false,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-muted)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                      >
                        <GitBranch className="h-3.5 w-3.5" />
                        Branch
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}