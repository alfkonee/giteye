import { useState } from "react";
import { useAppStore } from "../../stores/app-store";
import { useCommit } from "../../hooks/useGitStatus";
import { useRepositoryInfo } from "../../hooks/useRepository";
import { cn } from "../../lib/cn";
import { GitCommitHorizontal, Sparkles } from "lucide-react";

export function CommitBox() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const [message, setMessage] = useState("");
  const commitMutation = useCommit(activeRepoPath);
  const { data: repoInfo } = useRepositoryInfo(activeRepoPath);

  const branchName = repoInfo?.currentBranch ?? "current branch";
  const subjectLength = message.split("\n", 1)[0]?.length ?? 0;

  const handleCommit = () => {
    if (!message.trim()) return;
    commitMutation.mutate(message.trim(), {
      onSuccess: () => setMessage(""),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleCommit();
    }
  };

  return (
    <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3 shadow-lg shadow-black/10">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)]/15 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/25">
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
          className="w-full resize-none rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2.5 text-[13px] leading-5 text-[var(--color-text-primary)] shadow-inner outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-[12px] text-[var(--color-text-muted)]">
            {commitMutation.isPending
              ? "Committing..."
              : commitMutation.isError
              ? `Error: ${commitMutation.error}`
              : commitMutation.isSuccess
              ? "Committed!"
              : "Write a concise summary; add details on following lines."}
          </span>
          <button
            onClick={handleCommit}
            disabled={!message.trim() || commitMutation.isPending}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold shadow-sm transition-colors",
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
  );
}
