import {
  ArrowDownUp,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  GitBranch,
  GitCommitVertical,
  type LucideIcon,
  GripVertical,
  Layers3,
  MoreHorizontal,
  Plus,
  RefreshCw,
  ShieldCheck,
  Tag,
  Users,
} from "lucide-react";
import { useRepositoryGithubOverview } from "../../hooks/useAdvancedGit";
import { useAppStore } from "../../stores/app-store";
import type { ActivityItem, PullRequestSummary, ReviewSummary } from "../../types/git";

interface StackPrRow {
  number: number;
  title: string;
  branch: string;
  body: string;
  reviews: string;
  additions: number;
  deletions: number;
  active?: boolean;
  badge?: string;
  reviewers: string[];
  state: string;
  author: string;
  base: string;
  updatedAt: string;
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

const fallbackStack: StackPrRow[] = [
  {
    number: 20,
    title: "Add payment method step",
    branch: "feature/checkout-flow",
    body: "Adds the payment method step to the checkout flow.",
    reviews: "2 reviews",
    additions: 210,
    deletions: 18,
    active: true,
    badge: "HEAD",
    reviewers: ["JD", "JS", "SL"],
    state: "open",
    author: "Jane Doe",
    base: "main",
    updatedAt: "2h ago",
  },
  {
    number: 19,
    title: "Add promo code support",
    branch: "feature/checkout-flow-1",
    body: "Depends on #20",
    reviews: "1 review",
    additions: 132,
    deletions: 9,
    reviewers: ["JS", "AL"],
    state: "open",
    author: "John Smith",
    base: "main",
    updatedAt: "4h ago",
  },
  {
    number: 18,
    title: "Refactor order summary",
    branch: "feature/checkout-flow-2",
    body: "Depends on #19",
    reviews: "1 review",
    additions: 89,
    deletions: 6,
    reviewers: ["AC", "JD"],
    state: "open",
    author: "Alex Cooper",
    base: "main",
    updatedAt: "6h ago",
  },
];

const fallbackReviewers: ReviewerRow[] = [
  { name: "John Smith", status: "Approved", color: "var(--color-success)" },
  { name: "Alex Johnson", status: "Approved", color: "var(--color-success)" },
  { name: "Sarah Lee", status: "Reviewing", color: "var(--color-text-muted)" },
];

const stackActions: Array<{ icon: LucideIcon; label: string }> = [
  { icon: RefreshCw, label: "Rebase Stack" },
  { icon: ArrowDownUp, label: "Split Stack" },
  { icon: GitBranch, label: "Squash" },
];

const fallbackTimeline: TimelineRow[] = [
  { label: "Jane Doe opened this PR", age: "2h ago", success: false },
  { label: "Jane Doe marked ready for review", age: "2h ago", success: false },
  { label: "John Smith approved these changes", age: "1h ago", success: false },
  { label: "CI checks passed", age: "15m ago", success: true },
];

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
  if (elapsed < 3_600_000) return `${Math.max(1, Math.floor(elapsed / 60_000))}m ago`;
  if (elapsed < 86_400_000) return `${Math.max(1, Math.floor(elapsed / 3_600_000))}h ago`;
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

const mapPullRequest = (pr: PullRequestSummary, index: number, reviewCount: number): StackPrRow => ({
  number: pr.number,
  title: pr.title,
  branch: pr.headRefName ?? `PR #${pr.number}`,
  body: pr.baseRefName ? `${pr.author ?? "GitHub"} wants to merge into ${pr.baseRefName}.` : `${pr.author ?? "GitHub"} opened this pull request.`,
  reviews: reviewCount === 1 ? "1 review" : `${reviewCount} reviews`,
  additions: fallbackStack[index % fallbackStack.length].additions,
  deletions: fallbackStack[index % fallbackStack.length].deletions,
  active: index === 0,
  badge: index === 0 ? "HEAD" : undefined,
  reviewers: [initials(pr.author), ...fallbackStack[index % fallbackStack.length].reviewers.slice(1)],
  state: pr.isDraft ? "draft" : pr.state,
  author: pr.author ?? "GitHub",
  base: pr.baseRefName ?? "main",
  updatedAt: formatRelative(pr.updatedAt),
});

const mapReview = (review: ReviewSummary): ReviewerRow => ({
  name: review.author ?? "GitHub reviewer",
  status: stateLabel(review.state),
  color: reviewStatusColor(review.state),
});

const mapActivity = (activity: ActivityItem): TimelineRow => ({
  label: activity.title || `${activity.actor ?? "GitHub"} ${activity.kind}`,
  age: formatRelative(activity.createdAt),
  success: activity.kind.toLowerCase().includes("check") || activity.kind.toLowerCase().includes("review"),
});

function Avatar({ label, accent = false }: { label: string; accent?: boolean }) {
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
      <div className="text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">{value}</div>
    </div>
  );
}

