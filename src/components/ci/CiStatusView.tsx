import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Clock3,
  ExternalLink,
  Filter,
  GitPullRequest,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { gitQueries } from "../../lib/git-data";
import {
  filterChecks,
  formatCheckDuration,
  groupChecksByWorkflow,
  summarizeChecks,
  type CheckBucket,
  type NormalizedCheckRun,
} from "../../lib/ci-status";
import { useAppStore } from "../../stores/app-store";
import type { PullRequestSummary } from "../../types/git";
import { EmptyState } from "../common/EmptyState";
import { ErrorCallout } from "../common/ErrorCallout";
import { LoadingSpinner } from "../common/LoadingSpinner";

const bucketFilters: Array<{ value: CheckBucket | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "fail", label: "Failing" },
  { value: "pending", label: "Pending" },
  { value: "pass", label: "Passing" },
  { value: "cancel", label: "Cancelled" },
  { value: "skipping", label: "Skipped" },
  { value: "unknown", label: "Unknown" },
];

const formatRelative = (value: string | null | undefined) => {
  if (!value) return "not reported";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  const elapsed = Date.now() - timestamp;
  if (elapsed < 60_000) return "just now";
  if (elapsed < 3_600_000) return `${Math.max(1, Math.floor(elapsed / 60_000))}m ago`;
  if (elapsed < 86_400_000) return `${Math.max(1, Math.floor(elapsed / 3_600_000))}h ago`;
  return `${Math.max(1, Math.floor(elapsed / 86_400_000))}d ago`;
};

const stateLabel = (value: string | null | undefined) => {
  if (!value) return "Unknown";
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
};

function bucketTone(bucket: CheckBucket) {
  if (bucket === "pass") return "text-[var(--color-success)]";
  if (bucket === "fail" || bucket === "cancel") return "text-[var(--color-danger)]";
  if (bucket === "pending") return "text-[var(--color-warning)]";
  return "text-[var(--color-text-muted)]";
}

function bucketIcon(bucket: CheckBucket) {
  if (bucket === "pass") return <CheckCircle2 className="h-4 w-4" />;
  if (bucket === "fail" || bucket === "cancel") return <XCircle className="h-4 w-4" />;
  if (bucket === "pending") return <Clock3 className="h-4 w-4" />;
  return <CircleDot className="h-4 w-4" />;
}

function SummaryCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${tone ?? "text-[var(--color-text-primary)]"}`}>
        {value}
      </div>
    </div>
  );
}

function PullRequestButton({
  pr,
  selected,
  onSelect,
}: {
  pr: PullRequestSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
        selected
          ? "border-[var(--color-accent)] bg-[var(--color-bg-selected)]/15"
          : "border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-hover)]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-[var(--color-text-muted)]">PR #{pr.number}</span>
        <span className="rounded bg-[var(--color-bg-surface)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]">
          {pr.isDraft ? "Draft" : stateLabel(pr.state)}
        </span>
      </div>
      <div className="mt-2 line-clamp-2 font-medium text-[var(--color-text-primary)]">
        {pr.title}
      </div>
      <div className="mt-2 truncate text-xs text-[var(--color-text-muted)]">
        {pr.headRefName ?? "head unavailable"} → {pr.baseRefName ?? "base unavailable"}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--color-text-secondary)]">
        <span>{pr.reviewDecision ?? "Review unknown"}</span>
        <span>·</span>
        <span>{pr.mergeStateStatus ?? "Merge unknown"}</span>
      </div>
    </button>
  );
}

function CheckRow({ check }: { check: NormalizedCheckRun }) {
  const openCheck = () => {
    if (check.url) {
      window.open(check.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <article className="grid grid-cols-[minmax(220px,1fr)_120px_120px_120px_36px] items-center gap-3 border-t border-[var(--color-border-muted)] px-4 py-3 text-sm first:border-t-0">
      <div className="min-w-0">
        <div className="truncate font-medium text-[var(--color-text-primary)]">
          {check.name}
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">
          {check.event ? <span>{stateLabel(check.event)}</span> : null}
          {check.description ? <span className="truncate">{check.description}</span> : null}
        </div>
      </div>
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${bucketTone(check.bucket)}`}>
        {bucketIcon(check.bucket)} {check.bucketLabel}
      </span>
      <span className="text-xs text-[var(--color-text-secondary)]">
        {stateLabel(check.state ?? check.conclusion)}
      </span>
      <span className="text-xs text-[var(--color-text-muted)]">
        {formatCheckDuration(check.durationMs)}
      </span>
      <button
        type="button"
        disabled={!check.url}
        onClick={openCheck}
        className="grid h-8 w-8 place-items-center rounded-md border border-[var(--color-border-muted)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={check.url ? `Open ${check.name}` : `${check.name} has no URL`}
      >
        <ExternalLink className="h-4 w-4" />
      </button>
    </article>
  );
}

