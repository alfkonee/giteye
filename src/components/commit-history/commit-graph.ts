import type { CommitSummary, OperationSnapshot } from "../../types/git";

/** Row geometry shared by the commit list, its graph SVG, and the virtualizer. */
export const COMMIT_ROW_HEIGHT = 28;
const LANE_SPACING = 12;
const HORIZONTAL_PADDING = 10;
const MIN_WIDTH = 76;
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

export function operationName(
  operation: OperationSnapshot["operation"],
): string {
  switch (operation) {
    case "merge":
      return "Merge";
    case "rebase":
      return "Rebase";
    case "cherryPick":
      return "Cherry-pick";
    case "revert":
      return "Revert";
    case "conflict":
      return "Conflict resolution";
    default:
      return "Git operation";
  }
}

export function operationStatus(snapshot: OperationSnapshot): string {
  if (snapshot.phase === "conflicted") {
    const count = snapshot.conflicts.length;
    return `${count} unresolved file${count === 1 ? "" : "s"}`;
  }
  return snapshot.allowedActions.includes("continue")
    ? "Ready to continue"
    : "Ready for review";
}

export interface OperationRoleBadge {
  role: "source" | "target" | "current";
  label: string;
  description: string;
}

/** Annotations only: pending operations never alter the committed DAG. */
export function operationCommitRoles(
  snapshot: OperationSnapshot | undefined,
): Map<string, OperationRoleBadge[]> {
  const badges = new Map<string, OperationRoleBadge[]>();
  if (!snapshot || snapshot.phase === "idle" || !snapshot.operation)
    return badges;

  for (const role of ["source", "target", "current"] as const) {
    const commit = snapshot[role];
    if (!commit) continue;
    const label =
      role === "current" && snapshot.operation === "rebase"
        ? "Replaying"
        : role === "current" && snapshot.operation === "cherryPick"
          ? "Picking"
          : role === "current" && snapshot.operation === "revert"
            ? "Reverting"
            : role[0].toUpperCase() + role.slice(1);
    const badge = {
      role,
      label,
      description: `${operationName(snapshot.operation)} ${role}: ${commit.label} · ${commit.hash} · ${commit.subject}`,
    };
    const existing = badges.get(commit.hash);
    if (existing) existing.push(badge);
    else badges.set(commit.hash, [badge]);
  }
  return badges;
}

/**
 * A contained operation diagram, not edges into virtualized history. Source
 * and target can share a real lane at different rows, so separate them here
 * without modifying the actual graph's lane assignment.
 */
export function operationGraphLanes(
  snapshot: OperationSnapshot,
  graphRows: ReadonlyMap<string, CommitGraphRow>,
) {
  const target = snapshot.target
    ? graphRows.get(snapshot.target.hash)
    : undefined;
  const sourceCommit =
    snapshot.operation === "rebase"
      ? (snapshot.current ?? snapshot.source)
      : snapshot.source;
  const source = sourceCommit ? graphRows.get(sourceCommit.hash) : undefined;
  const targetLane = target?.commitLane ?? 0;
  const sourceLane =
    source && source.commitLane !== targetLane
      ? source.commitLane
      : targetLane === MAX_VISIBLE_LANES - 1
        ? targetLane - 1
        : targetLane + 1;
  return {
    targetLane,
    sourceLane,
    targetColor: target?.color ?? colorForLane(targetLane),
    sourceColor: source?.color ?? colorForLane(sourceLane),
  };
}
