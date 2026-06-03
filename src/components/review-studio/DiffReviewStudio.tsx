import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  FileCode2,
  Filter,
  Folder,
  GitPullRequestArrow,
  MessageSquarePlus,
  MoreHorizontal,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useRepositoryGithubOverview } from "../../hooks/useAdvancedGit";
import { useAppStore } from "../../stores/app-store";
import type { ActivityItem, CheckRunSummary, PullRequestSummary, ReviewSummary } from "../../types/git";

interface DemoFileRow {
  path: string;
  status: string;
  additions: string;
  deletions: string;
}

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

const files: DemoFileRow[] = [
  { path: "src/components/Checkout/PaymentMethod.tsx", status: "M", additions: "+24", deletions: "−12" },
  { path: "src/components/Checkout/PaymentForm.tsx", status: "M", additions: "+8", deletions: "−4" },
  { path: "src/components/Checkout/PromoCode.tsx", status: "A", additions: "+56", deletions: "" },
  { path: "src/hooks/useCheckout.ts", status: "M", additions: "+18", deletions: "−3" },
  { path: "src/hooks/usePaymentMethods.ts", status: "M", additions: "+12", deletions: "−2" },
  { path: "src/lib/api/payments.ts", status: "M", additions: "+10", deletions: "−6" },
  { path: "src/types/checkout.ts", status: "M", additions: "+5", deletions: "−1" },
  { path: "tests/checkout/payment-method.test.tsx", status: "A", additions: "+92", deletions: "" },
];

const leftLines = [
  "export function PaymentMethod({",
  "  methods,",
  "  selectedId,",
  "  onSelect,",
  "}: PaymentMethodProps) {",
  "  return (",
  "    <div className=\"space-y-4\">",
  "      <h3 className=\"text-lg font-medium\">",
  "        Payment method",
  "      </h3>",
  "      <ul className=\"space-y-2\">",
  "        {methods.map((method) => (",
  "          <li key={method.id}>",
  "            <label className=\"flex items-center gap-3\">",
  "              <input type=\"radio\" name=\"payment-method\" />",
  "              <span>{method.label}</span>",
  "            </label>",
  "          </li>",
  "        ))}",
  "      </ul>",
];

const rightLines = [
  "export function PaymentMethod({",
  "  methods,",
  "  selectedId,",
  "  onSelect,",
  "}: PaymentMethodProps) {",
  "  const [loading, setLoading] = useState(false);",
  "  return (",
  "    <div className=\"space-y-4\">",
  "      <div className=\"flex items-center justify-between\">",
  "        <h3 className=\"text-lg font-medium\">Payment method</h3>",
  "        {loading && <span className=\"text-xs text-muted\">Loading methods...</span>}",
  "      </div>",
  "      <ul role=\"radiogroup\" className=\"space-y-2\">",
  "        {methods.map((method) => (",
  "          <li key={method.id}>",
  "            <label className={cn(\"flex items-center gap-3\")}",
  "            >",
  "              <input type=\"radio\" name=\"payment-method\" />",
  "              <span>{method.label}</span>",
  "            </label>",
];

const fallbackChecks: CheckRow[] = [
  { name: "lint / eslint", status: "Pass", passed: true },
  { name: "test / unit", status: "Pass", passed: true },
  { name: "test / e2e", status: "Pass", passed: true },
  { name: "typecheck", status: "Pass", passed: true },
  { name: "build", status: "Pass", passed: true },
];

const fallbackReviews: ReviewRow[] = [
  { name: "Jane Cooper", state: "Approved", isAuthor: false },
  { name: "John Smith", state: "Approved", isAuthor: true },
  { name: "Alex Johnson", state: "Pending", isAuthor: false },
];

const fallbackActivity: ActivityRow[] = [
  { author: "Jane Doe", message: "Why are we introducing a loading state here instead of in the parent?", age: "2h ago" },
  { author: "John Smith", message: "Good call—moved it up to avoid layout shift.", age: "1h ago" },
];

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

