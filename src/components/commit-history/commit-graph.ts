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

interface LaneState {
  hash: string;
  color: string;
}

export interface CommitGraphConnection {
  fromLane: number;
  toLane: number;
  color: string;
}

export interface CommitGraphRow {
  commitLane: number;
  hasCommitLineBefore: boolean;
  passthroughConnections: CommitGraphConnection[];
  parentConnections: CommitGraphConnection[];
  color: string;
  width: number;
}

export function layoutCommitGraph(
  commits: CommitSummary[],
): Map<string, CommitGraphRow> {
  const rows = new Map<string, CommitGraphRow>();
  const lanes: LaneState[] = [];
  let maxLaneCount = 1;
  let nextColorIndex = 0;

  for (const commit of commits) {
    let commitLane = lanes.findIndex((lane) => lane.hash === commit.hash);
    const continuesFromPreviousRow = commitLane !== -1;
    if (commitLane === -1) {
      commitLane = lanes.length;
      lanes.push({
        hash: commit.hash,
        color: colorForLane(nextColorIndex),
      });
      nextColorIndex += 1;
    }

    const lanesBefore = lanes.slice();
    const parents = commit.parents;
    const nextLanes = lanesBefore.slice();
    const commitColor =
      lanesBefore[commitLane]?.color ?? colorForLane(commitLane);

    if (parents.length === 0) {
      nextLanes.splice(commitLane, 1);
    } else {
      const firstParent = parents[0];
      const existingFirstParentLane = nextLanes.findIndex(
        (lane, index) => index !== commitLane && lane.hash === firstParent,
      );
      let insertionLane = commitLane + 1;

      if (existingFirstParentLane === -1) {
        nextLanes[commitLane] = {
          hash: firstParent,
          color: commitColor,
        };
      } else {
        nextLanes.splice(commitLane, 1);
        insertionLane = commitLane;
      }

      for (
        let parentIndex = 1;
        parentIndex < parents.length;
        parentIndex += 1
      ) {
        const parentHash = parents[parentIndex];

        if (!nextLanes.some((lane) => lane.hash === parentHash)) {
          const parentLane = Math.min(insertionLane, nextLanes.length);
          nextLanes.splice(parentLane, 0, {
            hash: parentHash,
            color: colorForLane(nextColorIndex),
          });
          nextColorIndex += 1;
          insertionLane += 1;
        }
      }
    }

    const lanesAfter = nextLanes;
    const parentConnections = compactConnections(
      parents
        .map((parentHash) => ({
          parentHash,
          lane: lanesAfter.findIndex((lane) => lane.hash === parentHash),
        }))
        .filter((parent) => parent.lane >= 0)
        .map((parent) =>
          connection(commitLane, parent.lane, lanesAfter[parent.lane].color),
        ),
    );
    const passthroughConnections = compactConnections(
      lanesBefore
        .map((lane, index) => ({
          color: lane.color,
          lane: index,
          nextLane: lanesAfter.findIndex(
            (nextLane) => nextLane.hash === lane.hash,
          ),
        }))
        .filter((lane) => lane.lane !== commitLane && lane.nextLane >= 0)
        .map((lane) => connection(lane.lane, lane.nextLane, lane.color)),
    );

    rows.set(commit.hash, {
      commitLane: visibleLane(commitLane),
      hasCommitLineBefore: continuesFromPreviousRow,
      passthroughConnections,
      parentConnections,
      color: commitColor,
      width: MIN_WIDTH,
    });

    lanes.splice(0, lanes.length, ...nextLanes);
    maxLaneCount = Math.max(
      maxLaneCount,
      lanesBefore.length,
      lanesAfter.length,
      commitLane + 1,
    );
  }

  const graphWidth = Math.max(
    MIN_WIDTH,
    HORIZONTAL_PADDING * 2 +
      Math.min(maxLaneCount, MAX_VISIBLE_LANES) * LANE_SPACING,
  );

  for (const row of rows.values()) {
    row.width = graphWidth;
  }

  return rows;
}

function connection(
  fromLane: number,
  toLane: number,
  color: string,
): CommitGraphConnection {
  return {
    fromLane: visibleLane(fromLane),
    toLane: visibleLane(toLane),
    color,
  };
}

function compactConnections(connections: CommitGraphConnection[]) {
  const seen = new Set<string>();
  return connections.filter((connection) => {
    const key = `${connection.fromLane}:${connection.toLane}:${connection.color}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function visibleLane(lane: number) {
  return Math.min(lane, MAX_VISIBLE_LANES - 1);
}

export function laneX(lane: number) {
  return HORIZONTAL_PADDING + lane * LANE_SPACING;
}

export function colorForLane(lane: number) {
  return LANE_COLORS[lane % LANE_COLORS.length];
}
