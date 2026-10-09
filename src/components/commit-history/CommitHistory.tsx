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
import { ArrowDownUp, History, X } from "lucide-react";
import { useAppStore } from "../../stores/app-store";
import { useConflictStore } from "../../stores/conflict-store";
import { gitQueries } from "../../lib/git-data";
import { gitApi } from "../../lib/tauri-api";
import { CommitListItem } from "./CommitListItem";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { EmptyState } from "../common/EmptyState";
import { ErrorCallout } from "../common/ErrorCallout";
import {
  COMMIT_ROW_HEIGHT,
  colorForLane,
  operationCommitRoles,
} from "./commit-graph";
import {
  buildHistoryRows,
  commitRangeIndices,
  focusAncestorSet,
  historyIndexOfBase,
  nextLimitForBase,
} from "./history-rows";
import { HistoryNavigationContext, type HistoryNavigation } from "./history-navigation";
import { RefHistoryDialog } from "./RefHistoryDialog";
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
  const historyFocus = useAppStore((s) => s.historyFocus);
  const setHistoryFocus = useAppStore((s) => s.setHistoryFocus);
  const [commitLimit, setCommitLimit] = useState(INITIAL_COMMIT_LIMIT);
  const [showReflog, setShowReflog] = useState(false);
  const [locateBase, setLocateBase] = useState<{ repoPath: string; hash: string } | null>(null);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [locatedHash, setLocatedHash] = useState<string | null>(null);
  const [refHistoryDialog, setRefHistoryDialog] = useState<{ rev: string; label: string } | null>(null);
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
  const navigationEpoch = useRef(0);
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

  const currentBranch = useMemo(
    () => branches?.find((branch) => branch.isCurrent && !branch.isRemote) ?? null,
    [branches],
  );
  const divergedFrom =
    currentBranch?.upstream &&
      (currentBranch.ahead ?? 0) > 0 &&
      (currentBranch.behind ?? 0) > 0
      ? currentBranch
      : null;
  const { data: mergeBaseHash } = useQuery(
    gitQueries.mergeBase(
      activeRepoPath,
      divergedFrom?.shortName ?? null,
      divergedFrom?.upstream ?? null,
    ),
  );

  const focusSet = useMemo(
    () => focusAncestorSet(commits ?? [], historyFocus?.hash ?? null),
    [commits, historyFocus],
  );

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
    return () => { navigationEpoch.current += 1; };
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
      setLocatedHash(locateBase.hash);
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

  /** The located row keeps a brief ring so jumps are visually confirmed. */
  useEffect(() => {
    if (!locatedHash) return;
    const timer = window.setTimeout(() => setLocatedHash(null), 1600);
    return () => window.clearTimeout(timer);
  }, [locatedHash]);

  useEffect(() => {
    if (!historyFocus) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistoryFocus(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [historyFocus, setHistoryFocus]);

  useEffect(() => {
    if (!commits || !hasMoreCommits || isFetching || locateBase || virtualItems.length === 0) return;
    const lastVirtualItem = virtualItems[virtualItems.length - 1];
    if (lastVirtualItem.index >= historyRows.length) {
      setCommitLimit((limit) => limit + COMMIT_LIMIT_INCREMENT);
    }
  }, [commits, hasMoreCommits, historyRows.length, isFetching, locateBase, virtualItems]);

  const requestBase = (hash: string) => {
    if (!activeRepoPath) return;
    navigationEpoch.current += 1;
    setLocateError(null);
    setLocateBase({ repoPath: activeRepoPath, hash });
  };

  const jumpToHash = useCallback(
    (hash: string | null | undefined) => {
      if (!hash) return;
      requestBase(hash);
    },
    // requestBase closes over activeRepoPath; re-creating per repo is enough.
    [activeRepoPath],
  );

  const jumpToRef = useCallback(
    async (refLabel: string) => {
      if (!activeRepoPath) return;
      const epoch = ++navigationEpoch.current;
      setLocateBase(null);
      setLocateError(null);
      const loaded = (commits ?? []).find((commit) => commit.refs.includes(refLabel));
      if (loaded) {
        setLocateBase({ repoPath: activeRepoPath, hash: loaded.hash });
        return;
      }
      // The tip may sit beyond the loaded window; resolve it, then locate.
      try {
        const hash = await gitApi.resolveRevision(activeRepoPath, refLabel);
        if (navigationEpoch.current !== epoch || useAppStore.getState().activeRepoPath !== activeRepoPath) return;
        setLocateBase({ repoPath: activeRepoPath, hash });
      } catch (error) {
        if (navigationEpoch.current !== epoch || useAppStore.getState().activeRepoPath !== activeRepoPath) return;
        const message = error instanceof Error ? error.message : String(error);
        setLocateError(`Could not locate ${refLabel}: ${message}`);
      }
    },
    [activeRepoPath, commits],
  );

  const jumpToMergeBase = useCallback(
    async (fromRef: string, toRef: string) => {
      if (!activeRepoPath) return;
      const epoch = ++navigationEpoch.current;
      setLocateBase(null);
      setLocateError(null);
      try {
        const hash = await gitApi.getMergeBase(activeRepoPath, fromRef, toRef);
        if (navigationEpoch.current !== epoch || useAppStore.getState().activeRepoPath !== activeRepoPath) return;
        if (hash) setLocateBase({ repoPath: activeRepoPath, hash });
        else setLocateError(`${fromRef} and ${toRef} share no common ancestor.`);
      } catch (error) {
        if (navigationEpoch.current !== epoch || useAppStore.getState().activeRepoPath !== activeRepoPath) return;
        const message = error instanceof Error ? error.message : String(error);
        setLocateError(`Could not locate the merge base of ${fromRef} and ${toRef}: ${message}`);
      }
    },
    [activeRepoPath],
  );

  const historyNavigation: HistoryNavigation = useMemo(
    () => ({
      jumpToRef,
      jumpToHash,
      jumpToMergeBase,
      focusHistory: setHistoryFocus,
      openRefHistory: (rev, label) => setRefHistoryDialog({ rev, label }),
    }),
    [jumpToRef, jumpToHash, jumpToMergeBase, setHistoryFocus],
  );

  return (
    <HistoryNavigationContext.Provider value={historyNavigation}>
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
        {divergedFrom?.upstream ? (
          <div
            className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--color-warning)]"
            title={`${divergedFrom.shortName} and ${divergedFrom.upstream} have diverged: ${(divergedFrom.ahead ?? 0)} commits ahead, ${(divergedFrom.behind ?? 0)} behind. Jump to the diverged sides.`}
          >
            <ArrowDownUp className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="max-w-[180px] truncate">
              {divergedFrom.shortName} ↕ {divergedFrom.upstream} ·{" "}
              {divergedFrom.ahead ?? 0}↑ {divergedFrom.behind ?? 0}↓
            </span>
            <button
              type="button"
              className="rounded px-1 hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
              title={`Scroll the graph to the ${divergedFrom.upstream} tip commit`}
              onClick={() => jumpToRef(divergedFrom.upstream!)}
            >
              Upstream tip
            </button>
            {mergeBaseHash ? (
              <button
                type="button"
                className="rounded px-1 hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                title="Scroll the graph to the divergence point (merge base)"
                onClick={() => jumpToHash(mergeBaseHash)}
              >
                Merge base
              </button>
            ) : null}
          </div>
        ) : null}
        {historyFocus ? (
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-1.5 py-0.5 text-[10px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
            title="Other lanes are dimmed. Click or press Escape to show all history again."
            onClick={() => setHistoryFocus(null)}
          >
            Focusing {historyFocus.label}
            <X className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only"> — Escape to clear</span>
            <span aria-hidden="true" className="opacity-70">Esc</span>
          </button>
        ) : null}
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
                dimmed={
                  Boolean(focusSet) &&
                  Boolean(headHash) &&
                  !focusSet!.has(headHash!)
                }
                divergedUpstream={divergedFrom?.upstream ?? null}
                ahead={divergedFrom?.ahead ?? null}
                behind={divergedFrom?.behind ?? null}
                mergeBaseHash={mergeBaseHash ?? null}
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
                        focusSet={focusSet}
                        highlighted={locatedHash === row.commit.hash}
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
                        focusSet={focusSet}
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
      {refHistoryDialog && activeRepoPath ? (
        <RefHistoryDialog
          repoPath={activeRepoPath}
          rev={refHistoryDialog.rev}
          label={refHistoryDialog.label}
          onJumpToHash={jumpToHash}
          onClose={() => setRefHistoryDialog(null)}
        />
      ) : null}
    </div>
    </HistoryNavigationContext.Provider>
  );
}
