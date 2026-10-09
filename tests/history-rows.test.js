import { expect, test } from "bun:test";
import {
  buildHistoryRows,
  commitRangeIndices,
  historyIndexOfBase,
  focusAncestorSet,
  nextLimitForBase,
} from "../src/components/commit-history/history-rows";
import { operationCommitRoles, operationGraphLanes } from "../src/components/commit-history/commit-graph";
import { buildDisplayRefs } from "../src/components/commit-history/commit-refs";

function commit(hash, parents = [], refs = []) {
  return {
    hash,
    shortHash: hash.slice(0, 8),
    message: hash,
    authorName: "QA",
    authorEmail: "qa@example.test",
    timestamp: "2026-01-01T00:00:00Z",
    refs,
    parents,
  };
}

function stash(name, commitHash, baseCommitHash, index) {
  return {
    name,
    index,
    branch: index === 0 ? "deleted/topic" : "main",
    message: `saved ${name}`,
    commitHash,
    shortHash: commitHash.slice(0, 8),
    timestamp: "2026-01-02T00:00:00Z",
    baseCommitHash,
    indexCommitHash: `index-${commitHash}`,
    untrackedCommitHash: `untracked-${commitHash}`,
  };
}

test("several snapshots precede their actual base in newest-first order without parent internals", () => {
  const commits = [commit("tip", ["base"]), commit("base", ["root"]), commit("root")];
  const stashes = [stash("stash@{0}", "wip-new", "base", 0), stash("stash@{1}", "wip-old", "base", 1)];
  const { rows, graphRows, graphWidth } = buildHistoryRows(commits, stashes, "tip");
  expect(rows.map((row) => row.key)).toEqual([
    "commit:tip", "stash:wip-new:0", "stash:wip-old:0", "commit:base", "commit:root",
  ]);
  expect(rows[1].graph.baseLane).toBe(graphRows.get("base").commitLane);
  expect(rows[1].graph.lastBeforeBase).toBe(false);
  expect(rows[2].graph.lastBeforeBase).toBe(true);
  expect(rows[2].graph.earlierStashLanes.map((lane) => lane.lane)).toEqual([rows[1].graph.stashLane]);
  expect(rows[3].graph.hasCommitLineBefore).toBe(true);
  expect(graphWidth).toBeGreaterThanOrEqual(rows[2].graph.width);
  expect(graphRows.has("wip-new")).toBe(false);
  expect(graphRows.has("index-wip-new")).toBe(false);
  expect(graphRows.has("untracked-wip-new")).toBe(false);
});

test("working-tree HEAD lane continues through snapshots inserted before HEAD", () => {
  const commits = [commit("head", ["parent"]), commit("parent")];
  const { rows, graphRows } = buildHistoryRows(commits, [stash("stash@{0}", "saved", "head", 0)], "head");
  expect(rows.map((row) => row.kind)).toEqual(["stash", "commit", "commit"]);
  expect(rows[1].graph.hasCommitLineBefore).toBe(true);
  expect(graphRows.get("head").hasCommitLineBefore).toBe(false);
});

test("committed branch lanes remain pass-through across snapshots rooted at another base", () => {
  const commits = [
    commit("merge", ["main", "topic"]),
    commit("topic", ["base"]),
    commit("main", ["base"]),
    commit("base"),
  ];
  const { rows, graphRows } = buildHistoryRows(commits, [stash("stash@{0}", "snapshot", "main", 0)]);
  const preceding = graphRows.get("topic");
  expect(graphRows.get("main").commitLane).toBe(rows.find((row) => row.kind === "commit" && row.commit.hash === "main").graph.commitLane);
  expect(graphRows.get("topic").parentConnections).toEqual(preceding.parentConnections);
});

test("off-window and removed original branch do not connect to HEAD; Locate advances by committed pages", () => {
  const commits = Array.from({ length: 100 }, (_, index) => commit(`commit-${index}`, [`commit-${index + 1}`]));
  const saved = stash("stash@{0}", "wip", "commit-205", 0);
  const first = buildHistoryRows(commits, [saved], "commit-0");
  expect(first.rows.at(-1)).toMatchObject({ kind: "stash", baseLoaded: false, graph: null });
  expect(historyIndexOfBase(first.rows, saved.baseCommitHash)).toBe(-1);
  expect(nextLimitForBase(100, 100, false, false, false, 100)).toBe(200);
  expect(nextLimitForBase(100, 200, false, true, false, 100)).toBeNull();
  expect(nextLimitForBase(100, 200, false, false, false, 100)).toBeNull();
  const second = buildHistoryRows([...commits, commit("commit-205")], [saved]);
  const baseIndex = historyIndexOfBase(second.rows, saved.baseCommitHash);
  expect(second.rows[baseIndex - 1]).toMatchObject({ kind: "stash", key: first.rows.at(-1).key, baseLoaded: true });
  expect(nextLimitForBase(101, 200, false, false, true, 100)).toBeNull();
});