export function CiStatusView() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const selectedPullRequestId = useAppStore((s) => s.selectedPullRequestId);
  const setSelectedPullRequestId = useAppStore((s) => s.setSelectedPullRequestId);
  const [checkFilter, setCheckFilter] = useState("");
  const [bucketFilter, setBucketFilter] = useState<CheckBucket | "all">("all");

  const overviewQuery = useQuery(gitQueries.githubOverview(activeRepoPath, Boolean(activeRepoPath)));
  const overview = overviewQuery.data;
  const pullRequests = overview?.pullRequests ?? [];
  const selectedPrNumber = selectedPullRequestId ? Number(selectedPullRequestId) : null;
  const selectedPr = pullRequests.find((pr) => pr.number === selectedPrNumber) ?? pullRequests[0] ?? null;

  useEffect(() => {
    if (!selectedPr) {
      if (selectedPullRequestId) setSelectedPullRequestId(null);
      return;
    }
    if (selectedPullRequestId !== String(selectedPr.number)) {
      setSelectedPullRequestId(String(selectedPr.number));
    }
  }, [selectedPr, selectedPullRequestId, setSelectedPullRequestId]);

  const prChecksQuery = useQuery(
    gitQueries.pullRequestDiff(activeRepoPath, selectedPr?.number ?? null, Boolean(selectedPr)),
  );

  const prChecks = prChecksQuery.data?.checkRuns ?? [];
  const headChecks = overview?.checkRuns ?? [];
  const visibleChecks = selectedPr ? prChecks : headChecks;
  const visibleSummary = useMemo(() => summarizeChecks(visibleChecks), [visibleChecks]);
  const filteredChecks = useMemo(
    () => filterChecks(visibleChecks, checkFilter, bucketFilter),
    [visibleChecks, checkFilter, bucketFilter],
  );
  const workflowGroups = useMemo(() => groupChecksByWorkflow(filteredChecks), [filteredChecks]);
  const providerLabel = overview?.owner && overview.repo ? `${overview.owner}/${overview.repo}` : "GitHub";
  const loadingChecks = selectedPr ? prChecksQuery.isLoading : overviewQuery.isLoading;
  const checkSource = selectedPr ? `PR #${selectedPr.number}` : "current branch";

  const refresh = () => {
    void overviewQuery.refetch();
    if (selectedPr) {
      void prChecksQuery.refetch();
    }
  };

  if (!activeRepoPath) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-8 w-8" />}
        title="Open a repository"
        description="CI status is scoped to the active GitHub-backed repository."
      />
    );
  }

  if (overviewQuery.isLoading) {
    return (
      <div className="grid h-full place-items-center bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)]">
        <div className="flex items-center gap-3 text-sm">
          <LoadingSpinner size="sm" />
          Loading GitHub check status…
        </div>
      </div>
    );
  }

  if (overviewQuery.error) {
    return (
      <div className="h-full overflow-auto bg-[var(--color-bg-primary)] p-6">
        <ErrorCallout message={`GitHub CI metadata unavailable: ${String(overviewQuery.error)}`} />
      </div>
    );
  }

  if (!overview?.providerAvailable || !overview.isGithubRepository) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-8 w-8" />}
        title="No GitHub CI provider"
        description="Add a GitHub origin remote and authenticate with gh to inspect workflow checks."
        action={
          <button
            type="button"
            onClick={refresh}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
          >
            <RefreshCw className="h-4 w-4" /> Check again
          </button>
        }
      />
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-success)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              CI Status <span className="text-[var(--color-text-muted)]">/</span>
              <span className="truncate text-sm font-medium text-[var(--color-text-secondary)]">
                {providerLabel}
              </span>
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              Live GitHub checks for {checkSource}; only the selected PR fetches detailed checks.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={overviewQuery.isFetching || prChecksQuery.isFetching}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${overviewQuery.isFetching || prChecksQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh checks
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] gap-3 p-3">
        <aside className="flex min-h-0 flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
          <div className="border-b border-[var(--color-border-muted)] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <GitPullRequest className="h-4 w-4" /> Pull requests
            </div>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Select one PR to load its check suite without fetching every PR diff.
            </p>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {pullRequests.length > 0 ? (
              pullRequests.map((pr) => (
                <PullRequestButton
                  key={pr.number}
                  pr={pr}
                  selected={selectedPr?.number === pr.number}
                  onSelect={() => setSelectedPullRequestId(String(pr.number))}
                />
              ))
            ) : (
              <EmptyState
                icon={<GitPullRequest className="h-7 w-7" />}
                title="No open pull requests"
                description="Repository branch checks are still shown when GitHub reports them."
                className="min-h-[260px]"
              />
            )}
          </div>
        </aside>

        <main className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <section className="grid grid-cols-5 gap-3">
            <SummaryCard label="Total" value={visibleSummary.total} />
            <SummaryCard label="Passing" value={visibleSummary.passing} tone="text-[var(--color-success)]" />
            <SummaryCard label="Blocking" value={visibleSummary.blocking} tone={visibleSummary.blocking > 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"} />
            <SummaryCard label="Pending" value={visibleSummary.pending} tone="text-[var(--color-warning)]" />
            <SummaryCard label="Result" value={visibleSummary.label} tone={bucketTone(visibleSummary.conclusion === "passing" ? "pass" : visibleSummary.conclusion === "failing" ? "fail" : visibleSummary.conclusion === "pending" ? "pending" : "unknown")} />
          </section>

          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-muted)] p-4">
              <div>
                <h3 className="font-semibold">Check runs</h3>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {selectedPr
                    ? `Detailed workflow checks for PR #${selectedPr.number}; updated ${formatRelative(selectedPr.updatedAt)}.`
                    : "Branch checks reported for the repository HEAD."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative block">
                  <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
                  <input
                    value={checkFilter}
                    onChange={(event) => setCheckFilter(event.target.value)}
                    placeholder="Filter checks"
                    className="h-9 w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] pl-8 pr-3 text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
                  />
                </label>
                <select
                  value={bucketFilter}
                  onChange={(event) => setBucketFilter(event.target.value as CheckBucket | "all")}
                  className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
                >
                  {bucketFilters.map((filter) => (
                    <option key={filter.value} value={filter.value}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="min-h-0 max-h-[calc(100vh-290px)] overflow-y-auto">
              {loadingChecks ? (
                <div className="flex items-center gap-3 p-6 text-sm text-[var(--color-text-secondary)]">
                  <LoadingSpinner size="sm" /> Loading checks for {checkSource}…
                </div>
              ) : prChecksQuery.error ? (
                <div className="p-4">
                  <ErrorCallout message={`Selected PR checks unavailable: ${String(prChecksQuery.error)}`} />
                </div>
              ) : workflowGroups.length > 0 ? (
                workflowGroups.map((group) => (
                  <section key={group.workflow} className="border-b border-[var(--color-border-muted)] last:border-b-0">
                    <div className="flex items-center justify-between bg-[var(--color-bg-tertiary)] px-4 py-2 text-xs">
                      <div className="flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
                        <ShieldCheck className={`h-4 w-4 ${bucketTone(group.summary.conclusion === "passing" ? "pass" : group.summary.conclusion === "failing" ? "fail" : group.summary.conclusion === "pending" ? "pending" : "unknown")}`} />
                        {group.workflow}
                      </div>
                      <span className="text-[var(--color-text-secondary)]">
                        {group.summary.label}
                      </span>
                    </div>
                    {group.checks.map((check) => (
                      <CheckRow key={`${group.workflow}:${check.name}:${check.url ?? check.state ?? "status"}`} check={check} />
                    ))}
                  </section>
                ))
              ) : visibleChecks.length > 0 ? (
                <EmptyState
                  icon={<Filter className="h-7 w-7" />}
                  title="No checks match the filter"
                  description="Clear the search text or bucket filter to show the current check suite."
                  className="min-h-[320px]"
                />
              ) : (
                <EmptyState
                  icon={<ShieldCheck className="h-7 w-7" />}
                  title="No checks reported"
                  description={selectedPr ? "GitHub returned no check runs for the selected pull request." : "GitHub returned no branch check runs for this repository."}
                  className="min-h-[320px]"
                />
              )}
            </div>
          </section>
        </main>
      </div>
    </section>
  );
}
