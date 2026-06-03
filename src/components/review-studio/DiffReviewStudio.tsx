import {
  CheckCircle2,
  Circle,
  FileCode2,
  Filter,
  Folder,
  GitPullRequestArrow,
  MessageSquarePlus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { UnifiedDiffFallback } from "../diff-viewer/UnifiedDiffFallback";
import { usePullRequestDiff, useRepositoryGithubOverview } from "../../hooks/useAdvancedGit";
import { useAppStore } from "../../stores/app-store";
import type { ActivityItem, CheckRunSummary, PullRequestSummary, ReviewCommentSummary, ReviewSummary } from "../../types/git";

interface ReviewRow {
  name: string;
  state: string;
  isAuthor: boolean;
}

interface CheckRow {
  name: string;
  status: string;
  passed: boolean;
}

interface ActivityRow {
  author: string;
  message: string;
  age: string;
}

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

const statusFromCheck = (check: CheckRunSummary): CheckRow => {
  const normalized = (check.conclusion ?? check.state ?? "pending").toLowerCase();
  const passed = normalized === "success" || normalized === "completed";
  return {
    name: check.name,
    status: passed ? "Pass" : stateLabel(check.conclusion ?? check.state),
    passed,
  };
};

const reviewFromSummary = (review: ReviewSummary, author: string | null | undefined): ReviewRow => ({
  name: review.author ?? "GitHub reviewer",
  state: stateLabel(review.state),
  isAuthor: Boolean(author && review.author === author),
});

const activityFromSummary = (activity: ActivityItem): ActivityRow => ({
  author: activity.actor ?? "GitHub",
  message: activity.title || activity.kind,
  age: formatRelative(activity.createdAt),
});

const commentFromSummary = (comment: ReviewCommentSummary): ActivityRow => ({
  author: comment.author ?? "GitHub reviewer",
  message: comment.path ? `${comment.path}${comment.line ? `:${comment.line}` : ""} — ${comment.body}` : comment.body,
  age: formatRelative(comment.createdAt),
});

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-lg border border-dashed border-[var(--color-border)] p-5 text-center text-sm text-[var(--color-text-muted)]">{message}</div>;
}

function PrSummary({ pr }: { pr: PullRequestSummary }) {
  return (
    <div className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-[var(--color-text-muted)]">PR #{pr.number}</span>
        <span className="rounded bg-[var(--color-bg-surface)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]">{stateLabel(pr.isDraft ? "draft" : pr.state)}</span>
      </div>
      <div className="mt-2 font-medium">{pr.title}</div>
      <div className="mt-2 truncate text-xs text-[var(--color-text-muted)]">{pr.headRefName ?? "head unavailable"} into {pr.baseRefName ?? "base unavailable"}</div>
    </div>
  );
}

