import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAppStore } from "../../stores/app-store";
import { gitQueries } from "../../lib/git-data";
import { CommitListItem } from "./CommitListItem";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { EmptyState } from "../common/EmptyState";
import { ErrorCallout } from "../common/ErrorCallout";
import { History } from "lucide-react";
import { COMMIT_ROW_HEIGHT, colorForLane, layoutCommitGraph } from "./commit-graph";
import { ReflogRecoveryPanel } from "./HistorySurgeryActions";
import { WorkingTreeRow } from "./WorkingTreeRow";
import { WORKING_TREE_COMMIT_HASH } from "../../lib/working-tree-node";

const INITIAL_COMMIT_LIMIT = 100;
const COMMIT_LIMIT_INCREMENT = 100;

export function CommitHistory() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const selectedCommitRange = useAppStore((s) => s.selectedCommitRange);
  const setSelectedCommitRange = useAppStore((s) => s.setSelectedCommitRange);
  const [commitLimit, setCommitLimit] = useState(INITIAL_COMMIT_LIMIT);
  const [showReflog, setShowReflog] = useState(false);
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
  const rangeSelectionAnchor = useRef<string | null>(null);
  const { data: snapshot } = useQuery(gitQueries.repositorySnapshot(activeRepoPath));
  const hasMoreCommits =
    isPlaceholderData || (commits?.length ?? 0) >= commitLimit;
  const graphRows = useMemo(() => layoutCommitGraph(commits ?? []), [commits]);
  const graphWidth = graphRows.values().next().value?.width ?? 96;
  const headRow = commits?.[0] ? graphRows.get(commits[0].hash) : undefined;
  const stagedCount = snapshot?.summary.stagedCount ?? 0;
  const unstagedCount = snapshot?.summary.unstagedCount ?? 0;
  const hasWorkingTreeChanges = stagedCount + unstagedCount > 0;

  const selectCommit = useCallback((hash: string, event: MouseEvent<HTMLDivElement>) => {
    const extendSelection = event.ctrlKey || event.metaKey || event.shiftKey;
    const anchorHash = rangeSelectionAnchor.current ?? selectedCommitRange[0];

    if (!extendSelection || !anchorHash || anchorHash === hash) {
      rangeSelectionAnchor.current = hash;
      setSelectedCommitRange([hash]);
      return;
    }

    const anchorIndex = commits?.findIndex((commit) => commit.hash === anchorHash) ?? -1;
    const selectedIndex = commits?.findIndex((commit) => commit.hash === hash) ?? -1;

    if (anchorIndex < 0 || selectedIndex < 0) {
      rangeSelectionAnchor.current = hash;
      setSelectedCommitRange([hash]);
      return;
    }

    setSelectedCommitRange(
      anchorIndex > selectedIndex ? [anchorHash, hash] : [hash, anchorHash],
    );
  }, [commits, selectedCommitRange, setSelectedCommitRange]);

  useEffect(() => {
    if (
      !rangeSelectionAnchor.current ||
      !selectedCommitRange.includes(rangeSelectionAnchor.current)
    ) {
      rangeSelectionAnchor.current =
        selectedCommitRange[selectedCommitRange.length - 1] ?? null;
    }
  }, [selectedCommitRange]);

  useEffect(() => {
    setCommitLimit(INITIAL_COMMIT_LIMIT);
  }, [activeRepoPath]);

  const virtualizer = useVirtualizer({
    count: (commits?.length ?? 0) + (hasMoreCommits ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: () => COMMIT_ROW_HEIGHT,
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
      <div className="flex items-center justify-center h-full" onContextMenu={(event) => event.preventDefault()}>
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4" onContextMenu={(event) => event.preventDefault()}>
        <ErrorCallout message="Failed to load commit history" />
      </div>
    );
  }

  if (!commits || commits.length === 0) {
    return (
      <div onContextMenu={(event) => event.preventDefault()}>
        <EmptyState
          icon={<History className="w-8 h-8" />}
          title="No Commits"
          description="This repository has no commits yet"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-primary)]" onContextMenu={(event) => event.preventDefault()}>
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2.5 py-1.5">
        <History className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
        <h2 className="text-[13px] font-semibold text-[var(--color-text-primary)]">History</h2>
        <p className="min-w-0 flex-1 truncate text-[10.5px] text-[var(--color-text-muted)]">
          {selectedCommitRange.length === 2
            ? `Comparing ${selectedCommitRange[0].slice(0, 8)} → ${selectedCommitRange[1].slice(0, 8)}`
            : `${commits.length} commits · Ctrl/⌘ or Shift-select to compare`}
        </p>
        <button
          type="button"
          onClick={() => setShowReflog((value) => !value)}
          className="giteye-btn giteye-btn-secondary giteye-btn-sm shrink-0"
        >
          {showReflog ? "Hide reflog" : "Reflog"}
        </button>
      </div>

      <ReflogRecoveryPanel open={showReflog} />

      <div
        className="sticky top-0 z-10 grid items-center gap-1.5 border-b border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/95 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)] backdrop-blur"
        style={{
          gridTemplateColumns: `${graphWidth}px 58px minmax(0,1fr) 104px 62px 26px`,
        }}
      >
        <span className="pl-1.5">Graph</span>
        <span>Hash</span>
        <span>Message</span>
        <span className="text-right">Author</span>
        <span className="text-right">Date</span>
        <span />
      </div>

      {hasWorkingTreeChanges ? (
        <div className="shrink-0 border-b border-[var(--color-border-muted)] px-1 pt-1">
          <WorkingTreeRow
            graphWidth={graphWidth}
            headLane={headRow?.commitLane ?? 0}
            headColor={headRow?.color ?? colorForLane(0)}
            stagedCount={stagedCount}
            unstagedCount={unstagedCount}
            isSelected={selectedCommitRange.includes(WORKING_TREE_COMMIT_HASH)}
            onSelect={() => setSelectedCommitRange([WORKING_TREE_COMMIT_HASH])}
          />
        </div>
      ) : null}

      <div ref={parentRef} className="flex-1 overflow-auto px-1 py-1">
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
                  branches={branches}
                  isSelected={selectedCommitRange.includes(commit.hash)}
                  onSelect={(selectedCommit, event) => selectCommit(selectedCommit.hash, event)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
