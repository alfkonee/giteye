import { expect, test } from "bun:test";
import {
  layoutCommitGraph,
  operationCommitRoles,
  operationGraphLanes,
} from "../src/components/commit-history/commit-graph";

function operationCommit(hash, label) {
  return { hash, label, subject: `${label} change` };
}

function snapshot(overrides = {}) {
  return {
    id: "operation-1",
    operation: "rebase",
    phase: "conflicted",
    source: operationCommit("original-tip", "feature"),
    target: operationCommit("target", "main"),
    current: operationCommit("replayed", "Current replayed commit"),
    rebase: { currentStep: 2, totalSteps: 3 },
    conflicts: [
      { path: "file.txt", status: "UU", conflictType: "both modified" },
    ],
    allowedActions: ["continue", "abort", "skip"],
    currentLabel: "Updated target",
    incomingLabel: "Commit being replayed",
    ...overrides,
  };
}

function historyCommit(hash, parents = []) {
  return { hash, parents };
}

test("rebase keeps original source, onto target, and replayed commit roles distinct", () => {
  const operation = snapshot();
  const roles = operationCommitRoles(operation);

  expect(roles.get("original-tip").map((badge) => badge.role)).toEqual([
    "source",
  ]);
  expect(roles.get("target").map((badge) => badge.role)).toEqual(["target"]);
  expect(roles.get("replayed").map((badge) => badge.role)).toEqual(["current"]);

  const graph = layoutCommitGraph([
    historyCommit("target", ["base"]),
    historyCommit("replayed", ["base"]),
    historyCommit("base"),
  ]);
  const lanes = operationGraphLanes(operation, graph);
  expect(lanes.targetLane).toBe(graph.get("target").commitLane);
  expect(lanes.sourceLane).toBe(graph.get("replayed").commitLane);
});

test("merge receiving HEAD can retain both target and current annotations", () => {
  const receivingHead = operationCommit("head", "main");
  const operation = snapshot({
    operation: "merge",
    source: operationCommit("incoming", "feature"),
    target: receivingHead,
    current: receivingHead,
  });
  const roles = operationCommitRoles(operation);
  expect(roles.get("head").map((badge) => badge.role)).toEqual([
    "target",
    "current",
  ]);
  expect(roles.get("incoming").map((badge) => badge.role)).toEqual(["source"]);
});

test("a clean-index paused operation retains annotations until Git reports idle", () => {
  const ready = snapshot({ phase: "ready", conflicts: [] });
  expect(
    operationCommitRoles(ready)
      .get("replayed")
      .map((badge) => badge.role),
  ).toEqual(["current"]);
  expect(
    operationCommitRoles({ ...ready, phase: "idle", operation: null, id: null })
      .size,
  ).toBe(0);
});

test("same-lane and unloaded sources get distinct contained lanes without changing the committed DAG", () => {
  const graph = layoutCommitGraph([
    historyCommit("target", ["replayed"]),
    historyCommit("replayed"),
  ]);
  const committedGraph = structuredClone(graph);
  expect(graph.get("target").commitLane).toBe(graph.get("replayed").commitLane);

  const operation = snapshot();
  const lanes = operationGraphLanes(operation, graph);
  expect(lanes.sourceLane).not.toBe(lanes.targetLane);

  const unloaded = operationGraphLanes(
    {
      ...operation,
      source: operationCommit("unloaded-original", "feature"),
      current: operationCommit("unloaded-replay", "Replay"),
    },
    graph,
  );
  expect(unloaded.sourceLane).not.toBe(unloaded.targetLane);
  expect(graph).toEqual(committedGraph);
  expect(graph.has("unloaded-original")).toBe(false);
  expect(graph.has("unloaded-replay")).toBe(false);
});
