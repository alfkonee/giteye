import { useState } from "react";
import { useAppStore } from "../../stores/app-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { gitApi } from "../../lib/tauri-api";
import { Sparkles, GitCommitHorizontal } from "lucide-react";
import { Button, Textarea } from "../ui";
import { cn } from "../../lib/cn";

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
  const { data: aiConfig } = useQuery(gitQueries.aiConfig());

  const aiSuggestionMutation = useMutation({
    mutationFn: async () => {
      if (!activeRepoPath) throw new Error("Open a repository before generating a commit message.");
      const stagedFiles = snapshot?.files.filter((f) => f.staged) ?? [];
      const diffs = await Promise.all(stagedFiles.map(async (file) => {
        const diff = await gitApi.getFileDiff(activeRepoPath, file.path, true);
        return {
          filePath: file.path,
          status: file.status,
          diffText: diff.diffText || `${file.status} ${file.path}${file.oldPath ? ` (from ${file.oldPath})` : ""}`,
        };
      }));
      return gitApi.suggestCommitMessage(diffs);
    },
    onSuccess: (suggestion) => {
      setMessage(suggestion);
    },
  });

  const branchName = repoInfo?.currentBranch ?? "current branch";
  const subjectLength = message.split("\n", 1)[0]?.length ?? 0;
  const stagedCount = snapshot?.summary.stagedCount ?? 0;
  const commitBlocked = !message.trim() || (!allowEmpty && stagedCount === 0);
  const aiProviderLabel = aiConfig?.providers.find((provider) => provider.id === aiConfig.provider)?.label ?? "OpenAI";
  const aiStatus = `AI: ${aiProviderLabel} · ${aiConfig?.model ?? "gpt-4o-mini"}${aiConfig?.apiKeyConfigured === false ? " · key missing" : ""}`;
  const aiSuggestionError = aiSuggestionMutation.error?.message ?? null;

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

  const statusMessage = commitMutation.isPending
    ? "Committing…"
    : amendMutation.isPending
      ? "Amending HEAD…"
      : aiSuggestionError
        ? `AI error: ${aiSuggestionError}`
        : commitMutation.isError
          ? `Error: ${commitMutation.error}`
          : amendMutation.isError
            ? `Error: ${amendMutation.error}`
            : commitMutation.isSuccess
              ? "Committed."
              : amendMutation.isSuccess
                ? "HEAD amended."
                : stagedCount === 0 && !allowEmpty
                  ? "Stage files first, or enable Allow empty for marker commits."
                  : "Write a concise summary; add details on following lines.";
  const hasError = commitMutation.isError || amendMutation.isError || Boolean(aiSuggestionError);

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)]">
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-1.5">
        <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
        <span className="text-[12px] font-semibold text-[var(--color-text-primary)]">Commit staged changes</span>
        <span className="min-w-0 truncate text-[11px] text-[var(--color-text-muted)]">
          → <span className="text-[var(--color-text-secondary)]">{branchName}</span>
        </span>
        <span className="giteye-chip ml-auto shrink-0 tabular-nums" data-tone={stagedCount > 0 ? "accent" : undefined}>
          {stagedCount} staged
        </span>
        <span className="giteye-chip shrink-0 tabular-nums" data-tone={subjectLength > 72 ? "warning" : undefined}>
          {subjectLength}/72
        </span>
      </header>

      <div className="min-h-0 flex-1 p-2">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Summary (required) — Ctrl+Enter commits to ${branchName}`}
          className="h-full min-h-[96px] w-full resize-none text-[12.5px] leading-5"
        />
      </div>

      <div className="shrink-0 border-t border-[var(--color-border-muted)] px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-text-muted)]">
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={signOff}
              onChange={(event) => setSignOff(event.target.checked)}
              className="h-3 w-3 accent-[var(--color-accent)]"
            />
            <span>Sign-off <span className="text-[var(--color-text-subtle)]">(-s)</span></span>
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={noVerify}
              onChange={(event) => setNoVerify(event.target.checked)}
              className="h-3 w-3 accent-[var(--color-accent)]"
            />
            <span>Skip hooks <span className="text-[var(--color-text-subtle)]">(--no-verify)</span></span>
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={allowEmpty}
              onChange={(event) => setAllowEmpty(event.target.checked)}
              className="h-3 w-3 accent-[var(--color-accent)]"
            />
            <span>Allow empty <span className="text-[var(--color-text-subtle)]">(--allow-empty)</span></span>
          </label>
          <span className="ml-auto truncate text-[10.5px]" title={aiStatus}>
            {aiStatus}
          </span>
        </div>

        <p
          className={cn(
            "mt-1 truncate text-[11px]",
            hasError ? "text-[var(--color-danger)]" : "text-[var(--color-text-muted)]",
          )}
          title={statusMessage}
        >
          {statusMessage}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            icon={<Sparkles className="h-3.5 w-3.5" />}
            onClick={() => aiSuggestionMutation.mutate()}
            disabled={stagedCount === 0 || aiSuggestionMutation.isPending || commitMutation.isPending || amendMutation.isPending}
            title={stagedCount === 0 ? "Stage files first to generate a suggestion" : `Generate a commit message using ${aiProviderLabel}${aiConfig?.apiKeyConfigured ? "" : " (API key missing)"}`}
          >
            {aiSuggestionMutation.isPending ? "Thinking…" : "Suggest"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleAmend}
            disabled={!repoInfo?.headCommit || commitMutation.isPending || amendMutation.isPending}
            title={`Amend HEAD with ${stagedCount} staged file${stagedCount === 1 ? "" : "s"}. Leave the message blank to reuse the current HEAD message.`}
          >
            Amend HEAD
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<GitCommitHorizontal className="h-3.5 w-3.5" />}
            onClick={handleCommit}
            disabled={commitBlocked || commitMutation.isPending || amendMutation.isPending}
          >
            Commit
          </Button>
        </div>
      </div>
    </section>
  );
}