function FileRow({ file, selected }: { file: DemoFileRow; selected?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${selected ? "bg-[var(--color-bg-selected)]/20 text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]"}`}>
      <FileCode2 className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{file.path.split("/").pop()}</span>
      <span className="font-mono text-[var(--color-success)]">{file.status}</span>
      <span className="font-mono text-[var(--color-added)]">{file.additions}</span>
      {file.deletions && <span className="font-mono text-[var(--color-deleted)]">{file.deletions}</span>}
    </div>
  );
}

function DiffPane({ title, lines, mode }: { title: string; lines: string[]; mode: "left" | "right" }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 18,
  });

  return (
    <div className="flex min-w-0 flex-col overflow-hidden border-r border-[var(--color-border-muted)] last:border-r-0">
      <div className="flex items-center justify-between border-b border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs">
        <span className="font-semibold">{title}</span>
        <span className="font-mono text-[var(--color-text-muted)]">{mode === "left" ? "c9d0e1f" : "a1b2c3d"}</span>
      </div>
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto font-mono text-[12px] leading-6">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualLine) => {
            const index = virtualLine.index;
            const line = lines[index];
            const highlighted = (mode === "left" && index >= 10) || (mode === "right" && index >= 5 && index <= 10);
            return (
              <div
                key={`${mode}-${index}`}
                className={`absolute left-0 grid w-full grid-cols-[44px_1fr] ${highlighted ? mode === "left" ? "bg-[var(--color-diff-deleted-bg)]" : "bg-[var(--color-diff-added-bg)]" : ""}`}
                style={{ height: virtualLine.size, transform: `translateY(${virtualLine.start}px)` }}
              >
                <span className="select-none border-r border-[var(--color-border-muted)] pr-2 text-right text-[var(--color-text-muted)]">{23 + index}</span>
                <span className="overflow-hidden whitespace-pre px-3 text-[var(--color-text-secondary)]">{highlighted ? (mode === "left" ? "- " : "+ ") : "  "}{line}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function DiffReviewStudio() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const { data: githubOverview, isError } = useRepositoryGithubOverview(activeRepoPath);
  const livePrs = githubOverview?.pullRequests ?? [];
  const currentPr: PullRequestSummary = livePrs[0] ?? {
    number: 20,
    title: "Add payment method step",
    state: "open",
    author: "Jane Doe",
    url: null,
    headRefName: "feature/checkout-flow",
    baseRefName: "main",
    isDraft: false,
    updatedAt: null,
  };
  const parentPr = livePrs[1];
  const grandparentPr = livePrs[2];
  const checkRows = githubOverview?.checkRuns.length ? githubOverview.checkRuns.map(statusFromCheck) : fallbackChecks;
  const reviewRows = githubOverview?.reviews.length ? githubOverview.reviews.map((review) => reviewFromSummary(review, currentPr.author)) : fallbackReviews;
  const activityRows = githubOverview?.activity.length ? githubOverview.activity.slice(0, 3).map(activityFromSummary) : fallbackActivity;
  const passingChecks = checkRows.filter((check) => check.passed).length;
  const providerDetail = !activeRepoPath
    ? "Demo data shown until a repository is opened."
    : isError
      ? "GitHub metadata unavailable; static review data is shown."
      : !githubOverview?.providerAvailable
        ? "GitHub provider is not available; static review data is shown."
        : !githubOverview.isGithubRepository
          ? "This repository is not linked to GitHub; static review data is shown."
          : livePrs.length > 0
            ? `${githubOverview.owner}/${githubOverview.repo} via ${githubOverview.account?.login ?? "GitHub"}`
            : "GitHub connected; no pull requests returned, so reference data is shown.";
  const providerTone = livePrs.length > 0 ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]";
  const commentCount = activityRows.length + reviewRows.length;

  return (
    <section className="grid h-full min-h-0 grid-cols-[260px_minmax(650px,1fr)_300px] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <aside className="flex min-h-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <div className="border-b border-[var(--color-border)] p-3">
          <label className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2 py-2 text-xs text-[var(--color-text-muted)]">
            <Search className="h-4 w-4" /> Filter files (⌘P)
          </label>
          <div className="mt-3 flex items-center justify-between text-xs"><span>20 changed files</span><span className="rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-white">on</span></div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="mb-1 flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-text-secondary)]"><ChevronRight className="h-3 w-3" /><Folder className="h-4 w-4" /> src</div>
          <div className="mb-1 flex items-center gap-1 px-4 py-1 text-xs text-[var(--color-text-secondary)]"><ChevronRight className="h-3 w-3" /><Folder className="h-4 w-4" /> components/Checkout</div>
          <div className="space-y-0.5 pl-6">{files.slice(0, 3).map((file, index) => <FileRow key={file.path} file={file} selected={index === 0} />)}</div>
          <div className="mb-1 mt-3 flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-text-secondary)]"><ChevronRight className="h-3 w-3" /><Folder className="h-4 w-4" /> hooks</div>
          <div className="space-y-0.5 pl-6">{files.slice(3, 5).map((file) => <FileRow key={file.path} file={file} />)}</div>
          <div className="mb-1 mt-3 flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-text-secondary)]"><ChevronRight className="h-3 w-3" /><Folder className="h-4 w-4" /> lib</div>
          <div className="space-y-0.5 pl-6">{files.slice(5, 6).map((file) => <FileRow key={file.path} file={file} />)}</div>
          <div className="mb-1 mt-3 flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-text-secondary)]"><ChevronRight className="h-3 w-3" /><Folder className="h-4 w-4" /> tests</div>
          <div className="space-y-0.5 pl-6">{files.slice(7).map((file) => <FileRow key={file.path} file={file} />)}</div>
        </div>
        <div className="border-t border-[var(--color-border)] p-3 text-xs text-[var(--color-text-secondary)]">
          <div className="mb-2">Show</div>
          <label className="mb-2 flex items-center gap-2"><input type="checkbox" defaultChecked /> Staged changes</label>
          <label className="flex items-center gap-2"><input type="checkbox" defaultChecked /> Unstaged changes</label>
          <div className="mt-4 flex justify-between"><span>20 files changed</span><span><b className="text-[var(--color-added)]">+306</b> <b className="text-[var(--color-deleted)]">−75</b></span></div>
        </div>
      </aside>

      <main className="flex min-h-0 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
          <div className="flex items-center gap-3"><span className="rounded bg-[color:rgba(88,166,255,0.14)] px-2 py-1 text-sm text-[var(--color-accent)]">PR #{currentPr.number}</span><h2 className="font-semibold">{currentPr.title}</h2><span className="rounded bg-[color:rgba(63,185,80,0.12)] px-2 py-1 text-xs text-[var(--color-success)]">{stateLabel(currentPr.state)}</span></div>
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]"><GitPullRequestArrow className="h-4 w-4" /> {parentPr ? <>Stacked on <span className="text-[var(--color-accent)]">PR #{parentPr.number}</span> {parentPr.title}</> : "Reviewing selected pull request"}</div>
        </header>
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4">
          <div className="flex items-center gap-8 text-sm">
            <span className="border-b-2 border-[var(--color-accent)] py-3 font-semibold">Files Changed <b className="ml-2 rounded bg-[var(--color-bg-surface)] px-2">20</b></span>
            <span>Conversations <b className="ml-2 rounded bg-[var(--color-bg-surface)] px-2">{commentCount}</b></span>
            <span>Checks <b className="ml-2 rounded bg-[var(--color-bg-surface)] px-2">{checkRows.length}</b></span>
          </div>
          <span className={`max-w-[320px] truncate rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-xs ${providerTone}`}>{providerDetail}</span>
        </div>
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-sm">
          <span className="inline-flex items-center gap-2"><FileCode2 className="h-4 w-4" /> src/components/Checkout/PaymentMethod.tsx <span className="text-[var(--color-success)]">M</span></span>
          <span className="text-xs text-[var(--color-text-muted)]">Hunk 2 of 6 <MoreHorizontal className="ml-3 inline h-4 w-4" /></span>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-2 overflow-auto bg-[var(--color-bg-secondary)]">
          <DiffPane title={`Base (${currentPr.baseRefName ?? "main"})`} lines={leftLines} mode="left" />
          <DiffPane title={`Your Change (PR #${currentPr.number})`} lines={rightLines} mode="right" />
        </div>
        <section className="border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
          <div className="mb-3 flex items-center justify-between text-sm"><div className="flex gap-5"><span className="font-semibold">Comments ({commentCount})</span><span className="text-[var(--color-text-secondary)]">Suggestions (1)</span></div><button className="inline-flex items-center gap-2 text-[var(--color-accent)]"><MessageSquarePlus className="h-4 w-4" /> Start a thread</button></div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-3 text-sm"><div className="mb-3 rounded-md border border-[var(--color-border-muted)] px-3 py-2 text-[var(--color-text-muted)]">Add a comment...</div>{activityRows.map((activity) => <p key={`${activity.author}-${activity.message}`} className="mt-2 text-[var(--color-text-secondary)]"><b className="text-[var(--color-text-primary)]">{activity.author}</b> <span className="text-xs text-[var(--color-text-muted)]">{activity.age}</span> {activity.message}</p>)}</div>
        </section>
      </main>

      <aside className="min-h-0 overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">Current PR</h3><span className="rounded bg-[color:rgba(63,185,80,0.12)] px-2 py-1 text-xs text-[var(--color-success)]">{stateLabel(currentPr.state)}</span></div><p className="mt-2 text-sm text-[var(--color-text-secondary)]">PR #{currentPr.number} · {currentPr.title}</p><p className="mt-3 text-xs text-[var(--color-text-muted)]">Updated by {currentPr.author ?? "GitHub"} · {formatRelative(currentPr.updatedAt)}</p><div className="mt-4 space-y-3 border-l border-[var(--color-border)] pl-4 text-sm"><p className="rounded bg-[color:rgba(88,166,255,0.14)] p-2 text-[var(--color-accent)]">PR #{currentPr.number} (this PR)<br />{currentPr.title}</p>{parentPr ? <p>PR #{parentPr.number} (parent)<br /><span className="text-[var(--color-text-muted)]">{parentPr.title}</span></p> : <p>PR #19 (parent)<br /><span className="text-[var(--color-text-muted)]">Add promo code support</span></p>}{grandparentPr ? <p>PR #{grandparentPr.number} (grandparent)<br /><span className="text-[var(--color-text-muted)]">{grandparentPr.title}</span></p> : <p>PR #18 (grandparent)<br /><span className="text-[var(--color-text-muted)]">Refactor order summary</span></p>}</div></div>
        <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">Reviewers</h3><button className="text-xs text-[var(--color-accent)]">Request review</button></div>{reviewRows.map((review) => <div key={`${review.name}-${review.state}`} className="mt-3 flex items-center justify-between text-sm"><span>{review.name}{review.isAuthor && <span className="ml-2 rounded bg-[color:rgba(88,166,255,0.14)] px-1.5 text-xs text-[var(--color-accent)]">Author</span>}</span>{review.state.toLowerCase().includes("approved") ? <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" /> : <Circle className="h-4 w-4 text-[var(--color-text-muted)]" />}</div>)}</div>
        <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">Checks</h3><span className="text-xs text-[var(--color-text-secondary)]">{passingChecks} of {checkRows.length} passing</span></div>{checkRows.map((check) => <div key={check.name} className="mt-3 flex items-center justify-between text-sm"><span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" />{check.name}</span><span className={check.passed ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]"}>{check.status}</span></div>)}</div>
        <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4"><div className="flex items-center justify-between"><h3 className="font-semibold">Impacted summary</h3><Filter className="h-4 w-4 text-[var(--color-text-muted)]" /></div><p className="mt-3 text-sm">20 files changed <span className="float-right"><b className="text-[var(--color-added)]">+306</b> <b className="text-[var(--color-deleted)]">−75</b></span></p>{[["src/", 12, "+230", "−45"], ["tests/", 4, "+140", "−20"], ["docs/", 1, "+9", "−0"], ["Other", 3, "+", "−10"]].map(([area, count, add, del]) => <div key={area} className="mt-2 grid grid-cols-[1fr_32px_48px_48px] text-sm text-[var(--color-text-secondary)]"><span>{area}</span><span>{count}</span><span className="text-[var(--color-added)]">{add}</span><span className="text-[var(--color-deleted)]">{del}</span></div>)}</div>
      </aside>
    </section>
  );
}
