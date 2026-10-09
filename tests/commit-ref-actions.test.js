import { expect, test } from "bun:test";
import { integrableRefs, remoteRefEntries } from "../src/components/commit-history/commit-ref-actions";

function ref(label, overrides = {}) {
  return { label, isHead: false, isRemote: false, isTag: false, hasTrackingRemote: false, ...overrides };
}

function branch(shortName, isRemote) {
  return {
    name: isRemote ? `refs/remotes/${shortName}` : `refs/heads/${shortName}`,
    shortName,
    isCurrent: false,
    isRemote,
    upstream: null,
    ahead: null,
    behind: null,
  };
}

test("tag decorations never become merge/rebase targets, even before branch data loads", () => {
  const refs = [
    ref("release/1", { isTag: true }),
    ref("HEAD", { isHead: true }),
    ref("feature"),
    ref("feature"),
    ref("origin/main", { isRemote: true }),
    ref("origin/other", { isRemote: true }),
  ];
  expect(integrableRefs(refs).map((entry) => entry.label)).toEqual(["feature", "origin/main"]);
  expect(integrableRefs([ref("release/1", { isTag: true })])).toEqual([]);
});

test("remote tag labels cannot become branch checkout or fast-forward actions", () => {
  const remote = branch("origin/release", true);
  const refs = [ref("origin/release", { isTag: true, isRemote: true }), ref("origin/feature", { isRemote: true })];
  expect(remoteRefEntries(refs, [remote, branch("origin/feature", true)])).toEqual([
    { kind: "checkout", refLabel: "origin/feature", localName: "feature" },
  ]);
  expect(remoteRefEntries(refs, undefined)).toEqual([]);
});
