import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAppStore } from "../../stores/app-store";
import { useConflictStore } from "../../stores/conflict-store";
import { gitQueries } from "../../lib/git-data";
import { CommitListItem } from "./CommitListItem";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { EmptyState } from "../common/EmptyState";
import { ErrorCallout } from "../common/ErrorCallout";
import { History } from "lucide-react";
import {
  COMMIT_ROW_HEIGHT,
  colorForLane,
  operationCommitRoles,
} from "./commit-graph";
import {
  buildHistoryRows,
  commitRangeIndices,
  historyIndexOfBase,
  nextLimitForBase,
} from "./history-rows";
import { StashRow } from "./StashRow";
import { ReflogRecoveryPanel } from "./HistorySurgeryActions";
import { ActiveOperationRow, WorkingTreeRow } from "./WorkingTreeRow";
import { WORKING_TREE_COMMIT_HASH } from "../../lib/working-tree-node";
import type { Branch } from "../../types/git";

const INITIAL_COMMIT_LIMIT = 100;
const COMMIT_LIMIT_INCREMENT = 100;

export function CommitHistory({
  onActivateBranch,
}: {
  onActivateBranch: (branch: Branch) => void;
}) {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const selectedCommitRange = useAppStore((s) => s.selectedCommitRange);
  const setSelectedCommitRange = useAppStore((s) => s.setSelectedCommitRange);
  const selectedGitRef = useAppStore((s) => s.selectedGitRef);
  const setSelectedGitRef = useAppStore((s) => s.setSelectedGitRef);
  const [commitLimit, setCommitLimit] = useState(INITIAL_COMMIT_LIMIT);
  const [showReflog, setShowReflog] = useState(false);
  const [locateBase, setLocateBase] = useState<{ repoPath: string; hash: string } | null>(null);
  const [locateError, setLocateError] = useState<string | null>(null);
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
  const { data: stashes } = useQuery(gitQueries.stashes(activeRepoPath));
  const { data: tags } = useQuery(gitQueries.tags(activeRepoPath));
  const parentRef = useRef<HTMLDivElement>(null);
  const rangeSelectionAnchor = useRef<string | null>(null);
  const { data: snapshot } = useQuery(
    gitQueries.repositorySnapshot(activeRepoPath),
  );
  const { data: operation } = useQuery(
    gitQueries.operationSummary(activeRepoPath),
  );
  const activeOperation =
    operation && operation.operation && operation.phase !== "idle"
      ? operation
      : null;
  const operationRoles = useMemo(
    () => operationCommitRoles(operation),
    [operation],
  );
  const hasMoreCommits =
    isPlaceholderData || (commits?.length ?? 0) >= commitLimit;
  const headHash = snapshot?.repositoryInfo.headCommit;
  const { rows: historyRows, graphRows, graphWidth } = useMemo(
    () => buildHistoryRows(commits ?? [], stashes ?? [], headHash),
    [commits, stashes, headHash],
  );
  const headRow = headHash ? graphRows.get(headHash) : undefined;
  const stagedCount = snapshot?.summary.stagedCount ?? 0;
  const unstagedCount = snapshot?.summary.unstagedCount ?? 0;
  const hasWorkingTreeChanges = stagedCount + unstagedCount > 0;

  const selectCommit = useCallback(
    (hash: string, event: MouseEvent<HTMLDivElement>) => {
      const extendSelection = event.ctrlKey || event.metaKey || event.shiftKey;
      const anchorHash = rangeSelectionAnchor.current ?? selectedCommitRange[0];

      if (!extendSelection || !anchorHash || anchorHash === hash) {
        rangeSelectionAnchor.current = hash;
        setSelectedCommitRange([hash]);
        return;
      }

      const indices = commitRangeIndices(commits ?? [], anchorHash, hash);
      if (!indices) {
        rangeSelectionAnchor.current = hash;
        setSelectedCommitRange([hash]);
        return;
      }

      setSelectedCommitRange(
        indices[0] > indices[1] ? [anchorHash, hash] : [hash, anchorHash],
      );
    },
    [commits, selectedCommitRange, setSelectedCommitRange],
  );

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
    setLocateBase(null);
    setLocateError(null);
  }, [activeRepoPath]);

  const virtualizer = useVirtualizer({
    count: historyRows.length + (hasMoreCommits ? 1 : 0),
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => historyRows[index]?.key ?? "history:load-more",
    estimateSize: () => COMMIT_ROW_HEIGHT,
    overscan: 10,
  });
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (!locateBase || locateBase.repoPath !== activeRepoPath || !commits || isPlaceholderData || isFetching) return;
    const index = historyIndexOfBase(historyRows, locateBase.hash);
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: "center" });
      setLocateBase(null);
      return;
    }
    const next = nextLimitForBase(commits.length, commitLimit, isFetching, isPlaceholderData, false, COMMIT_LIMIT_INCREMENT);
    if (next !== null) {
      setCommitLimit(next);
    } else {
      setLocateError(`Base ${locateBase.hash.slice(0, 8)} was not found in committed history.`);
      setLocateBase(null);
    }
  }, [activeRepoPath, commitLimit, commits, historyRows, isFetching, isPlaceholderData, locateBase, virtualizer]);

  useEffect(() => {
    if (!commits || !hasMoreCommits || isFetching || locateBase || virtualItems.length === 0) return;
    const lastVirtualItem = virtualItems[virtualItems.length - 1];
    if (lastVirtualItem.index >= historyRows.length) {
      setCommitLimit((limit) => limit + COMMIT_LIMIT_INCREMENT);
    }
  }, [commits, hasMoreCommits, historyRows.length, isFetching, locateBase, virtualItems]);

  const requestBase = (hash: string) => {
    if (!activeRepoPath) return;
    setLocateError(null);
    setLocateBase({ repoPath: activeRepoPath, hash });
  };

  return (
    <div
      className="flex h-full flex-col bg-[var(--color-bg-primary)]"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2.5 py-1.5">
        <History className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
        <h2 className="text-[13px] font-semibold text-[var(--color-text-primary)]">
          History
        </h2>
        <p className="min-w-0 flex-1 truncate text-[10.5px] text-[var(--color-text-muted)]">
          {selectedCommitRange.length === 2
            ? `Comparing ${selectedCommitRange[0].slice(0, 8)} → ${selectedCommitRange[1].slice(0, 8)}`
            : `${commits?.length ?? 0} commits · Ctrl/⌘ or Shift-select to compare`}
        </p>
        <button
          type="button"
          onClick={() => setShowReflog((value) => !value)}
          className="giteye-btn giteye-btn-secondary giteye-btn-sm shrink-0"
        >
          {showReflog ? "Hide reflog" : "Reflog"}
        </button>
      </div>

      {locateError ? (
        <div role="status" className="border-b border-[var(--color-border-muted)] px-3 py-1 text-[11px] text-[var(--color-warning)]">
          {locateError}
        </div>
      ) : null}
      <ReflogRecoveryPanel open={showReflog} />

      {activeOperation && activeRepoPath ? (
        <div
          className="shrink-0 border-b border-[var(--color-border-muted)] px-1 py-1"
          aria-live="polite"
        >
          <ActiveOperationRow
            operation={activeOperation}
            graphRows={graphRows}
            graphWidth={graphWidth}
            onOpen={() => useConflictStore.getState().open(activeRepoPath)}
          />
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div className="p-4">
          <ErrorCallout message="Failed to load commit history" />
        </div>
      ) : historyRows.length === 0 ? (
        <EmptyState
          icon={<History className="w-8 h-8" />}
          title="No Commits"
          description="This repository has no commits yet"
        />
      ) : (
        <>
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
                connectToHistory={
                  headHash === commits?.[0]?.hash &&
                  (parentRef.current?.scrollTop ?? 0) === 0
                }
                stagedCount={stagedCount}
                unstagedCount={unstagedCount}
                isSelected={selectedCommitRange.includes(
                  WORKING_TREE_COMMIT_HASH,
                )}
                onSelect={() =>
                  setSelectedCommitRange([WORKING_TREE_COMMIT_HASH])
                }
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
                if (virtualItem.index >= historyRows.length) {
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

                const row = historyRows[virtualItem.index];

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
                    {row.kind === "commit" ? (
                      <CommitListItem
                        commit={row.commit}
                        graph={row.graph}
                        tags={tags}
                        branches={branches}
                        operationRoles={operationRoles.get(row.commit.hash)}
                        onActivateBranch={onActivateBranch}
                        isSelected={selectedCommitRange.includes(row.commit.hash)}
                        onSelect={(selectedCommit, event) =>
                          selectCommit(selectedCommit.hash, event)
                        }
                      />
                    ) : (
                      <StashRow
                        stash={row.stash}
                        graph={row.graph}
                        graphWidth={graphWidth}
                        isLocatingBase={locateBase?.hash === row.stash.baseCommitHash}
                        isSelected={selectedGitRef?.kind === "stash" && selectedGitRef.commitHash === row.stash.commitHash}
                        onSelect={() => setSelectedGitRef({ kind: "stash", name: row.stash.name, commitHash: row.stash.commitHash })}
                        onLocateBase={requestBase}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
