import { useEffect } from "react";
import {
  CheckCircle2,
  CircleDot,
  GitBranch,
  GitCommitVertical,
  GripVertical,
  Layers3,
  MoreHorizontal,
  RefreshCw,
  ShieldCheck,
  Tag,
  Users,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { gitApi } from "../../lib/tauri-api";
import { useAppStore } from "../../stores/app-store";
import type {
  ActivityItem,
  LabelSummary,
  PullRequestSummary,
  ReviewRequestSummary,
  ReviewSummary,
} from "../../types/git";

interface StackPrRow {
  number: number;
  title: string;
  branch: string;
  body: string;
  active?: boolean;
  badge?: string;
  state: string;
  author: string;
  base: string;
  updatedAt: string;
  url: string | null;
  labels: LabelSummary[];
  reviewRequests: ReviewRequestSummary[];
  reviewDecision: string | null;
  mergeStateStatus: string | null;
}

interface ReviewerRow {
  name: string;
  status: string;
  color: string;
}

interface TimelineRow {
  label: string;
  age: string;
  success: boolean;
}

const initials = (value: string | null | undefined) => {
  if (!value) return "GH";
  const parts = value.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const formatRelative = (value: string | null | undefined) => {
  if (!value) return "recently";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  const elapsed = Date.now() - timestamp;
  if (elapsed < 60_000) return "just now";
  if (elapsed < 3_600_000)
    return `${Math.max(1, Math.floor(elapsed / 60_000))}m ago`;
  if (elapsed < 86_400_000)
    return `${Math.max(1, Math.floor(elapsed / 3_600_000))}h ago`;
  return `${Math.max(1, Math.floor(elapsed / 86_400_000))}d ago`;
};

const stateLabel = (state: string | null | undefined) => {
  if (!state) return "Open";
  return `${state.slice(0, 1).toUpperCase()}${state.slice(1).toLowerCase()}`;
};

const reviewStatusColor = (state: string) => {
  const normalized = state.toLowerCase();
  if (normalized.includes("approved")) return "var(--color-success)";
  if (normalized.includes("changes")) return "var(--color-danger)";
  return "var(--color-text-muted)";
};

const mapPullRequest = (pr: PullRequestSummary): StackPrRow => ({
  number: pr.number,
  title: pr.title,
  branch: pr.headRefName ?? `PR #${pr.number}`,
  body: pr.baseRefName
    ? `${pr.author ?? "GitHub"} wants to merge into ${pr.baseRefName}.`
    : `${pr.author ?? "GitHub"} opened this pull request.`,
  state: pr.isDraft ? "draft" : pr.state,
  author: pr.author ?? "GitHub",
  base: pr.baseRefName ?? "—",
  updatedAt: formatRelative(pr.updatedAt),
  url: pr.url,
  labels: pr.labels,
  reviewRequests: pr.reviewRequests,
  reviewDecision: pr.reviewDecision,
  mergeStateStatus: pr.mergeStateStatus,
});

function deriveLandingOrder(prs: StackPrRow[]) {
  const remaining = new Map(prs.map((pr) => [pr.branch, pr]));
  const ordered: StackPrRow[] = [];

  while (remaining.size > 0) {
    const next = [...remaining.values()].find((pr) => !remaining.has(pr.base));
    if (!next) {
      return [];
    }
    ordered.push(next);
    remaining.delete(next.branch);
  }

  return ordered;
}

function stackLandingSafetyProblems(prs: StackPrRow[]) {
  return prs.flatMap((pr) => {
    const problems: string[] = [];
    const reviewState = (pr.reviewDecision ?? "").toLowerCase();
    const mergeState = (pr.mergeStateStatus ?? "").toLowerCase();
    if (pr.state.toLowerCase() === "draft") {
      problems.push(`#${pr.number} is still a draft.`);
    }
    if (reviewState !== "approved") {
      problems.push(`#${pr.number} review state is ${pr.reviewDecision ?? "unknown"}.`);
    }
    if (mergeState !== "clean") {
      problems.push(`#${pr.number} merge state is ${pr.mergeStateStatus ?? "unknown"}.`);
    }

    return problems;
  });
}

function formatStackLandingPreflight(prs: StackPrRow[]) {
  const rows = prs
    .map((pr, index) => `${index + 1}. #${pr.number} ${pr.branch} → ${pr.base}\n   review: ${pr.reviewDecision ?? "unknown"}; merge: ${pr.mergeStateStatus ?? "unknown"}; state: ${pr.state}`)
    .join("\n");

  return `Squash-merge ${prs.length} pull requests in dependency order?\n\nMerge method: squash\nDelete branches: no\nAdmin bypass: no\n\n${rows}\n\nRefresh the stack if any PR changed since this preflight.`;
}

const mapReview = (review: ReviewSummary): ReviewerRow => ({
  name: review.author ?? "GitHub reviewer",
  status: stateLabel(review.state),
  color: reviewStatusColor(review.state),
});

const mapActivity = (activity: ActivityItem): TimelineRow => ({
  label: activity.title || `${activity.actor ?? "GitHub"} ${activity.kind}`,
  age: formatRelative(activity.createdAt),
  success:
    activity.kind.toLowerCase().includes("check") ||
    activity.kind.toLowerCase().includes("review"),
});

function Avatar({
  label,
  accent = false,
}: {
  label: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`grid h-8 w-8 place-items-center rounded-full border text-[11px] font-semibold shadow-sm ${
        accent
          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
          : "border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]"
      }`}
    >
      {label}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">
        {value}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-text-muted)]">
      {message}
    </div>
  );
}

