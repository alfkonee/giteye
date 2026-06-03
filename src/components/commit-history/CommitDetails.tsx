import type { CommitDetails as CommitDetailsType } from "../../types/git";
import { truncateHash } from "../../lib/format";
import { Calendar, User, ChevronRight, Hash, MessageSquare, Files, GitCommitHorizontal } from "lucide-react";

interface CommitDetailsProps {
  commit: CommitDetailsType;
}

export function CommitDetails({ commit }: CommitDetailsProps) {
  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-primary)]">
      <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)]/15 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/25">
            <GitCommitHorizontal className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold leading-snug text-[var(--color-text-primary)]">
              {commit.message}
            </h3>
            <div className="mt-3 grid gap-2 text-[12px] text-[var(--color-text-secondary)]">
              <div className="flex min-w-0 items-center gap-2">
                <User className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
                <span className="font-medium">{commit.authorName}</span>
                <span className="truncate text-[var(--color-text-muted)]">
                  &lt;{commit.authorEmail}&gt;
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                <span>{new Date(commit.timestamp).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-b border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/55 px-4 py-3 text-[12px]">
        <div className="flex min-w-0 items-center gap-2">
          <Hash className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
          <span className="text-[var(--color-text-muted)]">commit</span>
          <span className="truncate font-mono text-[var(--color-accent)]">{commit.hash}</span>
        </div>
        {commit.parents.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[var(--color-text-muted)]">
              {commit.parents.length > 1 ? "parents" : "parent"}
            </span>
            {commit.parents.map((p, i) => (
              <code
                key={i}
                className="rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-secondary)]"
              >
                {truncateHash(p, 8)}
              </code>
            ))}
          </div>
        )}
      </div>

      {commit.body && (
        <div className="shrink-0 border-b border-[var(--color-border-muted)] px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            <MessageSquare className="h-3 w-3" />
            Description
          </div>
          <pre className="whitespace-pre-wrap rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/50 p-3 font-sans text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            {commit.body}
          </pre>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            <Files className="h-3.5 w-3.5" />
            Changed Files
            <span className="ml-auto inline-flex h-4 min-w-[18px] items-center justify-center rounded-full border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-1 text-[9px] tabular-nums text-[var(--color-text-muted)]">
              {commit.changedFiles.length}
            </span>
          </div>
          {commit.changedFiles.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--color-border-muted)] py-5 text-center text-[12px] italic text-[var(--color-text-muted)]">
              No files changed
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/45">
              {commit.changedFiles.map((file, index) => (
                <div
                  key={index}
                  className="group flex cursor-pointer items-center gap-2 border-b border-[var(--color-border-muted)]/70 px-3 py-2 text-[12px] text-[var(--color-text-primary)] transition-colors last:border-b-0 hover:bg-[var(--color-bg-hover)]"
                >
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-muted)] transition-colors group-hover:text-[var(--color-accent)]" />
                  <span className="truncate font-mono text-[var(--color-text-secondary)]">
                    {file}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
