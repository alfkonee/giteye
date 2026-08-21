import type { BlameLine, FileHistoryEntry } from "../../types/git";

function formatTime(value: string | null | undefined) {
  if (!value) return "unknown time";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/**
 * Line-oriented blame view. Renders the commit that last touched each line
 * with the line content, mirroring the archaeology blame results.
 */
export function BlameTable({ lines }: { lines: BlameLine[] }) {
  if (lines.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-[12px] text-[var(--color-text-muted)]">
        No blame information for this file.
      </p>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
      {lines.map((line, index) => (
        <div
          key={`${line.hash}-${line.lineNumber}-${index}`}
          className="grid grid-cols-[84px_150px_minmax(0,1fr)] gap-3 border-b border-[var(--color-border-muted)] px-3 py-1.5 text-[12px] last:border-b-0"
        >
          <span className="font-mono text-[var(--color-accent)]">{line.hash.slice(0, 8)}</span>
          <span className="truncate text-[var(--color-text-muted)]">
            L{line.lineNumber} · {line.authorName || "unknown"}
          </span>
          <code className="min-w-0 whitespace-pre-wrap break-words text-[var(--color-text-primary)]">
            {line.content}
          </code>
        </div>
      ))}
    </div>
  );
}

/**
 * Commit list for a single file's history. Mirrors the archaeology commit list
 * but without file-stats (those are per-search, not per-file).
 */
export function FileHistoryList({ commits }: { commits: FileHistoryEntry[] }) {
  if (commits.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-[12px] text-[var(--color-text-muted)]">
        No history for this file.
      </p>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
      {commits.map((commit, index) => (
        <article
          key={`${commit.hash}-${index}`}
          className="border-b border-[var(--color-border-muted)] px-3 py-2.5 last:border-b-0"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px] text-[var(--color-accent)]">{commit.shortHash}</span>
            <h3 className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-text-primary)]">
              {commit.message}
            </h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
            <span>{commit.authorName || "unknown"}</span>
            <span>·</span>
            <span>{formatTime(commit.timestamp)}</span>
            {commit.refs?.length ? (
              <>
                <span>·</span>
                <span className="font-mono">{commit.refs.join(", ")}</span>
              </>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