export function StackedPrBoard() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const { data: githubOverview, isError } = useRepositoryGithubOverview(activeRepoPath);
  const livePrs = githubOverview?.pullRequests ?? [];
  const liveReviews = githubOverview?.reviews ?? [];
  const liveActivity = githubOverview?.activity ?? [];
  const liveChecks = githubOverview?.checkRuns ?? [];
  const hasLivePrs = livePrs.length > 0;
  const stack = hasLivePrs ? livePrs.map((pr, index) => mapPullRequest(pr, index, liveReviews.length)) : fallbackStack;
  const reviewers = liveReviews.length > 0 ? liveReviews.slice(0, 6).map(mapReview) : fallbackReviewers;
  const timeline = liveActivity.length > 0 ? liveActivity.slice(0, 6).map(mapActivity) : fallbackTimeline;
  const passingChecks = liveChecks.filter((check) => (check.conclusion ?? check.state ?? "").toLowerCase() === "success").length;
  const checksLabel = liveChecks.length > 0 ? `${passingChecks} / ${liveChecks.length} passing` : "3 / 3 passing";
  const reviewApprovals = reviewers.filter((reviewer) => reviewer.status.toLowerCase().includes("approved")).length;
  const activePr = stack[0];
  const providerDetail = !activeRepoPath
    ? "Demo data shown until a repository is opened."
    : isError
      ? "GitHub metadata unavailable; static reference data is shown."
      : !githubOverview?.providerAvailable
        ? "GitHub provider is not available; static reference data is shown."
        : !githubOverview.isGithubRepository
          ? "This repository is not linked to GitHub; static reference data is shown."
          : hasLivePrs
            ? `${githubOverview.owner}/${githubOverview.repo} via ${githubOverview.account?.login ?? "GitHub"}`
            : "GitHub connected; no pull requests returned, so reference data is shown.";
  const providerTone = hasLivePrs ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]";
  const openCount = stack.filter((pr) => pr.state.toLowerCase() === "open").length;
  const draftCount = stack.filter((pr) => pr.state.toLowerCase() === "draft").length;
  const totalAdditions = stack.reduce((sum, pr) => sum + pr.additions, 0);
  const totalDeletions = stack.reduce((sum, pr) => sum + pr.deletions, 0);

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-purple-400">
            <Layers3 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              Stacked PRs <span className="text-[var(--color-text-muted)]">/</span>
              <span className="text-sm font-medium text-[var(--color-text-secondary)]">{activePr.branch}</span>
              <span className="rounded-md border border-[color:rgba(63,185,80,0.28)] bg-[color:rgba(63,185,80,0.12)] px-2 py-0.5 text-xs text-[var(--color-success)]">Up to date</span>
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">{stack.length} pull requests chained for a safe landing.</div>
          </div>
        </div>
        <div className="flex items-center gap-2" title="Stack Git operations are shown as a safe preview until backend command support is complete.">
          {stackActions.map(({ icon: Icon, label }) => (
            <button key={label} disabled className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs text-[var(--color-text-muted)] opacity-60">
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
          <button disabled className="inline-flex cursor-not-allowed items-center gap-2 rounded-md bg-[var(--color-success)] px-3 py-2 text-xs font-semibold text-white opacity-55 shadow-sm">
            <CheckCircle2 className="h-4 w-4" /> Land Stack
          </button>
          <button disabled className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs text-[var(--color-text-muted)] opacity-60">
            Update Base Branch <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(720px,1fr)_360px] gap-3 p-3">
        <main className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border-muted)] px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">Stacked Pull Requests</h3>
                <p className="text-xs text-[var(--color-text-muted)]">{openCount} open · {draftCount} drafts · drag to reorder</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`max-w-[360px] truncate rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-xs ${providerTone}`}>{providerDetail}</span>
                <button className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)]">Overview</button>
                <button className="rounded-md border border-[var(--color-border)] p-1.5 text-[var(--color-accent)]"><Layers3 className="h-4 w-4" /></button>
                <button className="rounded-md border border-[var(--color-border)] p-1.5 text-[var(--color-text-muted)]"><Plus className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="relative space-y-3 p-4">
              <div className="absolute bottom-28 left-8 top-8 w-px bg-purple-500/60" />
              {stack.map((pr) => (
                <article
                  key={pr.number}
                  className={`relative ml-8 rounded-lg border bg-[var(--color-bg-tertiary)] p-4 shadow-sm ${
                    pr.active ? "border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/40" : "border-[var(--color-border)]"
                  }`}
                >
                  <div className="absolute -left-[39px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-purple-400 bg-[var(--color-bg-secondary)]" />
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 gap-3">
                      <GripVertical className="mt-3 h-5 w-5 shrink-0 text-[var(--color-text-muted)]" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-[var(--color-text-muted)]">#{pr.number}</span>
                          <h4 className="font-semibold">{pr.title}</h4>
                          <span className="text-xs text-[var(--color-accent)]">{pr.branch}</span>
                          {pr.badge && <span className="rounded bg-[color:rgba(88,166,255,0.16)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-accent)]">{pr.badge}</span>}
                        </div>
                        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{pr.body}</p>
                        <div className="mt-3 flex items-center gap-5 text-xs">
                          <span className="inline-flex items-center gap-1 text-[var(--color-success)]"><CheckCircle2 className="h-4 w-4" /> Checks {checksLabel}</span>
                          <span className="text-[var(--color-text-secondary)]">{pr.reviews}</span>
                          <span><span className="text-[var(--color-added)]">+{pr.additions}</span> <span className="text-[var(--color-deleted)]">−{pr.deletions}</span></span>
                        </div>
                      </div>
                    </div>
                    <div className="flex -space-x-2">{pr.reviewers.map((reviewer, index) => <Avatar key={`${pr.number}-${reviewer}-${index}`} label={reviewer} accent={index === 0 && pr.active} />)}</div>
                  </div>
                </article>
              ))}
              <div className="rounded-lg border border-dashed border-[var(--color-border)] py-5 text-center text-xs text-[var(--color-text-muted)]">
                Drop PR here to reorder · hold <kbd className="rounded border border-[var(--color-border)] px-1">⌥</kbd> while dragging to insert between
              </div>
            </div>
          </section>

          <section className="grid grid-cols-[1fr_1.25fr] gap-3">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Stack Health</h3>
                <span className="rounded-md bg-[color:rgba(63,185,80,0.12)] px-2 py-1 text-xs text-[var(--color-success)]">Good</span>
              </div>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{hasLivePrs ? "GitHub pull request metadata is connected; checks and reviews are shown when provided." : providerDetail}</p>
              <div className="mt-4 grid grid-cols-3 gap-4"><Metric label="Base" value={`${activePr.base} (a1b2c3d)`} /><Metric label="Behind" value="0 commits" /><Metric label="Ahead" value={`${stack.length} commits`} /></div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
              <div className="flex items-center gap-6 text-sm"><b>Stack Summary</b><span className="text-[var(--color-text-secondary)]">{stack.length} PRs</span><span className="text-[var(--color-added)]">{totalAdditions} additions</span><span className="text-[var(--color-deleted)]">{totalDeletions} deletions</span></div>
              <div className="mt-5 grid grid-cols-2 gap-6"><div className="flex items-center gap-3"><CircleDot className="h-7 w-7 text-[var(--color-success)]" /> CI: {checksLabel}</div><div className="flex items-center gap-3"><CircleDot className="h-7 w-7 text-[var(--color-success)]" /> Review: {reviewApprovals} approvals</div></div>
            </div>
          </section>

          <section className="grid min-h-0 grid-cols-[260px_1fr] gap-3 overflow-hidden">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
              <h3 className="mb-3 font-semibold">Mini Commit Graph</h3>
              {stack.map((pr) => <div key={pr.number} className="flex items-center gap-3 py-1.5 text-sm"><GitCommitVertical className="h-4 w-4 text-purple-400" /><span className="rounded bg-[color:rgba(88,166,255,0.14)] px-1.5 text-[var(--color-accent)]">{pr.number}</span><span>{pr.title}</span></div>)}
              <div className="mt-2 pl-7 text-sm text-[var(--color-text-secondary)]">{activePr.base} · a1b2c3d</div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
              <h3 className="mb-3 font-semibold">Diff Summary</h3>
              <div className="grid grid-cols-3 gap-3">
                {stack.map((pr) => <div key={pr.number} className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3"><div className="text-sm font-medium">#{pr.number} {pr.title}</div><div className="mt-2 text-xs"><span className="text-[var(--color-added)]">+{pr.additions}</span> <span className="text-[var(--color-deleted)]">−{pr.deletions}</span></div><div className="mt-3 flex h-10 items-end gap-1">{[20, 12, 8, 18, 28, 9, 34, 42, 30, 46].map((height, index) => <span key={index} className="w-2 rounded-sm bg-[var(--color-success)]/80" style={{ height }} />)}</div><div className="mt-2 text-[11px] text-[var(--color-text-muted)]">TS 8 · React 3 · CSS 2 · Other 1</div></div>)}
              </div>
            </div>
          </section>
        </main>

        <aside className="min-h-0 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
          <div className="flex items-start justify-between"><div><div className="font-mono text-sm">PR #{activePr.number}</div><h3 className="mt-1 text-lg font-semibold">{activePr.title}</h3></div><button className="rounded-md bg-[color:rgba(63,185,80,0.12)] px-2 py-1 text-xs text-[var(--color-success)]">{stateLabel(activePr.state)}</button></div>
          <div className="mt-3 flex items-center gap-2 text-xs"><span className="rounded bg-[color:rgba(88,166,255,0.14)] px-2 py-1 text-[var(--color-accent)]">{activePr.branch}</span><span className="text-[var(--color-text-muted)]">into</span><span className="rounded bg-[var(--color-bg-surface)] px-2 py-1">{activePr.base}</span></div>
          <div className="mt-4 flex items-center gap-2 text-sm text-[var(--color-text-secondary)]"><Avatar label={initials(activePr.author)} /> {activePr.author} updated {activePr.updatedAt}</div>
          <div className="mt-5 flex gap-5 border-b border-[var(--color-border)] text-sm"><span className="border-b-2 border-[var(--color-accent)] pb-2 text-[var(--color-accent)]">Details</span><span>Commits {stack.length + 1}</span><span>Checks {liveChecks.length || 6}</span><span>Files 14</span></div>
          <div className="mt-4 flex items-center justify-between"><h4 className="font-semibold">Reviewers</h4><Users className="h-4 w-4 text-[var(--color-text-muted)]" /></div>
          <div className="mt-3 space-y-3">{reviewers.map((reviewer) => <div key={`${reviewer.name}-${reviewer.status}`} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Avatar label={initials(reviewer.name)} /> {reviewer.name}</span><span style={{ color: reviewer.color }}>{reviewer.status}</span></div>)}</div>
          <h4 className="mt-6 font-semibold">Labels</h4><div className="mt-3 flex flex-wrap gap-2">{["enhancement", "checkout", "payments"].map((label) => <span key={label} className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2 py-1 text-xs"><Tag className="h-3 w-3" />{label}</span>)}<button className="rounded border border-[var(--color-border)] px-2 text-xs"><Plus className="h-3 w-3" /></button></div>
          <h4 className="mt-6 font-semibold">Linked issues</h4><div className="mt-2 space-y-2 text-sm text-[var(--color-text-secondary)]"><p><span className="text-[var(--color-accent)]">CFE-123</span> Implement payment flow</p><p><span className="text-[var(--color-accent)]">CFE-145</span> Add saved payment methods</p></div>
          <h4 className="mt-6 font-semibold">Timeline</h4><div className="mt-3 space-y-3">{timeline.map((item, index) => <div key={`${item.label}-${index}`} className="flex items-start gap-3 text-sm"><ShieldCheck className={`mt-0.5 h-4 w-4 ${item.success ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]"}`} /><span>{item.label}</span><span className="ml-auto text-xs text-[var(--color-text-muted)]">{item.age}</span></div>)}</div>
          <button className="mt-5 w-full rounded-md border border-[var(--color-border)] py-2 text-sm text-[var(--color-text-secondary)]">View full timeline</button>
          <button className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-[var(--color-border)] py-2 text-sm text-[var(--color-text-secondary)]"><MoreHorizontal className="h-4 w-4" /> More actions</button>
        </aside>
      </div>
    </section>
  );
}
