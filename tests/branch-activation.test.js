import { expect, test } from "bun:test";
import { findTrackingLocalBranch, planBranchActivation } from "../src/lib/branch-activation";

function branch(shortName, overrides = {}) {
  return {
    name: overrides.isRemote ? `refs/remotes/${shortName}` : `refs/heads/${shortName}`,
    shortName,
    isCurrent: false,
    isRemote: false,
    upstream: null,
    ahead: 0,
    behind: 0,
    ...overrides,
  };
}

test("local branch rows switch, current branch does nothing", () => {
  const main = branch("main", { isCurrent: true });
  const feature = branch("feature/x");

  expect(planBranchActivation(main, [main, feature]).kind).toBe("already-current");
  expect(planBranchActivation(feature, [main, feature])).toEqual({
    kind: "switch-local",
    branch: feature,
  });
});

test("remote branch without a tracking local plans a tracking checkout", () => {
  const remote = branch("origin/feature/x", { isRemote: true });
  const plan = planBranchActivation(remote, [branch("main", { isCurrent: true }), remote]);

  expect(plan).toEqual({ kind: "create-tracking", remote, localName: "feature/x" });
});

test("remote branch ahead of its tracking local plans a fast-forward", () => {
  const remote = branch("origin/main", { isRemote: true });
  const local = branch("main", { isCurrent: true, upstream: "origin/main", behind: 3 });
  const plan = planBranchActivation(remote, [local, remote]);

  expect(plan).toEqual({ kind: "fast-forward", remote, local, behind: 3 });
});

test("diverged tracking local refuses the fast-forward", () => {
  const remote = branch("origin/main", { isRemote: true });
  const local = branch("main", { isCurrent: true, upstream: "origin/main", ahead: 2, behind: 3 });

  expect(planBranchActivation(remote, [local, remote])).toEqual({
    kind: "diverged",
    remote,
    local,
    ahead: 2,
    behind: 3,
  });
});

test("synced tracking local reports nothing to fast-forward", () => {
  const remote = branch("origin/main", { isRemote: true });
  const local = branch("main", { isCurrent: true, upstream: "origin/main", ahead: 1 });

  expect(planBranchActivation(remote, [local, remote])).toEqual({
    kind: "already-synced",
    remote,
    local,
    ahead: 1,
  });
});

test("a same-name local without tracking config still resolves and defers to git", () => {
  const remote = branch("origin/feature/x", { isRemote: true });
  const local = branch("feature/x", { upstream: "origin/other", ahead: 4, behind: 9 });

  expect(findTrackingLocalBranch(remote, [local, remote])).toBe(local);
  expect(planBranchActivation(remote, [local, remote])).toEqual({
    kind: "fast-forward",
    remote,
    local,
    behind: 0,
  });
});

test("a remote ref without a branch segment cannot become a local branch", () => {
  const remote = branch("origin", { isRemote: true });
  const plan = planBranchActivation(remote, [remote]);

  expect(plan).toEqual({ kind: "create-tracking", remote, localName: "" });
});
