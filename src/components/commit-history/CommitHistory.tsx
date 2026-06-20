import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAppStore } from "../../stores/app-store";
import { gitQueries } from "../../lib/git-data";
import { CommitListItem } from "./CommitListItem";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { EmptyState } from "../common/EmptyState";
import { ErrorCallout } from "../common/ErrorCallout";
import { History } from "lucide-react";
import { layoutCommitGraph } from "./commit-graph";

const INITIAL_COMMIT_LIMIT = 100;
const COMMIT_LIMIT_INCREMENT = 100;

export function CommitHistory() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const [commitLimit, setCommitLimit] = useState(INITIAL_COMMIT_LIMIT);
  const {
    data: commits,
    isLoading,
    isFetching,
    isPlaceholderData,
    error,
  } = useQuery({
    ...gitQueries.commits(activeRepoPath, commitLimit),
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === activeRepoPath ? previousData : undefined,
  });
  const { data: branches } = useQuery(gitQueries.branches(activeRepoPath));
  const parentRef = useRef<HTMLDivElement>(null);
  const hasMoreCommits =
    isPlaceholderData || (commits?.length ?? 0) >= commitLimit;
  const graphRows = useMemo(() => layoutCommitGraph(commits ?? []), [commits]);
  const graphWidth = graphRows.values().next().value?.width ?? 96;

  useEffect(() => {
    setCommitLimit(INITIAL_COMMIT_LIMIT);
  }, [activeRepoPath]);

  const virtualizer = useVirtualizer({
    count: (commits?.length ?? 0) + (hasMoreCommits ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 42,
    overscan: 10,
  });
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (
      !commits ||
      !hasMoreCommits ||
      isFetching ||
      virtualItems.length === 0
    ) {
      return;
    }

    const lastVirtualItem = virtualItems[virtualItems.length - 1];
    if (lastVirtualItem.index >= commits.length) {
      setCommitLimit((limit) => limit + COMMIT_LIMIT_INCREMENT);
    }
  }, [commits, hasMoreCommits, isFetching, virtualItems]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <ErrorCallout message="Failed to load commit history" />
      </div>
    );
  }

  if (!commits || commits.length === 0) {
    return (
      <EmptyState
        icon={<History className="w-8 h-8" />}
        title="No Commits"
        description="This repository has no commits yet"
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-primary)]">
      <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-accent)]/15 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/25">
            <History className="h-3.5 w-3.5" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-[var(--color-text-primary)]">
              History
            </h2>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              {commits.length} commits in this branch view
            </p>
          </div>
        </div>
      </div>

      <div
        className="sticky top-0 z-10 grid items-center gap-1.5 border-b border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)] backdrop-blur"
        style={{
          gridTemplateColumns: `${graphWidth}px 64px minmax(0,1fr) 120px 74px`,
        }}
      >
        <span className="pl-2">Graph</span>
        <span>Hash</span>
        <span>Message</span>
        <span className="text-right">Author</span>
        <span className="text-right">Date</span>
      </div>

      <div ref={parentRef} className="flex-1 overflow-auto px-1.5 py-1.5">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((virtualItem) => {
            if (virtualItem.index >= commits.length) {
              return (
                <div
                  key={virtualItem.key}
                  className="flex items-center justify-center gap-2 text-[11px] text-[var(--color-text-muted)]"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {isFetching ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span>Loading more commits…</span>
                    </>
                  ) : (
                    <span>Scroll to load more commits</span>
                  )}
                </div>
              );
            }

            const commit = commits[virtualItem.index];
            const graph = graphRows.get(commit.hash);

            if (!graph) return null;

            return (
              <div
                key={virtualItem.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <CommitListItem
                  commit={commit}
                  graph={graph}
                  branches={branches ?? []}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