export function StackedPrBoard() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const selectedPullRequestId = useAppStore((s) => s.selectedPullRequestId);
  const setSelectedPullRequestId = useAppStore(
    (s) => s.setSelectedPullRequestId,
  );
  const setActiveView = useAppStore((s) => s.setActiveView);
  const queryClient = useQueryClient();
  const {
    data: githubOverview,
    isError,
    refetch: refetchGithubOverview,
  } = useQuery(gitQueries.githubOverview(activeRepoPath));

  useEffect(() => {
    if (!activeRepoPath) return;
    return () => {
      void gitApi.cancelRepositoryGithubWork(activeRepoPath);
    };
  }, [activeRepoPath]);
  const prActions = {
    checkout: useMutation(
      gitMutations.checkoutPullRequest(queryClient, activeRepoPath),
    ),
    updateBranch: useMutation(
      gitMutations.updatePullRequestBranch(queryClient, activeRepoPath),
    ),
    merge: useMutation(
      gitMutations.mergePullRequest(queryClient, activeRepoPath),
    ),
  };
  const livePrs = githubOverview?.pullRequests ?? [];
  const selectedPrNumber = selectedPullRequestId
    ? Number(selectedPullRequestId)
    : null;
  const defaultPrNumber = livePrs[0]?.number ?? null;
  const activePrNumber = livePrs.some((pr) => pr.number === selectedPrNumber)
    ? selectedPrNumber
    : defaultPrNumber;
  const stack = livePrs.map((pr) => {
    const row = mapPullRequest(pr);
    const active = row.number === activePrNumber;
    return { ...row, active, badge: active ? "Selected" : undefined };
  });
  const stackLandingCandidates = stack.filter((pr) => ["open", "draft"].includes(pr.state.toLowerCase()));
  const stackLandingOrder = deriveLandingOrder(stackLandingCandidates);
  const canLandStack =
    stackLandingOrder.length > 1 &&
    stackLandingOrder.length === stackLandingCandidates.length;
  const stackLandingBlocked =
    stackLandingCandidates.length > 1 && stackLandingOrder.length !== stackLandingCandidates.length;
  const stackLandingSafetyIssues = canLandStack
    ? stackLandingSafetyProblems(stackLandingOrder)
    : [];
  const canSafelyLandStack = canLandStack && stackLandingSafetyIssues.length === 0;
  const {
    data: activePrDiff,
    isLoading: activePrDiffLoading,
    error: activePrDiffError,
  } = useQuery(gitQueries.pullRequestDiff(activeRepoPath, activePrNumber));
  const reviewers = (activePrDiff?.reviews ?? []).slice(0, 6).map(mapReview);
  const timeline = (activePrDiff?.activity ?? []).slice(0, 6).map(mapActivity);
  const activeChecks = activePrDiff?.checkRuns ?? [];
  const passingChecks = activeChecks.filter(
    (check) =>
      (check.conclusion ?? check.state ?? "").toLowerCase() === "success",
  ).length;
  const checksLabel =
    activePrDiffLoading
      ? "Loading checks…"
      : activePrDiffError
        ? "Checks unavailable"
        : activeChecks.length > 0
          ? `${passingChecks} / ${activeChecks.length} passing`
          : "No checks reported";
  const reviewApprovals = reviewers.filter((reviewer) =>
    reviewer.status.toLowerCase().includes("approved"),
  ).length;
  const activePr = stack.find((pr) => pr.active) ?? stack[0] ?? null;
  useEffect(() => {
    if (activePr && selectedPullRequestId !== String(activePr.number)) {
      setSelectedPullRequestId(String(activePr.number));
    }
  }, [activePr, selectedPullRequestId, setSelectedPullRequestId]);
  const providerDetail = !activeRepoPath
    ? "Open a repository to load GitHub pull requests."
    : isError
      ? "GitHub metadata unavailable."
      : !githubOverview?.providerAvailable
        ? "GitHub provider is not available."
        : !githubOverview.isGithubRepository
          ? "This repository is not linked to GitHub."
          : stack.length > 0
            ? `${githubOverview.owner}/${githubOverview.repo} via ${githubOverview.account?.login ?? "GitHub"}`
            : "GitHub connected; no pull requests returned.";
  const providerTone =
    stack.length > 0
      ? "text-[var(--color-success)]"
      : "text-[var(--color-text-muted)]";
  const openCount = stack.filter(
    (pr) => pr.state.toLowerCase() === "open",
  ).length;
  const draftCount = stack.filter(
    (pr) => pr.state.toLowerCase() === "draft",
  ).length;
  const prActionPending =
    prActions.checkout.isPending ||
    prActions.updateBranch.isPending ||
    prActions.merge.isPending;
  const prActionError =
    prActions.checkout.error ??
    prActions.updateBranch.error ??
    prActions.merge.error;
  const handleCheckout = () => {
    if (activePr) prActions.checkout.mutate(activePr.number);
  };
  const handleUpdateBranch = () => {
    if (activePr) prActions.updateBranch.mutate(activePr.number);
  };
  const handleMergeSelected = () => {
    if (
      activePr &&
      window.confirm(
        `Squash-merge PR #${activePr.number} and delete its branch?`,
      )
    ) {
      prActions.merge.mutate({ number: activePr.number, method: "squash" });
    }
  };
  const handleOpenReviewStudio = () => {
    if (!activePr) return;
    setSelectedPullRequestId(String(activePr.number));
    setActiveView("review-studio");
  };

  const handleLandStack = async () => {
    if (!canSafelyLandStack) {
      const details = stackLandingBlocked
        ? "Cannot derive a linear stack from PR head/base branches."
        : stackLandingSafetyIssues.join("\n");
      window.alert(`Cannot land stack yet.\n\n${details}`);
      return;
    }
    if (!window.confirm(formatStackLandingPreflight(stackLandingOrder))) {
      return;
    }
    for (const pr of stackLandingOrder) {
      await prActions.merge.mutateAsync({
        number: pr.number,
        method: "squash",
        admin: false,
        deleteBranch: false,
      });
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-purple-400">
            <Layers3 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              Stacked PRs{" "}
              <span className="text-[var(--color-text-muted)]">/</span>
              <span className="text-sm font-medium text-[var(--color-text-secondary)]">
                {activePr?.branch ?? "No pull request selected"}
              </span>
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {stack.length} pull request{stack.length === 1 ? "" : "s"} from
              GitHub.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={!activePr || prActionPending}
            onClick={handleUpdateBranch}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" /> Update Branch
          </button>
          <button
            disabled={!activePr || prActionPending}
            onClick={handleCheckout}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <GitBranch className="h-4 w-4" /> Checkout PR
          </button>
          <button
            disabled={!activePr || prActionPending}
            onClick={handleMergeSelected}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--color-success)] px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" /> Squash Merge PR
          </button>
          <button
            disabled={!canSafelyLandStack || prActionPending}
            onClick={() => void handleLandStack()}
            title={
              stackLandingBlocked
                ? "Cannot derive a linear stack from PR head/base branches."
                : stackLandingSafetyIssues.length > 0
                  ? stackLandingSafetyIssues.join(" ")
                : undefined
            }
            className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Layers3 className="h-4 w-4" /> Land Stack
          </button>
          {prActionError ? (
            <span className="max-w-[280px] truncate text-xs text-[var(--color-danger)]">
              {String(prActionError)}
            </span>
          ) : null}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(720px,1fr)_360px] gap-3 p-3">
        <main className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border-muted)] px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">Stacked Pull Requests</h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {openCount} open · {draftCount} drafts · live GitHub metadata
                  only
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`max-w-[360px] truncate rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-xs ${providerTone}`}
                >
                  {providerDetail}
                </span>
                <button
                  onClick={() => void refetchGithubOverview()}
                  className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)]"
                >
                  Refresh
                </button>
                <button
                  onClick={() => void refetchGithubOverview()}
                  className="rounded-md border border-[var(--color-border)] p-1.5 text-[var(--color-accent)]"
                >
                  <Layers3 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="relative space-y-3 p-4">
              {stack.length > 0 ? (
                <div className="absolute bottom-28 left-8 top-8 w-px bg-purple-500/60" />
              ) : null}
              {stack.map((pr) => (
                <article
                  key={pr.number}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedPullRequestId(String(pr.number))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ")
                      setSelectedPullRequestId(String(pr.number));
                  }}
                  className={`relative ml-8 cursor-pointer rounded-lg border bg-[var(--color-bg-tertiary)] p-4 shadow-sm transition-colors hover:bg-[var(--color-bg-hover)] ${
                    pr.active
                      ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/40"
                      : "border-[var(--color-border)]"
                  }`}
                >
                  <div className="absolute -left-[39px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-purple-400 bg-[var(--color-bg-secondary)]" />
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 gap-3">
                      <GripVertical className="mt-3 h-5 w-5 shrink-0 text-[var(--color-text-muted)]" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-[var(--color-text-muted)]">
                            #{pr.number}
                          </span>
                          <h4 className="font-semibold">{pr.title}</h4>
                          <span className="text-xs text-[var(--color-accent)]">
                            {pr.branch}
                          </span>
                          {pr.badge && (
                            <span className="rounded bg-[color:rgba(88,166,255,0.16)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-accent)]">
                              {pr.badge}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                          {pr.body}
                        </p>
                        <div className="mt-3 flex items-center gap-5 text-xs">
                          <span className="inline-flex items-center gap-1 text-[var(--color-success)]">
                            <CheckCircle2 className="h-4 w-4" /> {pr.mergeStateStatus ?? "Merge state unknown"}
                          </span>
                          <span className="text-[var(--color-text-secondary)]">
                            {pr.reviewDecision ?? "Review state unknown"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Avatar label={initials(pr.author)} accent={pr.active} />
                  </div>
                </article>
              ))}
              {stack.length === 0 ? (
                <EmptyState message={providerDetail} />
              ) : null}
            </div>
          </section>

          <section className="grid grid-cols-[1fr_1.25fr] gap-3">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Stack Health</h3>
                <span className="rounded-md bg-[var(--color-bg-surface)] px-2 py-1 text-xs text-[var(--color-text-muted)]">
                  Live only
                </span>
              </div>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                {stack.length > 0
                  ? "GitHub pull request metadata is connected; checks and reviews are shown when provided."
                  : providerDetail}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <Metric label="Base" value={activePr?.base ?? "—"} />
                <Metric label="Checks" value={checksLabel} />
                <Metric label="Reviews" value={`${reviewers.length}`} />
              </div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
              <div className="flex items-center gap-6 text-sm">
                <b>Stack Summary</b>
                <span className="text-[var(--color-text-secondary)]">
                  {stack.length} PRs
                </span>
                <span>{openCount} open</span>
                <span>{draftCount} draft</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-6">
                <div className="flex items-center gap-3">
                  <CircleDot className="h-7 w-7 text-[var(--color-success)]" />{" "}
                  Checks: {checksLabel}
                </div>
                <div className="flex items-center gap-3">
                  <CircleDot className="h-7 w-7 text-[var(--color-success)]" />{" "}
                  Review: {reviewApprovals} approvals
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3 text-xs text-[var(--color-text-secondary)]">
                Landing order:{" "}
                {canLandStack ? (
                  <span className="font-mono text-[var(--color-text-primary)]">
                    {stackLandingOrder.map((pr) => `#${pr.number}`).join(" → ")}
                  </span>
                ) : stackLandingBlocked ? (
                  <span className="text-[var(--color-warning)]">
                    head/base branches do not form a linear stack
                  </span>
                ) : (
                  <span className="text-[var(--color-text-muted)]">
                    need at least two open non-draft PRs
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="grid min-h-0 grid-cols-[260px_1fr] gap-3 overflow-hidden">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
              <h3 className="mb-3 font-semibold">PR List</h3>
              {stack.length > 0 ? (
                stack.map((pr) => (
                  <button
                    key={pr.number}
                    type="button"
                    onClick={() => setSelectedPullRequestId(String(pr.number))}
                    className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm ${pr.active ? "bg-[var(--color-bg-selected)]/15 text-[var(--color-accent)]" : "hover:bg-[var(--color-bg-hover)]"}`}
                  >
                    <GitCommitVertical className="h-4 w-4 text-purple-400" />
                    <span className="rounded bg-[color:rgba(88,166,255,0.14)] px-1.5 text-[var(--color-accent)]">
                      {pr.number}
                    </span>
                    <span className="truncate">{pr.title}</span>
                  </button>
                ))
              ) : (
                <EmptyState message="No pull requests available." />
              )}
              <div className="mt-2 pl-7 text-sm text-[var(--color-text-secondary)]">
                Base: {activePr?.base ?? "—"}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
              <h3 className="mb-3 font-semibold">Branch Relationships</h3>
              <div className="grid grid-cols-2 gap-3">
                {stack.length > 0 ? (
                  stack.map((pr) => (
                    <div
                      key={pr.number}
                      className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3"
                    >
                      <div className="text-sm font-medium">
                        #{pr.number} {pr.title}
                      </div>
                      <div className="mt-2 text-xs text-[var(--color-text-secondary)]">
                        <span className="text-[var(--color-accent)]">
                          {pr.branch}
                        </span>{" "}
                        into {pr.base}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2">
                    <EmptyState message="No head/base labels available." />
                  </div>
                )}
              </div>
            </div>
          </section>
        </main>

        <aside className="min-h-0 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
          {activePr ? (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-sm">PR #{activePr.number}</div>
                  <h3 className="mt-1 text-lg font-semibold">
                    {activePr.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleOpenReviewStudio}
                  className="rounded-md bg-[color:rgba(63,185,80,0.12)] px-2 py-1 text-xs text-[var(--color-success)] hover:bg-[color:rgba(63,185,80,0.2)]"
                >
                  {stateLabel(activePr.state)}
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <span className="rounded bg-[color:rgba(88,166,255,0.14)] px-2 py-1 text-[var(--color-accent)]">
                  {activePr.branch}
                </span>
                <span className="text-[var(--color-text-muted)]">into</span>
                <span className="rounded bg-[var(--color-bg-surface)] px-2 py-1">
                  {activePr.base}
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                <Avatar label={initials(activePr.author)} /> {activePr.author}{" "}
                updated {activePr.updatedAt}
              </div>
              <div className="mt-5 flex gap-5 border-b border-[var(--color-border)] text-sm">
                <span className="border-b-2 border-[var(--color-accent)] pb-2 text-[var(--color-accent)]">
                  Details
                </span>
                <span>PRs {stack.length}</span>
                <span>Checks {activeChecks.length}</span>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <h4 className="font-semibold">Reviewers</h4>
                <Users className="h-4 w-4 text-[var(--color-text-muted)]" />
              </div>
              <div className="mt-3 space-y-3">
                {reviewers.length > 0 ? (
                  reviewers.map((reviewer) => (
                    <div
                      key={`${reviewer.name}-${reviewer.status}`}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <Avatar label={initials(reviewer.name)} />{" "}
                        {reviewer.name}
                      </span>
                      <span style={{ color: reviewer.color }}>
                        {reviewer.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyState message={activePrDiffLoading ? "Loading selected PR reviews…" : activePrDiffError ? "Selected PR reviews unavailable." : "No reviews returned by GitHub for the selected PR."} />
                )}
              </div>
              <h4 className="mt-6 font-semibold">Labels</h4>
              <div className="mt-3">
                {activePr.labels.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {activePr.labels.map((label) => (
                      <span
                        key={label.name}
                        title={label.description ?? undefined}
                        className="rounded-full border px-2 py-1 text-xs"
                        style={{
                          borderColor: label.color
                            ? `#${label.color}`
                            : undefined,
                          color: label.color ? `#${label.color}` : undefined,
                        }}
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-[var(--color-text-muted)]">
                    <Tag className="mr-2 inline h-4 w-4" />
                    No labels returned by GitHub.
                  </div>
                )}
              </div>
              {activePr.reviewRequests.length > 0 ? (
                <>
                  <h4 className="mt-6 font-semibold">Requested reviewers</h4>
                  <div className="mt-3 space-y-2">
                    {activePr.reviewRequests.map((reviewer) => (
                      <div
                        key={`${reviewer.kind}-${reviewer.login}`}
                        className="flex items-center justify-between text-sm"
                      >
                        <span>{reviewer.login}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {reviewer.kind}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
              <h4 className="mt-6 font-semibold">Timeline</h4>
              <div className="mt-3 space-y-3">
                {timeline.length > 0 ? (
                  timeline.map((item, index) => (
                    <div
                      key={`${item.label}-${index}`}
                      className="flex items-start gap-3 text-sm"
                    >
                      <ShieldCheck
                        className={`mt-0.5 h-4 w-4 ${item.success ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]"}`}
                      />
                      <span>{item.label}</span>
                      <span className="ml-auto text-xs text-[var(--color-text-muted)]">
                        {item.age}
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyState message={activePrDiffLoading ? "Loading selected PR timeline…" : activePrDiffError ? "Selected PR timeline unavailable." : "No timeline activity returned by GitHub for the selected PR."} />
                )}
              </div>
              <button
                disabled={!activePr.url}
                onClick={() =>
                  activePr.url && window.open(activePr.url, "_blank")
                }
                className="mt-5 w-full rounded-md border border-[var(--color-border)] py-2 text-sm text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Open PR timeline on GitHub
              </button>
              <button
                onClick={() => void refetchGithubOverview()}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-[var(--color-border)] py-2 text-sm text-[var(--color-text-secondary)]"
              >
                <MoreHorizontal className="h-4 w-4" /> Refresh PR metadata
              </button>
            </>
          ) : (
            <EmptyState message="No pull request selected." />
          )}
        </aside>
      </div>
    </section>
  );
}