export function DiffReviewStudio() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const { data: githubOverview, isError } = useRepositoryGithubOverview(activeRepoPath);
  const livePrs = githubOverview?.pullRequests ?? [];
  const currentPr = livePrs[0] ?? null;
  const { data: prDiff, isLoading: prDiffLoading, error: prDiffError } = usePullRequestDiff(activeRepoPath, currentPr?.number ?? null);
  const parentPr = livePrs[1] ?? null;
  const checkRows = (githubOverview?.checkRuns ?? []).map(statusFromCheck);
  const reviewRows = (githubOverview?.reviews ?? []).map((review) => reviewFromSummary(review, currentPr?.author));
  const activityRows = [...(prDiff?.comments ?? []).map(commentFromSummary), ...(githubOverview?.activity ?? []).slice(0, 5).map(activityFromSummary)];
  const passingChecks = checkRows.filter((check) => check.passed).length;
  const providerDetail = !activeRepoPath
    ? "Open a repository to load GitHub review metadata."
    : isError
      ? "GitHub metadata unavailable."
      : !githubOverview?.providerAvailable
        ? "GitHub provider is not available."
        : !githubOverview.isGithubRepository
          ? "This repository is not linked to GitHub."
          : livePrs.length > 0
            ? `${githubOverview.owner}/${githubOverview.repo} via ${githubOverview.account?.login ?? "GitHub"}`
            : "GitHub connected; no pull requests returned.";
  const providerTone = livePrs.length > 0 ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]";
  const commentCount = activityRows.length + reviewRows.length;
  const changedFiles = prDiff?.files ?? [];
  const diffUnavailable = currentPr && !prDiffLoading && !prDiff && prDiffError;

  return (
    <section className="grid h-full min-h-0 grid-cols-[260px_minmax(650px,1fr)_300px] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <aside className="flex min-h-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <div className="border-b border-[var(--color-border)] p-3">
          <label className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2 py-2 text-xs text-[var(--color-text-muted)]">
            <Search className="h-4 w-4" /> Filter pull requests
          </label>
          <div className="mt-3 flex items-center justify-between text-xs"><span>{livePrs.length} pull requests</span><span className="rounded-full bg-[var(--color-bg-surface)] px-2 py-0.5 text-[var(--color-text-muted)]">live</span></div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="mb-2 flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-text-secondary)]"><Folder className="h-4 w-4" /> GitHub pull requests</div>
          <div className="space-y-2">{livePrs.length > 0 ? livePrs.map((pr) => <PrSummary key={pr.number} pr={pr} />) : <EmptyState message="No pull requests returned by GitHub." />}</div>
          <div className="mt-4 mb-2 flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-text-secondary)]"><FileCode2 className="h-4 w-4" /> Changed files</div>
          <div className="space-y-2">{changedFiles.length > 0 ? changedFiles.map((file) => <div key={file.path} className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] p-3 text-sm"><div className="truncate font-mono text-xs text-[var(--color-text-secondary)]">{file.path}</div><div className="mt-2 flex gap-3 text-xs"><span className="text-[var(--color-success)]">+{file.additions}</span><span className="text-[var(--color-danger)]">-{file.deletions}</span><span className="text-[var(--color-text-muted)]">{file.status}</span></div></div>) : livePrs.length > 0 ? <EmptyState message={prDiffLoading ? "Loading PR file diff…" : diffUnavailable ? String(prDiffError) : "No changed files returned for this pull request."} /> : <EmptyState message="Select a pull request to load changed files." />}</div>
        </div>
        <div className="border-t border-[var(--color-border)] p-3 text-xs text-[var(--color-text-secondary)]">
          <div className="flex justify-between"><span>Changed files</span><span>{changedFiles.length}</span></div>
          <p className="mt-2 text-[var(--color-text-muted)]">{currentPr ? `PR #${currentPr.number} diff is loaded from GitHub.` : "Select a live pull request to inspect file diffs."}</p>
        </div>
      </aside>

      <main className="flex min-h-0 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded bg-[color:rgba(88,166,255,0.14)] px-2 py-1 text-sm text-[var(--color-accent)]">{currentPr ? `PR #${currentPr.number}` : "No PR"}</span>
            <h2 className="truncate font-semibold">{currentPr?.title ?? "No pull request selected"}</h2>
            {currentPr ? <span className="rounded bg-[color:rgba(63,185,80,0.12)] px-2 py-1 text-xs text-[var(--color-success)]">{stateLabel(currentPr.isDraft ? "draft" : currentPr.state)}</span> : null}
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]"><GitPullRequestArrow className="h-4 w-4" /> {parentPr ? <>Next returned PR <span className="text-[var(--color-accent)]">#{parentPr.number}</span></> : "Live GitHub overview"}</div>
        </header>
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4">
          <div className="flex items-center gap-8 text-sm">
            <span className="border-b-2 border-[var(--color-accent)] py-3 font-semibold">Files Changed <b className="ml-2 rounded bg-[var(--color-bg-surface)] px-2">{changedFiles.length}</b></span>
            <span>Conversations <b className="ml-2 rounded bg-[var(--color-bg-surface)] px-2">{commentCount}</b></span>
            <span>Checks <b className="ml-2 rounded bg-[var(--color-bg-surface)] px-2">{checkRows.length}</b></span>
          </div>
          <span className={`max-w-[320px] truncate rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-xs ${providerTone}`}>{providerDetail}</span>
        </div>
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-sm">
          <span className="inline-flex items-center gap-2"><FileCode2 className="h-4 w-4" /> {changedFiles[0]?.path ?? "No file selected"}</span>
          <span className="text-xs text-[var(--color-text-muted)]">{prDiffLoading ? "Loading GitHub diff…" : currentPr ? `PR #${currentPr.number}` : "No pull request selected"}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden bg-[var(--color-bg-secondary)]">
          {prDiff?.diffText ? <UnifiedDiffFallback diffText={prDiff.diffText} filePath={changedFiles[0]?.path ?? `PR #${prDiff.number}`} mode="unified" /> : <div className="grid h-full place-items-center p-6"><EmptyState message={currentPr ? prDiffLoading ? "Loading live pull request diff…" : prDiffError ? String(prDiffError) : "No diff text returned for this pull request." : providerDetail} /></div>}
        </div>
        <section className="border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
          <div className="mb-3 flex items-center justify-between text-sm"><div className="flex gap-5"><span className="font-semibold">Activity ({commentCount})</span><span className="text-[var(--color-text-secondary)]">GitHub comments and events</span></div><button disabled={!currentPr?.url} onClick={() => currentPr?.url && window.open(currentPr.url, "_blank")} className="inline-flex items-center gap-2 text-[var(--color-accent)] disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)]"><MessageSquarePlus className="h-4 w-4" /> Open on GitHub</button></div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-3 text-sm">{activityRows.length > 0 ? activityRows.map((activity) => <p key={`${activity.author}-${activity.message}`} className="mt-2 first:mt-0 text-[var(--color-text-secondary)]"><b className="text-[var(--color-text-primary)]">{activity.author}</b> <span className="text-xs text-[var(--color-text-muted)]">{activity.age}</span> {activity.message}</p>) : <EmptyState message="No review activity returned by GitHub." />}</div>
        </section>
      </main>

      <aside className="min-h-0 overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">Current PR</h3>{currentPr ? <span className="rounded bg-[color:rgba(63,185,80,0.12)] px-2 py-1 text-xs text-[var(--color-success)]">{stateLabel(currentPr.isDraft ? "draft" : currentPr.state)}</span> : null}</div>{currentPr ? <><p className="mt-2 text-sm text-[var(--color-text-secondary)]">PR #{currentPr.number} · {currentPr.title}</p><p className="mt-3 text-xs text-[var(--color-text-muted)]">Updated by {currentPr.author ?? "GitHub"} · {formatRelative(currentPr.updatedAt)}</p><div className="mt-4 space-y-3 border-l border-[var(--color-border)] pl-4 text-sm"><p className="rounded bg-[color:rgba(88,166,255,0.14)] p-2 text-[var(--color-accent)]">{currentPr.headRefName ?? "head unavailable"}<br /><span className="text-[var(--color-text-secondary)]">into {currentPr.baseRefName ?? "base unavailable"}</span></p>{parentPr ? <p>Next returned PR #{parentPr.number}<br /><span className="text-[var(--color-text-muted)]">{parentPr.title}</span></p> : null}</div></> : <p className="mt-3 text-sm text-[var(--color-text-muted)]">No pull request selected.</p>}</div>
        <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">Reviewers</h3><button disabled className="cursor-not-allowed text-xs text-[var(--color-text-muted)]">Request review</button></div>{reviewRows.length > 0 ? reviewRows.map((review) => <div key={`${review.name}-${review.state}`} className="mt-3 flex items-center justify-between text-sm"><span>{review.name}{review.isAuthor && <span className="ml-2 rounded bg-[color:rgba(88,166,255,0.14)] px-1.5 text-xs text-[var(--color-accent)]">Author</span>}</span>{review.state.toLowerCase().includes("approved") ? <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" /> : <Circle className="h-4 w-4 text-[var(--color-text-muted)]" />}</div>) : <div className="mt-3"><EmptyState message="No reviews returned by GitHub." /></div>}</div>
        <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">Checks</h3><span className="text-xs text-[var(--color-text-secondary)]">{passingChecks} of {checkRows.length} passing</span></div>{checkRows.length > 0 ? checkRows.map((check) => <div key={check.name} className="mt-3 flex items-center justify-between text-sm"><span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" />{check.name}</span><span className={check.passed ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]"}>{check.status}</span></div>) : <div className="mt-3"><EmptyState message="No checks returned by GitHub." /></div>}</div>
        <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">Impacted summary</h3><Filter className="h-4 w-4 text-[var(--color-text-muted)]" /></div>{changedFiles.length > 0 ? <div className="mt-3 space-y-2 text-sm">{changedFiles.slice(0, 6).map((file) => <div key={file.path} className="flex items-center justify-between gap-3"><span className="truncate font-mono text-xs">{file.path}</span><span className="shrink-0 text-xs"><span className="text-[var(--color-success)]">+{file.additions}</span> <span className="text-[var(--color-danger)]">-{file.deletions}</span></span></div>)}</div> : <p className="mt-3 text-sm text-[var(--color-text-muted)]">No PR file impact returned by GitHub.</p>}</div>
      </aside>
    </section>
  );
}
