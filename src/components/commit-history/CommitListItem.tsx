import type { CommitSummary } from "../../types/git";
import { useAppStore } from "../../stores/app-store";
import { cn } from "../../lib/cn";
import { formatRelativeTime, truncateHash } from "../../lib/format";
import { GitBranch, GitCommitHorizontal } from "lucide-react";
interface CommitListItemProps {
  commit: CommitSummary;
}

/**
 * Dense commit row with graph-lane stub, hash, message, ref pills, author, and relative time.
 * Selected rows use the `--color-bg-selected` token for clear highlighting.
 */
export function CommitListItem({ commit }: CommitListItemProps) {
  const selectedCommitHash = useAppStore((s) => s.selectedCommitHash);
  const setSelectedCommitHash = useAppStore((s) => s.setSelectedCommitHash);
  const isSelected = selectedCommitHash === commit.hash;

  return (
    <div
      onClick={() => setSelectedCommitHash(commit.hash)}
      role="row"
      aria-selected={isSelected}
      className={cn(
        "grid h-[42px] grid-cols-[34px_64px_minmax(0,1fr)_120px_74px] items-center gap-2 rounded-lg border px-2.5 transition-colors select-none",
        isSelected
          ? "border-[var(--color-accent)]/45 bg-[var(--color-bg-selected)] text-white shadow-md shadow-[var(--color-accent)]/10"
          : "border-transparent hover:border-[var(--color-border-muted)] hover:bg-[var(--color-bg-secondary)]"
      )}
      style={
        isSelected
          ? {
              color: "#ffffff",
              ["--color-text-primary" as string]: "#ffffff",
              ["--color-text-secondary" as string]: "rgba(255,255,255,0.78)",
              ["--color-text-muted" as string]: "rgba(255,255,255,0.58)",
              ["--color-accent" as string]: "rgba(255,255,255,0.92)",
            }
          : undefined
      }
    >
      <span className="relative flex h-full items-center justify-center">
        <span className="absolute bottom-0 top-0 w-px bg-[var(--color-border-muted)]" />
        <span
          className={cn(
            "relative z-[1] flex h-4 w-4 items-center justify-center rounded-full border bg-[var(--color-bg-primary)]",
            commit.refs.length > 0
              ? "border-[var(--color-accent)] text-[var(--color-accent)] shadow-[0_0_0_3px_var(--color-accent)]/10"
              : "border-[var(--color-border)] text-[var(--color-text-muted)]"
          )}
        >
          <GitCommitHorizontal className="h-2.5 w-2.5" />
        </span>
      </span>

      <span className="truncate font-mono text-[11px] text-[var(--color-accent)]">
        {truncateHash(commit.shortHash)}
      </span>

      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[12px] font-medium text-[var(--color-text-primary)]">
          {commit.message}
        </span>
        {commit.refs.length > 0 && (
          <span className="flex min-w-0 shrink-0 items-center gap-1">
            {commit.refs.slice(0, 2).map((ref) => (
              <span
                key={ref}
                className={cn(
                  "inline-flex max-w-[110px] items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                  isSelected
                    ? "border-white/30 bg-white/15 text-white"
                    : "border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                )}
              >
                <GitBranch className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{ref}</span>
              </span>
            ))}
            {commit.refs.length > 2 && (
              <span className="text-[10px] text-[var(--color-text-muted)]">
                +{commit.refs.length - 2}
              </span>
            )}
          </span>
        )}
      </span>

      <span className="truncate text-right text-[11px] text-[var(--color-text-secondary)]">
        {commit.authorName}
      </span>
      <span className="text-right text-[10px] text-[var(--color-text-muted)]">
        {formatRelativeTime(commit.timestamp)}
      </span>
    </div>
  );
}
