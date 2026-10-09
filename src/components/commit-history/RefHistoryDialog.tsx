import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { History, X } from "lucide-react";
import { gitQueries } from "../../lib/git-data";
import { formatRelativeTime, truncateHash } from "../../lib/format";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { ErrorCallout } from "../common/ErrorCallout";
import { buildHistoryRows } from "./history-rows";
import { CommitGraph } from "./CommitListItem";
import { buildDisplayRefs, RefPill } from "./commit-refs";
import { COMMIT_ROW_HEIGHT } from "./commit-graph";

const PAGE_SIZE = 100;

/**
 * Read-only popup listing only the commits reachable from one revision, laid
 * out with its own lanes. Choosing a row closes the popup and locates that
 * commit in the main graph.
 */
export function RefHistoryDialog({
 repoPath,
 rev,
 label,
 onJumpToHash,
 onClose,
}: {
 repoPath: string;
 rev: string;
 label: string;
 onJumpToHash: (hash: string) => void;
 onClose: () => void;
}) {
 const [limit, setLimit] = useState(PAGE_SIZE);
 const dialog = useRef<HTMLElement>(null);
 const { data: commits, isLoading, isFetching, error } = useQuery({
  ...gitQueries.refHistory(repoPath, rev, limit),
  placeholderData: (previous) => previous,
 });
 const { data: branches } = useQuery(gitQueries.branches(repoPath));
 const { data: tags } = useQuery(gitQueries.tags(repoPath));
 const { rows, graphWidth } = useMemo(
  () => buildHistoryRows(commits ?? [], [], null),
  [commits],
 );
 const hasMore = (commits?.length ?? 0) >= limit;

 useEffect(() => {
  const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.current?.focus();
  // Capture phase: Escape closes only the popup, not an active history focus.
  const onKeyDown = (event: KeyboardEvent) => {
   if (event.key !== "Escape") return;
   event.preventDefault();
   event.stopPropagation();
   onClose();
  };
  window.addEventListener("keydown", onKeyDown, true);
  return () => {
   window.removeEventListener("keydown", onKeyDown, true);
   restore?.focus();
  };
 }, [onClose]);

 const gridTemplateColumns = `${graphWidth}px 58px minmax(0,1fr) 110px 62px`;

 return createPortal(
  <div
   className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 px-4"
   role="presentation"
   onMouseDown={onClose}
  >
   <section
    ref={dialog}
    tabIndex={-1}
    role="dialog"
    aria-modal="true"
    aria-labelledby="ref-history-title"
    className="flex max-h-[min(80vh,720px)] w-[calc(100vw-2rem)] max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-elevated)] outline-none"
    onMouseDown={(event) => event.stopPropagation()}
   >
    <header className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
     <History className="h-4 w-4 shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
     <h2 id="ref-history-title" className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-text-primary)]">
      History of <span className="font-mono">{label}</span>
     </h2>
     <span className="shrink-0 text-[11px] tabular-nums text-[var(--color-text-muted)]">
      {commits?.length ?? 0} commits · click a row to locate it
     </span>
     <button
      type="button"
      aria-label="Close history"
      className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      onClick={onClose}
     >
      <X className="h-4 w-4" />
     </button>
    </header>
    <div className="min-h-0 flex-1 overflow-auto bg-[var(--color-bg-primary)] px-1 py-1">
     {isLoading ? (
      <div className="flex justify-center py-8"><LoadingSpinner /></div>
     ) : error ? (
      <div className="p-4">
       <ErrorCallout message={`Could not load history of ${label}: ${error instanceof Error ? error.message : String(error)}`} />
      </div>
     ) : (
      <div role="table" aria-label={`History of ${label}`}>
       {rows.map((row) => {
        if (row.kind !== "commit") return null;
        const refs = buildDisplayRefs(row.commit.refs, branches, tags, row.commit.hash);
        return (
         <button
          key={row.key}
          type="button"
          role="row"
          className="grid w-full items-center gap-1.5 rounded-md px-2 text-left hover:bg-[var(--color-bg-secondary)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]"
          style={{ gridTemplateColumns, height: `${COMMIT_ROW_HEIGHT}px` }}
          title={`Locate ${row.commit.shortHash} in the history graph`}
          onClick={() => {
           onClose();
           onJumpToHash(row.commit.hash);
          }}
         >
          <CommitGraph graph={row.graph} selected={false} refs={refs} hash={row.commit.hash} />
          <span className="truncate font-mono text-[10.5px] text-[var(--color-accent)]">
           {truncateHash(row.commit.shortHash)}
          </span>
          <span className="flex min-w-0 items-center gap-2">
           <span className="truncate text-[11.5px] font-medium text-[var(--color-text-primary)]">
            {row.commit.message}
           </span>
           {refs.slice(0, 3).map((ref) => (
            <RefPill key={`${ref.label}:${ref.isTag}:${ref.isRemote}`} displayRef={ref} className="max-w-[110px] shrink-0" />
           ))}
          </span>
          <span className="truncate text-right text-[11px] text-[var(--color-text-secondary)]">
           {row.commit.authorName}
          </span>
          <span className="text-right text-[10px] text-[var(--color-text-muted)]">
           {formatRelativeTime(row.commit.timestamp)}
          </span>
         </button>
        );
       })}
       {hasMore ? (
        <div className="flex justify-center py-2">
         <button
          type="button"
          disabled={isFetching}
          className="giteye-btn giteye-btn-secondary giteye-btn-sm"
          onClick={() => setLimit((value) => value + PAGE_SIZE)}
         >
          {isFetching ? "Loading…" : "Load more"}
         </button>
        </div>
       ) : null}
      </div>
     )}
    </div>
   </section>
  </div>,
  document.body,
 );
}
