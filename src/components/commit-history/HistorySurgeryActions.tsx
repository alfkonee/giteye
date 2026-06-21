import type { MouseEvent, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { useAppStore } from "../../stores/app-store";
import { cn } from "../../lib/cn";
import { formatAmendPreview } from "../../lib/git-preview";
import type { CommitSummary, ReflogEntry, ResetMode, ResetPreview } from "../../types/git";

type CommitActionTarget = Pick<CommitSummary, "hash" | "message"> & {
  shortHash?: string | null;
  body?: string | null;
};

interface CommitActionStripProps {
  target: CommitActionTarget;
  isHeadCommit?: boolean;
  compact?: boolean;
}

interface ReflogRecoveryPanelProps {
  open: boolean;
}

function shortHash(target: CommitActionTarget) {
  return target.shortHash || target.hash.slice(0, 8);
}

function fullCommitMessage(target: CommitActionTarget) {
  return [target.message, target.body].filter(Boolean).join("\n\n");
}

function errorMessage(error: unknown) {
  if (!error) return null;
  return error instanceof Error ? error.message : String(error);
}

function isResetMode(value: string): value is ResetMode {
  return value === "soft" || value === "mixed" || value === "hard";
}

function resetModeEffect(mode: ResetMode) {
  switch (mode) {
    case "soft":
      return "Moves HEAD only. Index and working tree contents stay as-is.";
    case "mixed":
      return "Moves HEAD and resets the index. Working tree file contents stay as-is.";
    case "hard":
      return "Moves HEAD, resets the index, and overwrites tracked working tree files.";
  }
}

function formatResetPreview(preview: ResetPreview | string) {
  if (typeof preview === "string") return preview;

  const lines: string[] = [];
  const target = preview.targetCommit;
  if (preview.summary) lines.push(preview.summary);
  if (target) {
    lines.push(`Target: ${target.shortHash || target.hash.slice(0, 8)} ${target.message}`);
  } else if (preview.targetHash || preview.targetSubject) {
    lines.push(`Target: ${preview.targetHash?.slice(0, 8) ?? "commit"} ${preview.targetSubject ?? ""}`.trim());
  }
  if (preview.currentHead) lines.push(`Current HEAD: ${preview.currentHead.slice(0, 8)}`);

  const removed = preview.commitsToRemove ?? [];
  if (removed.length > 0) {
    lines.push("", `Commits no longer on this branch (${removed.length}):`);
    for (const commit of removed.slice(0, 8)) {
      lines.push(`• ${commit.shortHash || commit.hash.slice(0, 8)} ${commit.message}`);
    }
    if (removed.length > 8) lines.push(`• …and ${removed.length - 8} more`);
  }

  const changedFiles = preview.changedFiles ?? [];
  const legacyFiles = preview.filesChanged ?? [];
  if (changedFiles.length > 0 || legacyFiles.length > 0) {
    lines.push("", `Files changed by the reset target (${changedFiles.length || legacyFiles.length}):`);
    for (const file of changedFiles.slice(0, 10)) lines.push(`• ${file.status} ${file.path}`);
    for (const file of legacyFiles.slice(0, 10)) lines.push(`• ${file}`);
    const overflow = Math.max(changedFiles.length, legacyFiles.length) - 10;
    if (overflow > 0) lines.push(`• …and ${overflow} more`);
  }

  if (preview.warnings?.length) {
    lines.push("", "Warnings:");
    for (const warning of preview.warnings) lines.push(`• ${warning}`);
  }

  return lines.join("\n") || "No reset preview details were returned.";
}

function defaultBranchName(prefix: string, hash: string) {
  return `${prefix}-${hash.slice(0, 8)}`;
}

function promptBranchName(defaultName: string, sourceLabel: string) {
  const name = window.prompt(`New branch name from ${sourceLabel}`, defaultName)?.trim();
  return name || null;
}

function useHistorySurgeryActions() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const queryClient = useQueryClient();
  const { data: repoInfo } = useQuery(gitQueries.repositoryInfo(activeRepoPath));
  const createBranchMutation = useMutation(gitMutations.createBranch(queryClient, activeRepoPath));
  const cherryPickMutation = useMutation(gitMutations.cherryPickCommit(queryClient, activeRepoPath));
  const revertMutation = useMutation(gitMutations.revertCommit(queryClient, activeRepoPath));
  const previewResetMutation = useMutation(gitMutations.previewResetToCommit(queryClient, activeRepoPath));
  const resetMutation = useMutation(gitMutations.resetToCommit(queryClient, activeRepoPath));
  const previewAmendMutation = useMutation(gitMutations.previewAmend(queryClient, activeRepoPath));
  const amendMutation = useMutation(gitMutations.amendCommit(queryClient, activeRepoPath));
  const checkoutReflogMutation = useMutation(gitMutations.checkoutReflogEntry(queryClient, activeRepoPath));
  const branchFromReflogMutation = useMutation(gitMutations.createBranchFromReflogEntry(queryClient, activeRepoPath));

  const isBusy =
    createBranchMutation.isPending ||
    cherryPickMutation.isPending ||
    revertMutation.isPending ||
    previewResetMutation.isPending ||
    resetMutation.isPending ||
    previewAmendMutation.isPending ||
    amendMutation.isPending ||
    checkoutReflogMutation.isPending ||
    branchFromReflogMutation.isPending;
  const error =
    createBranchMutation.error ??
    cherryPickMutation.error ??
    revertMutation.error ??
    previewResetMutation.error ??
    resetMutation.error ??
    previewAmendMutation.error ??
    amendMutation.error ??
    checkoutReflogMutation.error ??
    branchFromReflogMutation.error;

  const cherryPick = (target: CommitActionTarget) => {
    if (!activeRepoPath) return;
    if (
      !window.confirm(
        `Cherry-pick ${shortHash(target)} onto ${repoInfo?.currentBranch ?? "the current branch"}?\n\nThis applies the commit as a new commit. Your working tree must be clean, and Git may stop for conflict resolution.\n\nRecovery if conflicts stop the operation: resolve and continue from the resolver/working tree, or abort the partial cherry-pick from Git if you do not want it.`,
      )
    ) {
      return;
    }
    cherryPickMutation.mutate({ commitHash: target.hash });
  };

  const revert = (target: CommitActionTarget) => {
    if (!activeRepoPath) return;
    if (
      !window.confirm(
        `Revert ${shortHash(target)} on ${repoInfo?.currentBranch ?? "the current branch"}?\n\nThis creates a new commit that reverses that commit. Your working tree must be clean. It does not rewrite existing history, but conflicts may need resolution.\n\nRecovery if conflicts stop the operation: resolve and continue from the resolver/working tree, or abort the partial revert from Git if you do not want it.`,
      )
    ) {
      return;
    }
    revertMutation.mutate({ commitHash: target.hash });
  };

  const createBranchFromCommit = (target: CommitActionTarget) => {
    if (!activeRepoPath) return;
    const branchName = promptBranchName(defaultBranchName("branch", target.hash), shortHash(target));
    if (!branchName) return;
    const checkout = window.confirm(`Check out "${branchName}" after creating it from ${shortHash(target)}?`);
    createBranchMutation.mutate({ name: branchName, checkout, startPoint: target.hash });
  };

  const resetToCommit = async (target: CommitActionTarget, mode: ResetMode) => {
    if (!activeRepoPath) return;

    let previewText: string;
    try {
      previewText = formatResetPreview(
        await previewResetMutation.mutateAsync({ commitHash: target.hash }),
      );
    } catch (error) {
      window.alert(`Unable to preview reset to ${shortHash(target)}: ${errorMessage(error)}`);
      return;
    }

    const hardWarning =
      mode === "hard"
        ? "\n\nHARD RESET WILL DISCARD tracked working tree and index changes that differ from the target commit."
        : "";
    if (
      !window.confirm(
        `Reset ${repoInfo?.currentBranch ?? "the current branch"} to ${shortHash(target)} using --${mode}?\n\n${resetModeEffect(mode)}${hardWarning}\n\nPreview:\n${previewText}\n\nThis rewrites the current branch tip. Recovery: use the reflog/ORIG_HEAD to create a recovery branch or reset back if this is wrong.`,
      )
    ) {
      return;
    }

    resetMutation.mutate({
      commitHash: target.hash,
      mode,
      confirmDiscardChanges: mode === "hard",
    });
  };

  const promptReset = (target: CommitActionTarget) => {
    const mode = window.prompt("Reset mode: soft, mixed, or hard", "mixed")?.trim().toLowerCase();
    if (!mode) return;
    if (!isResetMode(mode)) {
      window.alert("Reset mode must be soft, mixed, or hard.");
      return;
    }
    void resetToCommit(target, mode);
  };

  const amendHead = async (target: CommitActionTarget, isHeadCommit: boolean) => {
    if (!activeRepoPath) return;
    if (!isHeadCommit) {
      window.alert("Only HEAD can be amended. Select the current HEAD commit or create a branch/reset first.");
      return;
    }
    const message = window.prompt("New amended commit message", fullCommitMessage(target));
    if (message === null) return;
    const request = { message: message.trim() || null };
    let previewText: string;
    try {
      previewText = formatAmendPreview(await previewAmendMutation.mutateAsync(request));
    } catch (error) {
      window.alert(`Unable to preview amend for HEAD (${shortHash(target)}): ${errorMessage(error)}`);
      return;
    }
    if (
      !window.confirm(
        `Amend HEAD (${shortHash(target)})?\n\nThis rewrites the current branch tip and replaces the HEAD commit with the currently staged changes.\n\nPreview:\n${previewText}`,
      )
    ) {
      return;
    }
    amendMutation.mutate(request);
  };

  const checkoutReflogEntry = (entry: ReflogEntry) => {
    if (!activeRepoPath) return;
    if (
      !window.confirm(
        `Check out reflog entry ${entry.selector} (${entry.shortHash || entry.hash.slice(0, 8)})?\n\nThis moves the worktree to that recorded HEAD state and may detach HEAD. Your working tree must be clean.`,
      )
    ) {
      return;
    }
    checkoutReflogMutation.mutate({ selector: entry.selector });
  };

  const createBranchFromReflog = (entry: ReflogEntry) => {
    if (!activeRepoPath) return;
    const label = `${entry.selector} (${entry.shortHash || entry.hash.slice(0, 8)})`;
    const branchName = promptBranchName(defaultBranchName("recover", entry.hash), label);
    if (!branchName) return;
    const checkout = window.confirm(`Check out "${branchName}" after creating it from ${entry.selector}?`);
    branchFromReflogMutation.mutate({ selector: entry.selector, branchName, checkout });
  };

  const isHead = (target: CommitActionTarget) => repoInfo?.headCommit === target.hash;

  return {
    isBusy,
    error,
    isHead,
    cherryPick,
    revert,
    createBranchFromCommit,
    resetToCommit,
    promptReset,
    amendHead,
    checkoutReflogEntry,
    createBranchFromReflog,
  };
}

