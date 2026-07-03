import { useState } from "react";
import { useAppStore } from "../../stores/app-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { cn } from "../../lib/cn";
import { GitCommitHorizontal, Sparkles } from "lucide-react";

export function CommitBox() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const setSelectedFile = useAppStore((s) => s.setSelectedFile);
  const [message, setMessage] = useState("");
  const [signOff, setSignOff] = useState(false);
  const [noVerify, setNoVerify] = useState(false);
  const [allowEmpty, setAllowEmpty] = useState(false);
  const queryClient = useQueryClient();
  const commitMutation = useMutation(gitMutations.commit(queryClient, activeRepoPath));
  const amendMutation = useMutation(gitMutations.amendCommit(queryClient, activeRepoPath));
  const { data: repoInfo } = useQuery(gitQueries.repositoryInfo(activeRepoPath));
  const { data: snapshot } = useQuery(gitQueries.repositorySnapshot(activeRepoPath));

  const branchName = repoInfo?.currentBranch ?? "current branch";
  const subjectLength = message.split("\n", 1)[0]?.length ?? 0;
  const stagedCount = snapshot?.summary.stagedCount ?? 0;
  const commitBlocked = !message.trim() || (!allowEmpty && stagedCount === 0);

  const handleCommit = () => {
    const commitMessage = message.trim();
    if (!commitMessage || (!allowEmpty && stagedCount === 0)) return;
    commitMutation.mutate({ message: commitMessage, signOff, noVerify, allowEmpty }, {
      onSuccess: () => {
        setMessage("");
        setSelectedFile(null, false);
      },
    });
  };

  const handleAmend = () => {
    if (!repoInfo?.headCommit) return;
    const messageDetail = message.trim()
      ? `replace the HEAD message with:\n\n${message.trim()}`
      : "reuse the current HEAD message";
    if (
      !window.confirm(
        `Amend HEAD on ${branchName}?\n\nThis rewrites the current branch tip and replaces the HEAD commit. It will include ${stagedCount} currently staged file${stagedCount === 1 ? "" : "s"} and ${messageDetail}.`,
      )
    ) {
      return;
    }
    amendMutation.mutate(
      { message: message.trim() || null, signOff, noVerify, allowEmpty },
      {
        onSuccess: () => {
          setMessage("");
          setSelectedFile(null, false);
        },
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleCommit();
    }
  };

  return (
    <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-2.5 shadow-lg shadow-black/10">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)]/15 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/25">
              <GitCommitHorizontal className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-[var(--color-text-primary)]">
                Commit staged changes
              </div>
              <div className="truncate text-[11px] text-[var(--color-text-muted)]">
                Target branch: <span className="text-[var(--color-text-secondary)]">{branchName}</span>
              </div>
            </div>
          </div>
          <span className="rounded-full border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-[10px] tabular-nums text-[var(--color-text-muted)]">
            {subjectLength}/72
          </span>
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Summary (required) — Ctrl+Enter commits to ${branchName}`}
          rows={3}
          className="w-full resize-none rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2.5 py-2 text-[13px] leading-5 text-[var(--color-text-primary)] shadow-inner outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
        />
        <div className="mt-2 grid gap-2 text-[11px] text-[var(--color-text-muted)] sm:grid-cols-3">
          <label className="flex items-center gap-2 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-2 py-1.5">
            <input
              type="checkbox"
              checked={signOff}
              onChange={(event) => setSignOff(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            />
            <span>
              Sign-off <span className="text-[var(--color-text-subtle)]">(-s)</span>
            </span>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-2 py-1.5">
            <input
              type="checkbox"
              checked={noVerify}
              onChange={(event) => setNoVerify(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            />
            <span>
              Skip hooks <span className="text-[var(--color-text-subtle)]">(--no-verify)</span>
            </span>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-2 py-1.5">
            <input
              type="checkbox"
              checked={allowEmpty}
              onChange={(event) => setAllowEmpty(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            />
            <span>
              Allow empty <span className="text-[var(--color-text-subtle)]">(--allow-empty)</span>
            </span>
          </label>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[12px] text-[var(--color-text-muted)]">
            {commitMutation.isPending
              ? "Committing..."
              : amendMutation.isPending
              ? "Amending HEAD..."
              : commitMutation.isError
              ? `Error: ${commitMutation.error}`
              : amendMutation.isError
              ? `Error: ${amendMutation.error}`
              : commitMutation.isSuccess
              ? "Committed!"
              : amendMutation.isSuccess
              ? "HEAD amended!"
              : stagedCount === 0 && !allowEmpty
              ? "Stage files first, or enable Allow empty for marker commits."
              : "Write a concise summary; add details on following lines."}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={handleAmend}
              disabled={!repoInfo?.headCommit || commitMutation.isPending || amendMutation.isPending}
              title={`Amend HEAD with ${stagedCount} staged file${stagedCount === 1 ? "" : "s"}. Leave the message blank to reuse the current HEAD message.`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-[color:rgba(248,81,73,0.45)] px-3 py-1.5 text-[13px] font-semibold text-[var(--color-danger)] shadow-sm transition-colors hover:bg-[color:rgba(248,81,73,0.08)]",
                "disabled:cursor-not-allowed disabled:opacity-40"
              )}
            >
              Amend HEAD
            </button>
            <button
              onClick={handleCommit}
              disabled={commitBlocked || commitMutation.isPending || amendMutation.isPending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold shadow-sm transition-colors",
                "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]",
                "disabled:cursor-not-allowed disabled:opacity-40"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Commit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
