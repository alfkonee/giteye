import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StashRow } from "../src/components/commit-history/StashRow";
import { buildHistoryRows } from "../src/components/commit-history/history-rows";

const commits = [
  { hash: "main", parents: ["base"] },
  { hash: "side", parents: ["side-base"] },
  { hash: "side-base", parents: ["base"] },
  { hash: "base", parents: [] },
].map((commit) => ({ ...commit, shortHash: commit.hash, message: commit.hash, authorName: "QA", authorEmail: "qa@example.test", timestamp: "2026-01-01T00:00:00Z", refs: [] }));
const stashes = [0, 1].map((index) => ({
  name: `stash@{${index}}`, index, branch: "side", message: "saved work",
  commitHash: `stash-${index}`, shortHash: `stash-${index}`, baseCommitHash: "side-base",
  indexCommitHash: `index-${index}`, untrackedCommitHash: null, timestamp: "2026-01-01T00:00:00Z",
}));

function renderStashes(focusSet: Set<string> | null) {
  const { rows, graphWidth } = buildHistoryRows(commits, stashes);
  return rows.flatMap((row) => row.kind !== "stash" ? [] : [renderToStaticMarkup(
    <StashRow stash={row.stash} graph={row.graph} graphWidth={graphWidth} isSelected={false} isLocatingBase={false}
      focusSet={focusSet} onSelect={() => { }} onLocateBase={() => { }} />,
  )]);
}

test("stash insertion preserves bright focused lanes and faded unrelated lanes", () => {
  for (const markup of renderStashes(new Set(["main", "base"]))) {
    expect([...markup.matchAll(/<line\b[^>]*opacity="([^"]+)"/g)].map((match) => Number(match[1]))).toEqual([0.9, 0.16]);
    expect([...markup.matchAll(/<path\b[^>]*stroke-dasharray="3 2"[^>]*opacity="([^"]+)"/g)].map((match) => Number(match[1]))).toEqual(markup.includes('stash@{1}') ? [0.16, 0.16] : [0.16]);
  }
});

test("stash connectors stay bright when their base belongs to focused ancestry", () => {
  for (const markup of renderStashes(new Set(["side", "side-base", "base"]))) {
    expect([...markup.matchAll(/<line\b[^>]*opacity="([^"]+)"/g)].map((match) => Number(match[1]))).toEqual([0.16, 0.9]);
    expect(markup).not.toContain('opacity="0.35"');
  }
});

test("clearing focus restores every passthrough lane across stash rows", () => {
  for (const markup of renderStashes(null)) {
    expect([...markup.matchAll(/<line\b[^>]*opacity="([^"]+)"/g)].map((match) => Number(match[1]))).toEqual([0.9, 0.9]);
  }
});
