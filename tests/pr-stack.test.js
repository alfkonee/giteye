import { describe, expect, test } from "bun:test";
import {
  derivePullRequestLandingOrder,
  pullRequestLandingSafetyProblems,
} from "../src/lib/pr-stack";

const pullRequest = (number, head, base, overrides = {}) => ({
  number,
  title: `PR ${number}`,
  state: "open",
  isDraft: false,
  author: "author",
  url: null,
  headRefName: head,
  baseRefName: base,
  reviewDecision: "APPROVED",
  mergeStateStatus: "CLEAN",
  updatedAt: "2026-01-01T00:00:00Z",
  labels: [],
  reviewRequests: [],
  ...overrides,
});

describe("derivePullRequestLandingOrder", () => {
  test("orders a stack from the base branch upward", () => {
    const top = pullRequest(3, "feature-three", "feature-two");
    const root = pullRequest(1, "feature-one", "main");
    const middle = pullRequest(2, "feature-two", "feature-one");

    expect(
      derivePullRequestLandingOrder([top, root, middle]).map((pr) => pr.number),
    ).toEqual([1, 2, 3]);
  });

  test("rejects cycles and missing head branches", () => {
    expect(
      derivePullRequestLandingOrder([
        pullRequest(1, "feature-one", "feature-two"),
        pullRequest(2, "feature-two", "feature-one"),
      ]),
    ).toEqual([]);
    expect(
      derivePullRequestLandingOrder([pullRequest(1, null, "main")]),
    ).toEqual([]);
  });

  test("rejects unrelated and branching pull requests", () => {
    expect(
      derivePullRequestLandingOrder([
        pullRequest(1, "feature-one", "main"),
        pullRequest(2, "feature-two", "main"),
      ]),
    ).toEqual([]);
    expect(
      derivePullRequestLandingOrder([
        pullRequest(1, "feature-one", "main"),
        pullRequest(2, "feature-two", "feature-one"),
        pullRequest(3, "feature-three", "feature-one"),
      ]),
    ).toEqual([]);
  });
});

describe("pullRequestLandingSafetyProblems", () => {
  test("requires non-draft, approved, clean pull requests", () => {
    expect(
      pullRequestLandingSafetyProblems([
        pullRequest(1, "feature", "main", {
          isDraft: true,
          reviewDecision: "REVIEW_REQUIRED",
          mergeStateStatus: "BLOCKED",
        }),
      ]),
    ).toEqual([
      "#1 is still a draft.",
      "#1 review state is REVIEW_REQUIRED.",
      "#1 merge state is BLOCKED.",
    ]);
  });
});