function ActionButton({
  children,
  disabled,
  onClick,
  tone = "default",
  title,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  tone?: "default" | "danger" | "primary";
  title?: string;
}) {
  const toneClass =
    tone === "primary"
      ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white hover:opacity-90"
      : tone === "danger"
        ? "border-[color:rgba(248,81,73,0.45)] text-[var(--color-danger)] hover:bg-[color:rgba(248,81,73,0.08)]"
        : "border-[var(--color-border-muted)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]";

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onClick();
  };

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        "inline-flex items-center justify-center rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        toneClass,
      )}
    >
      {children}
    </button>
  );
}

export function CommitActionStrip({ target, isHeadCommit, compact = false }: CommitActionStripProps) {
  const actions = useHistorySurgeryActions();
  const head = isHeadCommit ?? actions.isHead(target);

  if (compact) {
    return (
      <div className="flex items-center justify-end gap-1">
        <ActionButton disabled={actions.isBusy} onClick={() => actions.cherryPick(target)} title="Cherry-pick this commit onto the current branch">
          Pick
        </ActionButton>
        <ActionButton disabled={actions.isBusy} onClick={() => actions.revert(target)} title="Create a revert commit">
          Revert
        </ActionButton>
        <ActionButton disabled={actions.isBusy} onClick={() => actions.createBranchFromCommit(target)} title="Create a branch from this commit">
          Branch
        </ActionButton>
        <ActionButton disabled={actions.isBusy} onClick={() => actions.promptReset(target)} tone="danger" title="Reset current branch to this commit">
          Reset
        </ActionButton>
        {head ? (
          <ActionButton disabled={actions.isBusy} onClick={() => actions.amendHead(target, head)} tone="primary" title="Amend the current HEAD commit">
            Amend
          </ActionButton>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
          History surgery
        </span>
        <ActionButton disabled={actions.isBusy} onClick={() => actions.cherryPick(target)}>
          Cherry-pick
        </ActionButton>
        <ActionButton disabled={actions.isBusy} onClick={() => actions.revert(target)}>
          Revert
        </ActionButton>
        <ActionButton disabled={actions.isBusy} onClick={() => actions.createBranchFromCommit(target)}>
          Branch from commit
        </ActionButton>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-[11px] text-[var(--color-text-muted)]">Reset current branch to this commit:</span>
        <ActionButton disabled={actions.isBusy} onClick={() => void actions.resetToCommit(target, "soft")} tone="danger" title={resetModeEffect("soft")}>
          Soft
        </ActionButton>
        <ActionButton disabled={actions.isBusy} onClick={() => void actions.resetToCommit(target, "mixed")} tone="danger" title={resetModeEffect("mixed")}>
          Mixed
        </ActionButton>
        <ActionButton disabled={actions.isBusy} onClick={() => void actions.resetToCommit(target, "hard")} tone="danger" title={resetModeEffect("hard")}>
          Hard
        </ActionButton>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-[11px] text-[var(--color-text-muted)]">
          {head ? "HEAD can be amended with staged changes." : "Only the current HEAD commit can be amended."}
        </span>
        <ActionButton disabled={actions.isBusy || !head} onClick={() => actions.amendHead(target, head)} tone="primary">
          Amend HEAD
        </ActionButton>
      </div>
      {actions.error ? <p className="text-[11px] text-[var(--color-danger)]">{errorMessage(actions.error)}</p> : null}
    </div>
  );
}

function formatReflogTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function ReflogRecoveryPanel({ open }: ReflogRecoveryPanelProps) {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const actions = useHistorySurgeryActions();
  const reflogQuery = useQuery(gitQueries.reflog(activeRepoPath, 30, open));
  const entries = reflogQuery.data ?? [];

  if (!open) return null;

  return (
    <div className="border-b border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[12px] font-semibold text-[var(--color-text-primary)]">Reflog recovery</h3>
          <p className="text-[11px] text-[var(--color-text-muted)]">Create a branch from a previous HEAD or check it out after confirming.</p>
        </div>
        {reflogQuery.isFetching ? <span className="text-[11px] text-[var(--color-text-muted)]">Loading…</span> : null}
      </div>
      {reflogQuery.error ? (
        <p className="rounded-md border border-[color:rgba(248,81,73,0.45)] bg-[color:rgba(248,81,73,0.08)] px-2 py-1.5 text-[11px] text-[var(--color-danger)]">
          Failed to load reflog: {errorMessage(reflogQuery.error)}
        </p>
      ) : entries.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--color-border-muted)] px-2 py-3 text-center text-[11px] text-[var(--color-text-muted)]">
          No reflog entries reported.
        </p>
      ) : (
        <div className="max-h-56 overflow-auto rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/65">
          {entries.map((entry) => (
            <div key={`${entry.selector}-${entry.hash}`} className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-2 border-b border-[var(--color-border-muted)] px-2 py-1.5 text-[11px] last:border-b-0">
              <span className="font-mono text-[var(--color-accent)]">{entry.selector}</span>
              <div className="min-w-0">
                <div className="truncate text-[var(--color-text-primary)]">{entry.message}</div>
                <div className="truncate text-[10px] text-[var(--color-text-muted)]">
                  {(entry.shortHash || entry.hash.slice(0, 8))} · {entry.authorName ?? "unknown"} · {formatReflogTime(entry.timestamp)}
                </div>
              </div>
              <div className="flex gap-1">
                <ActionButton disabled={actions.isBusy} onClick={() => actions.createBranchFromReflog(entry)}>
                  Branch
                </ActionButton>
                <ActionButton disabled={actions.isBusy} onClick={() => actions.checkoutReflogEntry(entry)} tone="danger">
                  Checkout
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