test("typed keys distinguish real commits and repeated stash OIDs; selectors may renumber", () => {
  const commits = [commit("same-oid")];
  const one = stash("stash@{0}", "same-oid", "same-oid", 0);
  const two = stash("stash@{1}", "same-oid", "same-oid", 1);
  const { rows } = buildHistoryRows(commits, [one, two]);
  expect(rows.map((row) => row.key)).toEqual(["stash:same-oid:0", "stash:same-oid:1", "commit:same-oid"]);
  expect(buildHistoryRows(commits, [{ ...one, name: "stash@{7}" }, { ...two, name: "stash@{8}" }]).rows.map((row) => row.key)).toEqual(rows.map((row) => row.key));
});

test("selection and operation roles address real commits, not nearby saved snapshots", () => {
  const commits = [commit("tip", ["base"]), commit("base")];
  const rows = buildHistoryRows(commits, [stash("stash@{0}", "wip", "base", 0)]).rows;
  expect(rows.map((row) => row.kind)).toEqual(["commit", "stash", "commit"]);
  expect(commitRangeIndices(commits, "tip", "base")).toEqual([0, 1]);
  expect(commitRangeIndices(commits, "tip", "wip")).toBeNull();
  const operation = {
    operation: "merge", phase: "ready", source: { hash: "tip", label: "main", subject: "tip" },
    target: { hash: "base", label: "base", subject: "base" }, current: null,
  };
  const graph = buildHistoryRows(commits, [stash("stash@{0}", "wip", "base", 0)]).graphRows;
  expect(operationCommitRoles(operation).has("wip")).toBe(false);
  expect(operationGraphLanes(operation, graph).targetLane).toBe(graph.get("base").commitLane);
});

test("peeled tag targets remain actionable without a branches query, even beyond the visible ref limit", () => {
  const tags = ["release/alpha", "長いタグ名-🚀", "v2.0", "v2.1"].map((name) => ({
    name, commitHash: "target", shortHash: "target", subject: null,
    tagger: null, timestamp: null, annotated: name === "v2.0",
  }));
  const refs = buildDisplayRefs(["HEAD -> main", "tag: stale"], undefined, tags, "target");
  expect(refs.filter((ref) => ref.isTag).map((ref) => ref.label)).toEqual(tags.map((tag) => tag.name));
  expect(refs.slice(2).filter((ref) => ref.isTag).every((ref) => ref.tag?.commitHash === "target")).toBe(true);
  expect(refs.some((ref) => ref.label === "stale")).toBe(false);
  expect(buildDisplayRefs([], undefined, [...tags, { ...tags[0], name: "blob-only", commitHash: "" }], "target").some((ref) => ref.label === "blob-only")).toBe(false);
  expect(buildDisplayRefs([], undefined, tags, "different").filter((ref) => ref.isTag)).toEqual([]);
});

test("focus keeps the focused side lane and all its ancestors, including through merges, and fades the other side", () => {
  // main: m2 (merge of m1 + f2) ; feature: f2 -> f1 -> base ; other: o1 -> base
  const commits = [
    commit("o1", ["base"]),
    commit("m2", ["m1", "f2"]),
    commit("f2", ["f1"]),
    commit("m1", ["base"]),
    commit("f1", ["base"]),
    commit("base", ["root"]),
    commit("root"),
  ];
  expect([...focusAncestorSet(commits, "f2")].sort()).toEqual(["base", "f1", "f2", "root"]);
  expect([...focusAncestorSet(commits, "m2")].sort()).toEqual(["base", "f1", "f2", "m1", "m2", "root"]);
  expect(focusAncestorSet(commits, "o1").has("m2")).toBe(false);
});

test("focus is absent when nothing is focused or the focused commit is not loaded yet", () => {
  const commits = [commit("tip", ["base"]), commit("base")];
  expect(focusAncestorSet(commits, null)).toBeNull();
  expect(focusAncestorSet(commits, "unloaded")).toBeNull();
});

test("focus stops at the loaded window edge but keeps the boundary parent so its lane edge stays bright", () => {
  const commits = [commit("tip", ["mid"]), commit("mid", ["beyond-window"])];
  expect([...focusAncestorSet(commits, "tip")].sort()).toEqual(["beyond-window", "mid", "tip"]);
});
