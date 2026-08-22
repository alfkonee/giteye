import { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, GitPullRequest, Sparkles, X } from "lucide-react";
import { gitActionErrorMessage, gitMutations, gitQueries } from "../../lib/git-data";
import { gitApi } from "../../lib/tauri-api";
import type { Branch } from "../../types/git";
import { Button } from "../ui";

export function CreatePullRequestDialog({
  branch,
  repoPath,
  onClose,
}: {
  branch: Branch | null;
  repoPath: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: aiConfig } = useQuery(gitQueries.aiConfig());
  const [base, setBase] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);

  const suggestMutation = useMutation({
    mutationFn: async () => {
      if (!branch || !repoPath) throw new Error("No branch selected.");
      return gitApi.suggestPullRequest(
        repoPath,
        branch.shortName,
        base.trim() || null,
      );
    },
    onSuccess: (draftText) => {
      setTitle(draftText.title);
      setBody(draftText.body);
    },
  });

  const createMutation = useMutation(gitMutations.createPullRequest(queryClient, repoPath));

  if (!branch || branch.isRemote) return null;

  const busy = suggestMutation.isPending || createMutation.isPending;
  const error = createMutation.error ?? suggestMutation.error;
  const aiProviderLabel =
    aiConfig?.providers.find((provider) => provider.id === aiConfig.provider)?.label ?? "OpenAI";

  const handleCreate = () => {
    if (!title.trim() || !repoPath) return;
    createMutation.mutate(
      {
        head: branch.shortName,
        base: base.trim() || null,
        title: title.trim(),
        body: body.trim() ? body : null,
        draft,
      },
      { onSuccess: onClose },
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-pr-title"
        className="w-[calc(100vw-2rem)] max-w-xl overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-elevated)]"
      >
        <header className="flex items-start gap-3 border-b border-[var(--color-border-muted)] px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-accent)]/35 bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
            <GitPullRequest className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="create-pr-title" className="text-sm font-semibold text-[var(--color-text-primary)]">
              Create pull request
            </h2>
            <p className="mt-1 truncate font-mono text-xs text-[var(--color-text-secondary)]">{branch.shortName}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            icon={<X className="h-3.5 w-3.5" />}
            iconOnly
            type="button"
            onClick={onClose}
            aria-label="Close create pull request dialog"
          />
        </header>

        <div className="space-y-3 px-4 py-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                Head branch
              </span>
              <div className="mt-1 flex items-center gap-1.5 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-text-primary)]">
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
                <span className="truncate">{branch.shortName}</span>
              </div>
            </label>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                Base branch
              </span>
              <input
                value={base}
                onChange={(event) => setBase(event.target.value)}
                placeholder="Default branch"
                className="giteye-input mt-1 h-8 w-full font-mono"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
              Title
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Summarize the change"
              className="giteye-input mt-1 h-8 w-full"
            />
          </label>

          <label className="block">
            <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
              Description
              <Button
                variant="ghost"
                size="sm"
                icon={<Sparkles className="h-3 w-3" />}
                type="button"
                onClick={() => suggestMutation.mutate()}
                disabled={busy}
                title={`Generate a title and description using ${aiProviderLabel}${aiConfig?.apiKeyConfigured ? "" : " (API key missing)"}`}
              >
                {suggestMutation.isPending ? "Thinking…" : "Generate with AI"}
              </Button>
            </span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={6}
              placeholder="What changed and why"
              className="giteye-input mt-1 w-full resize-y font-mono text-xs leading-5"
            />
          </label>

          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2.5 text-xs">
            <input
              type="checkbox"
              checked={draft}
              disabled={busy}
              onChange={(event) => setDraft(event.target.checked)}
              className="mt-0.5 accent-[var(--color-accent)]"
            />
            <div>
              <p className="font-medium text-[var(--color-text-primary)]">Create as draft</p>
              <p className="mt-0.5 text-[var(--color-text-muted)]">Open the pull request without notifying reviewers.</p>
            </div>
          </label>

          {error ? (
            <p className="rounded-lg border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-[var(--color-danger)]">
              {gitActionErrorMessage(error)}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)]/70 px-4 py-2.5">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<GitPullRequest className="h-3.5 w-3.5" />}
            onClick={handleCreate}
            disabled={busy || !title.trim()}
          >
            {createMutation.isPending ? "Creating…" : "Create pull request"}
          </Button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
