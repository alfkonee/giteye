import type { CommitSummary } from "../../types/git";

const LANE_SPACING = 14;
const HORIZONTAL_PADDING = 12;
const MIN_WIDTH = 96;
const MAX_VISIBLE_LANES = 10;

const LANE_COLORS = [
  "#f97316",
  "#22c55e",
  "#38bdf8",
  "#a78bfa",
  "#f43f5e",
  "#eab308",
  "#14b8a6",
  "#fb7185",
  "#60a5fa",
  "#c084fc",
];

export interface CommitGraphConnection {
  fromLane: number;
  toLane: number;
  color: string;
}

export interface CommitGraphRow {
  commitLane: number;
  lanesBefore: string[];
  lanesAfter: string[];
  passthroughConnections: CommitGraphConnection[];
  parentConnections: CommitGraphConnection[];
  color: string;
  width: number;
}

export function layoutCommitGraph(commits: CommitSummary[]): Map<string, CommitGraphRow> {
  const rows = new Map<string, CommitGraphRow>();
  const lanes: string[] = [];
  let maxLaneCount = 1;

  for (const commit of commits) {
    let commitLane = lanes.indexOf(commit.hash);
    if (commitLane === -1) {
      commitLane = lanes.length;
      lanes.push(commit.hash);
    }

    const lanesBefore = lanes.slice();
    const parents = commit.parents;
    const nextLanes = lanesBefore.slice();

    if (parents.length === 0) {
      nextLanes.splice(commitLane, 1);
    } else {
      const firstParent = parents[0];
      const existingFirstParentLane = nextLanes.findIndex(
        (hash, lane) => lane !== commitLane && hash === firstParent,
      );
      let insertionLane = commitLane + 1;

      if (existingFirstParentLane === -1) {
        nextLanes[commitLane] = firstParent;
      } else {
        nextLanes.splice(commitLane, 1);
        insertionLane = commitLane;
      }

      for (let parentIndex = 1; parentIndex < parents.length; parentIndex += 1) {
        const parentHash = parents[parentIndex];

        if (!nextLanes.includes(parentHash)) {
          nextLanes.splice(Math.min(insertionLane, nextLanes.length), 0, parentHash);
          insertionLane += 1;
        }
      }
    }

    const lanesAfter = nextLanes.slice();
    const parentConnections = parents
      .map((parentHash) => ({ parentHash, lane: lanesAfter.indexOf(parentHash) }))
      .filter((parent) => parent.lane >= 0)
      .map((parent) => ({
        fromLane: commitLane,
        toLane: parent.lane,
        color: colorForLane(parent.lane),
      }));
    const passthroughConnections = lanesBefore
      .map((hash, lane) => ({ lane, nextLane: lanesAfter.indexOf(hash) }))
      .filter((lane) => lane.lane !== commitLane && lane.nextLane >= 0)
      .map((lane) => ({
        fromLane: lane.lane,
        toLane: lane.nextLane,
        color: colorForLane(lane.nextLane),
      }));

    rows.set(commit.hash, {
      commitLane,
      lanesBefore,
      lanesAfter,
      passthroughConnections,
      parentConnections,
      color: colorForLane(commitLane),
      width: MIN_WIDTH,
    });

    lanes.splice(0, lanes.length, ...nextLanes);
    maxLaneCount = Math.max(maxLaneCount, lanesBefore.length, lanesAfter.length, commitLane + 1);
  }

  const graphWidth = Math.max(
    MIN_WIDTH,
    HORIZONTAL_PADDING * 2 + Math.min(maxLaneCount, MAX_VISIBLE_LANES) * LANE_SPACING,
  );

  for (const row of rows.values()) {
    row.width = graphWidth;
  }

  return rows;
}

export function laneX(lane: number) {
  return HORIZONTAL_PADDING + lane * LANE_SPACING;
}

export function colorForLane(lane: number) {
  return LANE_COLORS[lane % LANE_COLORS.length];
}
