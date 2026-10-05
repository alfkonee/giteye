import type { CommitSummary, StashEntry } from "../../types/git";
import {
  colorForLane,
  laneX,
  layoutCommitGraph,
  type CommitGraphRow,
} from "./commit-graph";

export interface HistoryCommitRow {
  kind: "commit";
  key: string;
  commit: CommitSummary;
  graph: CommitGraphRow;
}

export interface StashGraphRow {
  width: number;
  stashLane: number;
  baseLane: number;
  color: string;
  /** The real committed DAG passes unchanged through every inserted row. */
  passthrough: ReadonlyArray<{ lane: number; color: string }>;
  /** Lines from earlier stash nodes continue to this row's base, not to this stash. */
  earlierStashLanes: ReadonlyArray<{ lane: number; color: string }>;
  lastBeforeBase: boolean;
}

export interface HistoryStashRow {
  kind: "stash";
  key: string;
  stash: StashEntry;
  /** A missing base must not be connected to a speculative graph lane. */
  graph: StashGraphRow | null;
  baseLoaded: boolean;
}

export type HistoryRow = HistoryCommitRow | HistoryStashRow;

/** Commit offsets never include saved snapshots or the pagination sentinel. */
export function commitRangeIndices(
  commits: ReadonlyArray<CommitSummary>,
  anchor: string,
  selected: string,
): [number, number] | null {
  const first = commits.findIndex((commit) => commit.hash === anchor);
  const second = commits.findIndex((commit) => commit.hash === selected);
  return first < 0 || second < 0 ? null : [first, second];
}

export function historyIndexOfBase(rows: ReadonlyArray<HistoryRow>, hash: string) {
  return rows.findIndex((row) => row.kind === "commit" && row.commit.hash === hash);
}

/** One increment per completed page; a short final page terminates Locate base. */
export function nextLimitForBase(
  loadedCount: number,
  limit: number,
  fetching: boolean,
  placeholder: boolean,
  baseLoaded: boolean,
  increment: number,
): number | null {
  return !baseLoaded && !fetching && !placeholder && loadedCount >= limit
    ? limit + increment
    : null;
}

export function buildHistoryRows(
  commits: ReadonlyArray<CommitSummary>,
  stashes: ReadonlyArray<StashEntry>,
  headHash?: string | null,
): { rows: HistoryRow[]; graphRows: Map<string, CommitGraphRow>; graphWidth: number } {
  const graphRows = layoutCommitGraph(commits);
  const commitHashes = new Set<string>();
  for (const commit of commits) commitHashes.add(commit.hash);
  const byBase = new Map<string, StashEntry[]>();
  const offWindow: StashEntry[] = [];
  const occurrences = new Map<string, number>();
  const stashKeys = new Map<StashEntry, string>();
  // listStashes is newest first. OIDs, not mutable stash@{n}, determine identity;
  // occurrence distinguishes two reflog entries that name the same snapshot.
  for (const stash of stashes) {
    const occurrence = occurrences.get(stash.commitHash) ?? 0;
    occurrences.set(stash.commitHash, occurrence + 1);
    stashKeys.set(stash, `stash:${stash.commitHash}:${occurrence}`);
    if (!commitHashes.has(stash.baseCommitHash)) {
      offWindow.push(stash);
      continue;
    }
    const siblings = byBase.get(stash.baseCommitHash) ?? [];
    siblings.push(stash);
    byBase.set(stash.baseCommitHash, siblings);
  }

  let graphWidth = graphRows.values().next().value?.width ?? 96;
  for (let index = 0; index < commits.length; index++) {
    const commit = commits[index];
    const siblings = byBase.get(commit.hash);
    if (!siblings?.length) continue;
    const base = graphRows.get(commit.hash)!;
    // Reserve distinct lanes outside the committed DAG, without altering its
    // lane assignment. Every snapshot edge ends at its real first parent.
    const previous = index > 0 ? graphRows.get(commits[index - 1].hash) : undefined;
    const previousLanes = previous?.outgoingLanes;
    const highestLane = Math.max(
      base.commitLane,
      previousLanes?.[previousLanes.length - 1]?.lane ?? -1,
    );
    graphWidth = Math.max(graphWidth, laneX(highestLane + siblings.length) + 10);
  }

  const rows: HistoryRow[] = [];
  for (let index = 0; index < commits.length; index++) {
    const commit = commits[index];
    const base = graphRows.get(commit.hash)!;
    const siblings = byBase.get(commit.hash) ?? [];
    if (siblings.length > 0) {
      const preceding = index > 0 ? graphRows.get(commits[index - 1].hash) : undefined;
      const passthrough = (preceding?.outgoingLanes ?? []).map((lane) => ({
        lane: lane.lane,
        color: lane.color,
      }));
      if (index === 0 && commit.hash === headHash) {
        passthrough.push({ lane: base.commitLane, color: base.color });
      }
      const precedingLanes = preceding?.outgoingLanes;
      const highestLane = Math.max(base.commitLane, precedingLanes?.[precedingLanes.length - 1]?.lane ?? -1);
      const earlierStashLanes: { lane: number; color: string }[] = [];

      for (let stashIndex = 0; stashIndex < siblings.length; stashIndex++) {
        const stash = siblings[stashIndex];
        const stashLane = highestLane + stashIndex + 1;
        const color = colorForLane(stashLane);
        rows.push({
          kind: "stash",
          key: stashKeys.get(stash)!,
          stash,
          baseLoaded: true,
          graph: {
            width: graphWidth,
            stashLane,
            baseLane: base.commitLane,
            color,
            passthrough,
            earlierStashLanes: [...earlierStashLanes],
            lastBeforeBase: stashIndex === siblings.length - 1,
          },
        });
        earlierStashLanes.push({ lane: stashLane, color });
      }
    }
    rows.push({
      kind: "commit",
      key: `commit:${commit.hash}`,
      commit,
      graph: {
        ...base,
        width: graphWidth,
        hasCommitLineBefore: base.hasCommitLineBefore || siblings.length > 0,
      },
    });
  }

  for (const stash of offWindow) {
    rows.push({
      kind: "stash",
      key: stashKeys.get(stash)!,
      stash,
      graph: null,
      baseLoaded: false,
    });
  }
  return { rows, graphRows, graphWidth };
}
