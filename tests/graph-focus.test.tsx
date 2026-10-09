import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CommitGraph } from "../src/components/commit-history/CommitListItem";
import { layoutCommitGraph, type CommitGraphRow } from "../src/components/commit-history/commit-graph";
import { WorkingTreeRow } from "../src/components/commit-history/WorkingTreeRow";

function graph(commits: [string, string[]][]) {
  return layoutCommitGraph(commits.map(([hash, parents]) => ({
    hash, parents, shortHash: hash, message: hash, authorName: "QA",
    authorEmail: "qa@example.com", timestamp: 0, refs: [],
  })));
}

function edgeOpacities(rows: Map<string, CommitGraphRow>, hash: string, focus: string[]) {
  const markup = renderToStaticMarkup(
    <CommitGraph graph={rows.get(hash)!} hash={hash} selected={false} refs={[]} focusSet={new Set(focus)} />,
  );
  return [...markup.matchAll(/<(?:line|path)\b[^>]*opacity="([^"]+)"/g)].map((match) => Number(match[1]));
}

test("unrelated branches fade at their connector into focused shared ancestry", () => {
  const rows = graph([["main", ["base"]], ["side", ["base"]], ["base", ["root"]], ["root", []]]);
  expect(edgeOpacities(rows, "side", ["main", "base", "root"])).toEqual([0.9, 0.16]);
  expect(edgeOpacities(rows, "base", ["main", "base", "root"])).toEqual([1, 1]);
});

test("unrelated incoming lanes stay faded until the focused root", () => {
  const rows = graph([["side", ["base"]], ["other", ["root"]], ["base", ["root"]], ["root", []]]);
  expect(edgeOpacities(rows, "other", ["base", "root"])).toEqual([0.16, 0.16]);
  expect(edgeOpacities(rows, "base", ["base", "root"])).toEqual([0.16, 1, 0.16]);
});

test("focused merge ancestry keeps both parent edges bright", () => {
  const rows = graph([["merge", ["left", "right"]], ["left", ["base"]], ["right", ["base"]], ["base", []]]);
  const focus = ["merge", "left", "right", "base"];
  expect(edgeOpacities(rows, "merge", focus)).toEqual([1, 1]);
  expect(edgeOpacities(rows, "right", focus)).toEqual([0.9, 1, 1]);
});

test("overlapping display lanes preserve each edge's focus identity", () => {
  const commits: [string, string[]][] = [
    ...Array.from({ length: 12 }, (_, i): [string, string[]] => [`tip${i}`, [`parent${i}`]]),
    ...Array.from({ length: 12 }, (_, i): [string, string[]] => [`parent${i}`, ["base"]]),
    ["base", []],
  ];
  const rows = graph(commits);
  const edges = edgeOpacities(rows, "parent0", ["tip11", "parent11", "base"]);
  expect(edges.filter((opacity) => opacity === 0.9)).toEqual([0.9]);
  expect(edges.filter((opacity) => opacity !== 0.9).every((opacity) => opacity === 0.16)).toBe(true);
});

test("working-tree connector follows history focus even when the row is selected", () => {
  for (const dimmed of [true, false]) {
    const markup = renderToStaticMarkup(
      <WorkingTreeRow graphWidth={76} headLane={0} headColor="#38bdf8" connectToHistory
        stagedCount={1} unstagedCount={0} isSelected dimmed={dimmed} onSelect={() => { }} />,
    );
    expect(markup.match(/<line\b[^>]*opacity="([^"]+)"/)?.[1]).toBe(dimmed ? "0.16" : "1");
    expect(markup.match(/<circle\b[^>]*opacity="([^"]+)"/)?.[1]).toBe(dimmed ? "0.35" : "1");
  }
});
