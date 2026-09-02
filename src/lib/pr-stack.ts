import type { PullRequestSummary } from "../types/git";

export function derivePullRequestLandingOrder(prs: PullRequestSummary[]) {
  if (prs.some((pr) => !pr.headRefName)) return [];
  const remaining = new Map(prs.map((pr) => [pr.headRefName!, pr]));
  if (remaining.size !== prs.length) return [];
  const roots = prs.filter(
    (pr) => !pr.baseRefName || !remaining.has(pr.baseRefName),
  );
  if (roots.length !== 1) return [];
  const ordered: PullRequestSummary[] = [];
  let current: PullRequestSummary | undefined = roots[0];

  while (current) {
    ordered.push(current);
    remaining.delete(current.headRefName!);
    if (remaining.size === 0) break;
    const children = [...remaining.values()].filter(
      (pr) => pr.baseRefName === current?.headRefName,
    );
    if (children.length !== 1) return [];
    current = children[0];
  }

  return ordered;
}

export function pullRequestLandingSafetyProblems(prs: PullRequestSummary[]) {
  return prs.flatMap((pr) => {
    const problems: string[] = [];
    const reviewState = (pr.reviewDecision ?? "").toLowerCase();
    const mergeState = (pr.mergeStateStatus ?? "").toLowerCase();
    if (pr.isDraft) problems.push(`#${pr.number} is still a draft.`);
    if (reviewState !== "approved") {
      problems.push(
        `#${pr.number} review state is ${pr.reviewDecision ?? "unknown"}.`,
      );
    }
    if (mergeState !== "clean") {
      problems.push(
        `#${pr.number} merge state is ${pr.mergeStateStatus ?? "unknown"}.`,
      );
    }
    return problems;
  });
}

export function formatPullRequestLandingPreflight(prs: PullRequestSummary[]) {
  const rows = prs
    .map(
      (pr, index) =>
        `${index + 1}. #${pr.number} ${pr.headRefName ?? "head unavailable"} → ${pr.baseRefName ?? "base unavailable"}\n   review: ${pr.reviewDecision ?? "unknown"}; merge: ${pr.mergeStateStatus ?? "unknown"}; state: ${pr.isDraft ? "draft" : pr.state}`,
    )
    .join("\n");

  return `Squash-merge ${prs.length} pull requests in dependency order?\n\nMerge method: squash\nDelete branches: no\nAdmin bypass: no\n\n${rows}\n\nRefresh PR metadata if any item changed since this preflight.`;
}
