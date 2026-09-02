import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  FileCode2,
  FileText,
  Filter,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequestArrow,
  Layers3,
  Link2,
  MessageSquarePlus,
  RefreshCw,
  Search,
  ShieldCheck,
  Tag,
  UserPlus,
  XCircle,
} from "lucide-react";
import {
  UnifiedDiffFallback,
  type DiffLineSelection,
} from "../diff-viewer/UnifiedDiffFallback";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import {
  findPullRequestFilePatch,
  mergePullRequestDiffFiles,
  splitPullRequestDiff,
  summarizePullRequestDiffFiles,
} from "../../lib/pr-diff";
import {
  derivePullRequestLandingOrder,
  formatPullRequestLandingPreflight,
  pullRequestLandingSafetyProblems,
} from "../../lib/pr-stack";
import { gitApi } from "../../lib/tauri-api";
import { useAppStore } from "../../stores/app-store";
import { Avatar, Button, Markdown } from "../ui";
import { appDialog } from "../common/AppDialogProvider";
import type {
  CheckRunSummary,
  PullRequestSummary,
  ReviewSummary,
} from "../../types/git";

interface ReviewRow {
  name: string;
  state: string;
  body: string;
  age: string;
  url: string | null;
  isAuthor: boolean;
  createdAt: string | null;
}

interface CheckRow {
  name: string;
  status: string;
  passed: boolean;
  description: string | null;
  workflow: string | null;
  url: string | null;
}

interface ConversationItem {
  id: string;
  kind: "review" | "reviewComment" | "issueComment" | "event";
  author: string;
  avatarUrl: string | null;
  association: string | null;
  body: string | null;
  detail: string | null;
  state: string | null;
  eventKind: string | null;
  path: string | null;
  line: number | null;
  age: string;
  url: string | null;
  createdAt: string | null;
}

type ReviewStudioTab = "conversations" | "files" | "checks" | "stack";
type PullRequestListTab = "open" | "closed";
type MergeMethod = "merge" | "rebase" | "squash";

const mergeMethodLabels: Record<MergeMethod, string> = {
  merge: "Create merge commit",
  squash: "Squash commits",
  rebase: "Rebase and merge",
};

const formatErrorMessage = (error: unknown) => {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const value = error as { error?: unknown; message?: unknown };
    if (typeof value.error === "string") return value.error;
    if (typeof value.message === "string") return value.message;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
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

const pullRequestStateClass = (pr: PullRequestSummary) => {
  const state = pr.isDraft ? "draft" : pr.state.toLowerCase();
  if (state === "open") {
    return "bg-[var(--color-success-bg)] text-[var(--color-success)]";
  }
  if (state === "merged") {
    return "bg-[var(--color-bg-selected-muted)] text-[var(--color-purple)]";
  }
  if (state === "draft") {
    return "bg-[var(--color-warning-bg)] text-[var(--color-warning)]";
  }
  return "bg-[var(--color-danger-bg)] text-[var(--color-danger)]";
};

const statusFromCheck = (check: CheckRunSummary): CheckRow => {
  const normalized = (
    check.conclusion ??
    check.state ??
    "pending"
  ).toLowerCase();
  const passed = normalized === "success" || normalized === "completed";
  return {
    name: check.name,
    status: passed ? "Pass" : stateLabel(check.conclusion ?? check.state),
    passed,
    description: check.description,
    workflow: check.workflow,
    url: check.url,
  };
};

const reviewFromSummary = (
  review: ReviewSummary,
  author: string | null | undefined,
): ReviewRow => {
  const state = stateLabel(review.state);
  const body =
    review.body?.trim() || `Submitted a ${state.toLowerCase()} review.`;
  return {
    name: review.author ?? "GitHub reviewer",
    state,
    body,
    age: formatRelative(review.submittedAt),
    url: review.url,
    isAuthor: Boolean(author && review.author === author),
    createdAt: review.submittedAt,
  };
};

function associationLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  switch (value.toUpperCase()) {
    case "MEMBER":
      return "Member";
    case "OWNER":
      return "Owner";
    case "COLLABORATOR":
      return "Collaborator";
    case "CONTRIBUTOR":
    case "FIRST_TIMER":
    case "FIRST_TIME_CONTRIBUTOR":
      return "Contributor";
    default:
      return null;
  }
}

function reviewStateInfo(state: string | null | undefined): {
  label: string;
  tone: "success" | "danger" | "muted";
} {
  const normalized = (state ?? "").toUpperCase();
  if (normalized.includes("APPROVED")) {
    return { label: "approved these changes", tone: "success" };
  }
  if (
    normalized.includes("CHANGES_REQUESTED") ||
    normalized.includes("REQUEST_CHANGES")
  ) {
    return { label: "requested changes", tone: "danger" };
  }
  if (normalized.includes("DISMISSED")) {
    return { label: "dismissed their review", tone: "muted" };
  }
  return { label: "left a comment", tone: "muted" };
}

function eventIcon(kind: string) {
  switch (kind) {
    case "labeled":
    case "unlabeled":
      return Tag;
    case "review_requested":
    case "review_request_removed":
      return UserPlus;
    case "merged":
      return GitMerge;
    case "closed":
      return XCircle;
    case "head_ref_force_pushed":
    case "head_ref_deleted":
    case "head_ref_restored":
      return GitBranch;
    case "committed":
      return GitCommitHorizontal;
    case "referenced":
    case "cross-referenced":
      return Link2;
    case "renamed":
      return FileText;
    default:
      return Circle;
  }
}

function eventTone(kind: string): string {
  if (kind === "merged") return "text-[var(--color-success)]";
  if (kind === "closed") return "text-[var(--color-danger)]";
  if (kind === "labeled" || kind === "review_requested")
    return "text-[var(--color-info)]";
  if (kind.startsWith("head_ref_")) return "text-[var(--color-warning)]";
  return "text-[var(--color-text-muted)]";
}

function AssociationBadge({ value }: { value: string | null }) {
  const label = associationLabel(value);
  if (!label) return null;
  return (
    <span className="rounded-full border border-[var(--color-border)] px-1.5 py-px text-[10px] font-medium text-[var(--color-text-muted)]">
      {label}
    </span>
  );
}

function CommentCard({
  item,
  onViewDiff,
}: {
  item: ConversationItem;
  onViewDiff: (path: string) => void;
}) {
  const isReview = item.kind === "review";
  const isReviewComment = item.kind === "reviewComment";
  const reviewInfo = isReview ? reviewStateInfo(item.state) : null;
  const verb =
    reviewInfo?.label ?? (isReviewComment ? "commented on" : "commented");
  const approved =
    isReview && (item.state ?? "").toUpperCase().includes("APPROVED");
  const requestedChanges =
    isReview &&
    ((item.state ?? "").toUpperCase().includes("CHANGES_REQUESTED") ||
      (item.state ?? "").toUpperCase().includes("REQUEST_CHANGES"));

  return (
    <article className="relative mb-3">
      <span className="absolute -left-10 top-1">
        <Avatar src={item.avatarUrl} name={item.author} size={20} />
      </span>
      <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--color-border-muted)] px-3 py-2">
          <b className="text-sm font-semibold text-[var(--color-text-primary)]">
            {item.author}
          </b>
          <AssociationBadge value={item.association} />
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
            {approved ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-success)]" />
            ) : null}
            {requestedChanges ? (
              <XCircle className="h-3.5 w-3.5 text-[var(--color-danger)]" />
            ) : null}
            {verb}
          </span>
          <span className="ml-auto text-xs text-[var(--color-text-muted)]">
            {item.age}
          </span>
        </div>
        {item.detail ? (
          <button
            type="button"
            disabled={!item.path}
            onClick={() => item.path && onViewDiff(item.path)}
            className="block w-full truncate px-3 py-1.5 text-left font-mono text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] disabled:cursor-default disabled:hover:bg-transparent"
          >
            {item.detail}
          </button>
        ) : null}
        {item.body ? (
          <div className="px-3 py-3">
            <Markdown>{item.body}</Markdown>
          </div>
        ) : null}
        {item.url ? (
          <div className="border-t border-[var(--color-border-muted)] px-3 py-1.5">
            <button
              type="button"
              onClick={() => item.url && window.open(item.url, "_blank")}
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              Open on GitHub
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function EventRow({ item }: { item: ConversationItem }) {
  const kind = item.eventKind ?? "timeline";
  const Icon = eventIcon(kind);
  return (
    <div className="relative mb-2 flex min-h-7 items-center gap-3 text-xs text-[var(--color-text-muted)]">
      <span className="absolute -left-10 top-1">
        <Avatar src={item.avatarUrl} name={item.author} size={18} />
      </span>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${eventTone(kind)}`} />
      <span className="min-w-0 flex-1">
        <b className="font-medium text-[var(--color-text-secondary)]">
          {item.author}
        </b>{" "}
        {item.detail}
      </span>
      <span className="shrink-0 text-[var(--color-text-muted)]">
        {item.age}
      </span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--color-border)] p-5 text-center text-sm text-[var(--color-text-muted)]">
      {message}
    </div>
  );
}

function PrSummary({
  pr,
  selected,
  onClick,
}: {
  pr: PullRequestSummary;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md border p-3 text-left text-sm transition-colors ${selected ? "border-[var(--color-border-accent)] bg-[var(--color-bg-selected-muted)] text-[var(--color-text-primary)]" : "border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-hover)]"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-[var(--color-text-muted)]">
          PR #{pr.number}
        </span>
        <span className="rounded bg-[var(--color-bg-surface)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]">
          {stateLabel(pr.isDraft ? "draft" : pr.state)}
        </span>
      </div>
      <div className="mt-2 font-medium">{pr.title}</div>
      <div className="mt-2 truncate text-xs text-[var(--color-text-muted)]">
        {pr.headRefName ?? "head unavailable"} into{" "}
        {pr.baseRefName ?? "base unavailable"}
      </div>
    </button>
  );
}

export function DiffReviewStudio() {
  const queryClient = useQueryClient();
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const {
    data: githubOverview,
    isError,
    refetch: refetchGithubOverview,
  } = useQuery(gitQueries.githubOverview(activeRepoPath));
  const livePrs = useMemo(
    () => githubOverview?.pullRequests ?? [],
    [githubOverview?.pullRequests],
  );
  const selectedPullRequestId = useAppStore((s) => s.selectedPullRequestId);
  const setSelectedPullRequestId = useAppStore(
    (s) => s.setSelectedPullRequestId,
  );
  const [prFilter, setPrFilter] = useState("");
  const [prListTab, setPrListTab] = useState<PullRequestListTab>("open");
  const [fileFilter, setFileFilter] = useState("");
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [lineCommentTarget, setLineCommentTarget] =
    useState<DiffLineSelection | null>(null);
  const [lineCommentBody, setLineCommentBody] = useState("");
  const [activeTab, setActiveTab] = useState<ReviewStudioTab>("conversations");
  const [checksExpanded, setChecksExpanded] = useState(true);
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>("squash");
  const [finalizeWithAdmin, setFinalizeWithAdmin] = useState(false);
  const [deleteHeadBranch, setDeleteHeadBranch] = useState(true);

  const selectedPrNumber = selectedPullRequestId
    ? Number(selectedPullRequestId)
    : null;
  const openPrs = useMemo(
    () => livePrs.filter((pr) => pr.state.toLowerCase() === "open"),
    [livePrs],
  );
  const closedPrs = useMemo(
    () => livePrs.filter((pr) => pr.state.toLowerCase() !== "open"),
    [livePrs],
  );
  const listedPrs = prListTab === "open" ? openPrs : closedPrs;
  const currentPr =
    listedPrs.find((pr) => pr.number === selectedPrNumber) ??
    listedPrs[0] ??
    null;
  const filteredPrs = useMemo(() => {
    const query = prFilter.trim().toLowerCase();
    if (!query) return listedPrs;
    return listedPrs.filter((pr) =>
      [`#${pr.number}`, pr.title, pr.author, pr.headRefName, pr.baseRefName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [listedPrs, prFilter]);

  useEffect(() => {
    if (!activeRepoPath) return;
    return () => {
      void gitApi.cancelRepositoryGithubWork(activeRepoPath);
    };
  }, [activeRepoPath]);
  useEffect(() => {
    if (!currentPr) {
      if (selectedPullRequestId) setSelectedPullRequestId(null);
      return;
    }
    if (selectedPullRequestId !== String(currentPr.number)) {
      setSelectedPullRequestId(String(currentPr.number));
    }
  }, [currentPr, selectedPullRequestId, setSelectedPullRequestId]);

  const {
    data: prDiff,
    isLoading: prDiffLoading,
    error: prDiffError,
    refetch: refetchPrDiff,
  } = useQuery(
    gitQueries.pullRequestDiff(activeRepoPath, currentPr?.number ?? null),
  );
  const currentPrIndex = currentPr
    ? listedPrs.findIndex((pr) => pr.number === currentPr.number)
    : -1;
  const parentPr =
    currentPrIndex >= 0 ? (listedPrs[currentPrIndex + 1] ?? null) : null;
  const requestReviewMutation = useMutation(
    gitMutations.requestPullRequestReview(queryClient, activeRepoPath),
  );
  const addLabelMutation = useMutation(
    gitMutations.addPullRequestLabel(queryClient, activeRepoPath),
  );
  const removeLabelMutation = useMutation(
    gitMutations.removePullRequestLabel(queryClient, activeRepoPath),
  );
  const submitReviewMutation = useMutation(
    gitMutations.submitPullRequestReview(queryClient, activeRepoPath),
  );
  const lineCommentMutation = useMutation(
    gitMutations.submitPullRequestLineComment(queryClient, activeRepoPath),
  );
  const mergePrMutation = useMutation(
    gitMutations.mergePullRequest(queryClient, activeRepoPath),
  );
  const closePrMutation = useMutation(
    gitMutations.closePullRequest(queryClient, activeRepoPath),
  );
  const checkoutPrMutation = useMutation(
    gitMutations.checkoutPullRequest(queryClient, activeRepoPath),
  );
  const updatePrBranchMutation = useMutation(
    gitMutations.updatePullRequestBranch(queryClient, activeRepoPath),
  );
  const checkRows = (prDiff?.checkRuns ?? []).map(statusFromCheck);
  const reviewRows = useMemo(
    () =>
      (prDiff?.reviews ?? []).map((review) =>
        reviewFromSummary(review, currentPr?.author),
      ),
    [prDiff?.reviews, currentPr?.author],
  );
  const conversationItems = useMemo<ConversationItem[]>(() => {
    const reviewComments: ConversationItem[] = (prDiff?.comments ?? []).map(
      (comment) => ({
        id: `comment-${comment.id}`,
        kind: "reviewComment",
        author: comment.author ?? "GitHub",
        avatarUrl: comment.avatarUrl,
        association: comment.authorAssociation,
        body: comment.body || "No comment body returned.",
        detail: comment.path
          ? `${comment.path}${comment.line ? `:${comment.line}` : ""}`
          : null,
        state: null,
        eventKind: null,
        path: comment.path,
        line: comment.line,
        url: comment.url,
        age: formatRelative(comment.createdAt),
        createdAt: comment.createdAt,
      }),
    );

    const reviews: ConversationItem[] = (prDiff?.reviews ?? []).map(
      (review, index) => ({
        id: `review-${index}-${review.author ?? "gh"}-${review.submittedAt ?? review.state}`,
        kind: "review",
        author: review.author ?? "GitHub reviewer",
        avatarUrl: review.avatarUrl,
        association: review.authorAssociation,
        body: review.body?.trim() || null,
        detail: null,
        state: review.state,
        eventKind: null,
        path: null,
        line: null,
        url: review.url,
        age: formatRelative(review.submittedAt),
        createdAt: review.submittedAt,
      }),
    );

    const activity: ConversationItem[] = (prDiff?.activity ?? [])
      .filter((item) => item.kind !== "reviewed")
      .map((item): ConversationItem => {
        const isComment = item.kind === "commented";
        return {
          id: `${isComment ? "issue-comment" : "event"}-${item.id}`,
          kind: isComment ? "issueComment" : "event",
          author: item.actor ?? "GitHub",
          avatarUrl: item.avatarUrl,
          association: item.authorAssociation,
          body: isComment ? item.title?.trim() || null : null,
          detail: isComment
            ? null
            : item.title?.trim() || stateLabel(item.kind),
          state: null,
          eventKind: isComment ? null : item.kind,
          path: null,
          line: null,
          url: item.url,
          age: formatRelative(item.createdAt),
          createdAt: item.createdAt,
        };
      });

    return [...reviewComments, ...reviews, ...activity].sort((left, right) => {
      const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
      const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
      return leftTime - rightTime;
    });
  }, [prDiff?.activity, prDiff?.comments, prDiff?.reviews]);
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
  const providerTone =
    livePrs.length > 0
      ? "text-[var(--color-success)]"
      : "text-[var(--color-text-muted)]";
  const commentCount = conversationItems.filter(
    (item) => item.kind !== "event",
  ).length;
  const filePatches = useMemo(
    () => splitPullRequestDiff(prDiff?.diffText),
    [prDiff?.diffText],
  );
  const derivedChangedFiles = useMemo(
    () => summarizePullRequestDiffFiles(filePatches),
    [filePatches],
  );
  const changedFiles = useMemo(
    () => mergePullRequestDiffFiles(prDiff?.files, derivedChangedFiles),
    [prDiff?.files, derivedChangedFiles],
  );
  const visibleChangedFiles = useMemo(() => {
    const query = fileFilter.trim().toLowerCase();
    if (!query) return changedFiles;
    return changedFiles.filter((file) =>
      [file.path, file.status].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [changedFiles, fileFilter]);
  const firstChangedFilePath = changedFiles[0]?.path ?? null;
  const diffErrorMessage = formatErrorMessage(prDiffError);
  const diffUnavailable = currentPr && !prDiffLoading && !prDiff && prDiffError;
  const prFetchWarning = prDiff?.fetchError ?? null;
  const selectedFile =
    visibleChangedFiles.find((file) => file.path === selectedFilePath) ??
    visibleChangedFiles[0] ??
    null;
  const selectedPatch = findPullRequestFilePatch(
    filePatches,
    selectedFile?.path,
  );
  const selectedDiffText = selectedPatch?.patchText ?? null;
  const commentCountsByPath = useMemo(() => {
    const counts = new Map<string, number>();
    for (const comment of prDiff?.comments ?? []) {
      if (!comment.path) continue;
      counts.set(comment.path, (counts.get(comment.path) ?? 0) + 1);
    }
    return counts;
  }, [prDiff?.comments]);
  const selectedFileCommentCount = selectedFile
    ? (commentCountsByPath.get(selectedFile.path) ?? 0)
    : 0;
  const pendingReviewers = currentPr?.reviewRequests ?? [];
  const labels = currentPr?.labels ?? [];
  const stackCandidates = openPrs;
  const stackLandingOrder = derivePullRequestLandingOrder(stackCandidates);
  const canLandStack =
    stackLandingOrder.length > 1 &&
    stackLandingOrder.length === stackCandidates.length;
  const stackLandingBlocked =
    stackCandidates.length > 1 &&
    stackLandingOrder.length !== stackCandidates.length;
  const stackLandingSafetyIssues = canLandStack
    ? pullRequestLandingSafetyProblems(stackLandingOrder)
    : [];
  const canSafelyLandStack =
    canLandStack && stackLandingSafetyIssues.length === 0;
  const stackLandingUnavailableReason = stackLandingBlocked
    ? "Cannot derive a linear stack from PR head/base branches."
    : !canLandStack
      ? "Need at least two open pull requests in a linear stack."
      : stackLandingSafetyIssues.length > 0
        ? stackLandingSafetyIssues.join(" ")
        : undefined;
  const reviewActionPending =
    requestReviewMutation.isPending ||
    submitReviewMutation.isPending ||
    addLabelMutation.isPending ||
    removeLabelMutation.isPending ||
    lineCommentMutation.isPending ||
    mergePrMutation.isPending ||
    closePrMutation.isPending ||
    checkoutPrMutation.isPending ||
    updatePrBranchMutation.isPending;
  const reviewActionError =
    requestReviewMutation.error ??
    submitReviewMutation.error ??
    addLabelMutation.error ??
    removeLabelMutation.error ??
    lineCommentMutation.error ??
    mergePrMutation.error ??
    closePrMutation.error ??
    checkoutPrMutation.error ??
    updatePrBranchMutation.error;
  const canMutateCurrentPr = Boolean(
    currentPr && currentPr.state?.toLowerCase() === "open",
  );
  const requestReview = async () => {
    if (!currentPr) return;
    const input = await appDialog.prompt(
      "Enter reviewer usernames or teams, comma-separated.",
      "",
      "Request review",
    );
    const reviewers =
      input
        ?.split(",")
        .map((reviewer) => reviewer.trim())
        .filter(Boolean) ?? [];
    if (reviewers.length === 0) return;
    requestReviewMutation.mutate({ number: currentPr.number, reviewers });
  };
  const submitReview = async (
    event: "approve" | "request_changes" | "comment",
  ) => {
    if (!currentPr) return;
    const body = await appDialog.prompt(
      event === "approve"
        ? "Add an optional approval note."
        : event === "request_changes"
          ? "Describe requested changes."
          : "Enter your review comment.",
      "",
      event === "approve"
        ? "Approve pull request"
        : event === "request_changes"
          ? "Request changes"
          : "Comment on pull request",
    );
    if (body === null) return;
    if (event !== "approve" && !body.trim()) return;
    submitReviewMutation.mutate({
      number: currentPr.number,
      event,
      body: body.trim() || undefined,
    });
  };
  const editLabels = async (mode: "add" | "remove") => {
    if (!currentPr) return;
    const input = await appDialog.prompt(
      mode === "add"
        ? "Enter labels to add, comma-separated."
        : "Enter labels to remove, comma-separated.",
      "",
      mode === "add" ? "Add labels" : "Remove labels",
    );
    const nextLabels =
      input
        ?.split(",")
        .map((label) => label.trim())
        .filter(Boolean) ?? [];
    if (nextLabels.length === 0) return;
    const variables = { number: currentPr.number, labels: nextLabels };
    if (mode === "add") addLabelMutation.mutate(variables);
    else removeLabelMutation.mutate(variables);
  };
  const finalizePullRequest = async () => {
    if (!currentPr) return;
    const bypassCopy = finalizeWithAdmin
      ? " This will ask GitHub to bypass required checks/reviews with --admin."
      : "";
    if (
      !(await appDialog.confirm(
        `Complete PR #${currentPr.number} with ${mergeMethodLabels[mergeMethod]}?${bypassCopy}`,
        "Complete pull request?",
        finalizeWithAdmin ? "danger" : "warning",
      ))
    )
      return;
    mergePrMutation.mutate({
      number: currentPr.number,
      method: mergeMethod,
      admin: finalizeWithAdmin,
      deleteBranch: deleteHeadBranch,
    });
  };
  const closePullRequest = async () => {
    if (!currentPr) return;
    if (
      !(await appDialog.confirm(
        `Close PR #${currentPr.number} without merging?`,
        "Close pull request?",
        "danger",
      ))
    )
      return;
    closePrMutation.mutate(currentPr.number);
  };
  const refreshPullRequestMetadata = () => {
    void refetchGithubOverview();
    void refetchPrDiff();
  };
  const checkoutPullRequest = () => {
    if (currentPr) checkoutPrMutation.mutate(currentPr.number);
  };
  const updatePullRequestBranch = () => {
    if (currentPr) updatePrBranchMutation.mutate(currentPr.number);
  };
  const landPullRequestStack = async () => {
    if (!canSafelyLandStack) {
      await appDialog.alert(
        `Cannot land stack yet.\n\n${stackLandingUnavailableReason ?? "Refresh PR metadata and try again."}`,
        "Stack is not ready",
      );
      return;
    }
    if (
      !(await appDialog.confirm(
        formatPullRequestLandingPreflight(stackLandingOrder),
        "Land pull request stack?",
        "danger",
      ))
    )
      return;
    for (const pr of stackLandingOrder) {
      await mergePrMutation.mutateAsync({
        number: pr.number,
        method: "squash",
        admin: false,
        deleteBranch: false,
      });
    }
  };
  const submitLineComment = () => {
    if (!currentPr || !lineCommentTarget || !lineCommentBody.trim()) return;
    lineCommentMutation.mutate(
      {
        number: currentPr.number,
        path: lineCommentTarget.filePath,
        line: lineCommentTarget.line,
        side: lineCommentTarget.side,
        body: lineCommentBody.trim(),
      },
      {
        onSuccess: () => {
          setLineCommentBody("");
          setLineCommentTarget(null);
        },
      },
    );
  };

  useEffect(() => {
    setSelectedFilePath(firstChangedFilePath);
    setFileFilter("");
    setLineCommentTarget(null);
    setLineCommentBody("");
  }, [currentPr?.number, firstChangedFilePath]);

  useEffect(() => {
    if (visibleChangedFiles.length === 0) {
      if (selectedFilePath) setSelectedFilePath(null);
      return;
    }
    if (
      selectedFilePath &&
      visibleChangedFiles.some((file) => file.path === selectedFilePath)
    ) {
      return;
    }
    setSelectedFilePath(visibleChangedFiles[0].path);
  }, [selectedFilePath, visibleChangedFiles]);

  useEffect(() => {
    if (!lineCommentTarget || lineCommentTarget.filePath === selectedFile?.path)
      return;
    setLineCommentTarget(null);
    setLineCommentBody("");
  }, [lineCommentTarget, selectedFile?.path]);

  return (
    <section className="grid h-full min-h-0 grid-cols-1 overflow-auto bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] xl:grid-cols-[260px_minmax(650px,1fr)_300px] xl:overflow-hidden">
      <aside className="flex min-h-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <div className="border-b border-[var(--color-border)] p-3">
          <div className="mb-3 grid grid-cols-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-1">
            {(
              [
                ["open", "Open", openPrs.length],
                ["closed", "Closed", closedPrs.length],
              ] as const
            ).map(([tab, label, count]) => (
              <button
                key={tab}
                type="button"
                aria-pressed={prListTab === tab}
                onClick={() => {
                  setPrListTab(tab);
                  setPrFilter("");
                  setSelectedFilePath(null);
                }}
                className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${prListTab === tab ? "bg-[var(--color-bg-selected-muted)] text-[var(--color-text-primary)] shadow-sm" : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"}`}
              >
                {label} <span className="ml-1 opacity-70">{count}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2 py-2 text-xs text-[var(--color-text-muted)]">
            <Search className="h-4 w-4" />
            <input
              value={prFilter}
              onChange={(event) => setPrFilter(event.target.value)}
              placeholder="Filter pull requests"
              className="min-w-0 flex-1 bg-transparent text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
            />
          </label>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span>
              {filteredPrs.length} / {listedPrs.length} {prListTab} pull
              requests
            </span>
            <span className="rounded-full bg-[var(--color-bg-surface)] px-2 py-0.5 text-[var(--color-text-muted)]">
              {prListTab === "open" ? "live" : "history"}
            </span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="mb-2 flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-text-secondary)]">
            <Folder className="h-4 w-4" /> GitHub pull requests
          </div>
          <div className="space-y-2">
            {filteredPrs.length > 0 ? (
              filteredPrs.map((pr) => (
                <PrSummary
                  key={pr.number}
                  pr={pr}
                  selected={currentPr?.number === pr.number}
                  onClick={() => {
                    setSelectedPullRequestId(String(pr.number));
                    setSelectedFilePath(null);
                  }}
                />
              ))
            ) : (
              <EmptyState
                message={
                  livePrs.length === 0
                    ? "No pull requests returned by GitHub."
                    : listedPrs.length === 0
                      ? `No ${prListTab} pull requests returned by GitHub.`
                      : "No pull requests match this filter."
                }
              />
            )}
          </div>
          <div className="mt-4 mb-2 flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-text-secondary)]">
            <FileCode2 className="h-4 w-4" /> Changed files
          </div>
          <label className="mb-2 flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2 py-1.5 text-xs text-[var(--color-text-muted)]">
            <Search className="h-3.5 w-3.5" />
            <input
              value={fileFilter}
              onChange={(event) => setFileFilter(event.target.value)}
              placeholder="Filter changed files"
              className="min-w-0 flex-1 bg-transparent text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
            />
          </label>
          <div className="space-y-2">
            {changedFiles.length > 0 ? (
              visibleChangedFiles.length > 0 ? (
                visibleChangedFiles.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => {
                      setSelectedFilePath(file.path);
                      setActiveTab("files");
                    }}
                    className={`w-full rounded-md border p-3 text-left text-sm transition-colors ${selectedFile?.path === file.path ? "border-[var(--color-border-accent)] bg-[var(--color-bg-selected-muted)] text-[var(--color-text-primary)]" : "border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-hover)]"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs text-[var(--color-text-secondary)]">
                        {file.path}
                      </span>
                      {commentCountsByPath.get(file.path) ? (
                        <span className="shrink-0 rounded-full bg-[var(--color-accent)]/15 px-2 py-0.5 text-[10px] text-[var(--color-accent)]">
                          {commentCountsByPath.get(file.path)} comments
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex gap-3 text-xs">
                      <span className="text-[var(--color-success)]">
                        +{file.additions}
                      </span>
                      <span className="text-[var(--color-danger)]">
                        -{file.deletions}
                      </span>
                      <span className="text-[var(--color-text-muted)]">
                        {file.status}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <EmptyState message="No changed files match this filter." />
              )
            ) : currentPr ? (
              <EmptyState
                message={
                  prDiffLoading
                    ? "Loading PR file diff…"
                    : diffUnavailable
                      ? (diffErrorMessage ?? "GitHub diff failed to load.")
                      : prFetchWarning
                        ? prFetchWarning
                        : "No changed files returned for this pull request."
                }
              />
            ) : (
              <EmptyState message="Select a live pull request to inspect file diffs." />
            )}
          </div>
        </div>
        <div className="border-t border-[var(--color-border)] p-3 text-xs text-[var(--color-text-secondary)]">
          <div className="flex justify-between">
            <span>Changed files</span>
            <span>{changedFiles.length}</span>
          </div>
          <p className="mt-2 text-[var(--color-text-muted)]">
            {currentPr
              ? `PR #${currentPr.number} diff is loaded from GitHub.`
              : "Select a live pull request to inspect file diffs."}
          </p>
        </div>
      </aside>

      <main className="flex min-h-0 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded bg-[color:rgba(88,166,255,0.14)] px-2 py-1 text-sm text-[var(--color-accent)]">
              {currentPr ? `PR #${currentPr.number}` : "No PR"}
            </span>
            <h2 className="truncate font-semibold">
              {currentPr?.title ?? "No pull request selected"}
            </h2>
            {currentPr ? (
              <span
                className={`rounded px-2 py-1 text-xs ${pullRequestStateClass(currentPr)}`}
              >
                {stateLabel(currentPr.isDraft ? "draft" : currentPr.state)}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            <GitPullRequestArrow className="h-4 w-4" />{" "}
            {parentPr ? (
              <>
                Next returned PR{" "}
                <span className="text-[var(--color-accent)]">
                  #{parentPr.number}
                </span>
              </>
            ) : (
              "Live GitHub overview"
            )}
          </div>
        </header>
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4">
          <div className="flex items-center gap-8 text-sm">
            {(
              [
                ["conversations", "Conversations", commentCount],
                ["files", "Files Changed", changedFiles.length],
                ["checks", "Checks", checkRows.length],
                ["stack", "Stack", stackCandidates.length],
              ] as const
            ).map(([tab, label, count]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`py-3 ${activeTab === tab ? "border-b-2 border-[var(--color-accent)] font-semibold text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}`}
              >
                {label}{" "}
                <b className="ml-2 rounded bg-[var(--color-bg-surface)] px-2">
                  {count}
                </b>
              </button>
            ))}
          </div>
          <span
            className={`max-w-[320px] truncate rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-xs ${providerTone}`}
          >
            {providerDetail}
          </span>
        </div>
        {reviewActionError ? (
          <div className="border-b border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-2 text-xs text-[var(--color-danger)]">
            {formatErrorMessage(reviewActionError)}
          </div>
        ) : null}
        {diffErrorMessage || prFetchWarning ? (
          <div className="border-b border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-2 text-xs text-[var(--color-danger)]">
            {diffErrorMessage ?? prFetchWarning}
          </div>
        ) : null}
        {activeTab === "files" ? (
          <>
            <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-sm">
              <span className="inline-flex min-w-0 items-center gap-2">
                <FileCode2 className="h-4 w-4" />{" "}
                <span className="truncate font-mono">
                  {selectedFile?.path ?? "No file selected"}
                </span>
                {selectedFile ? (
                  <span className="shrink-0 rounded-full bg-[var(--color-bg-surface)] px-2 py-0.5 text-xs text-[var(--color-text-secondary)]">
                    +{selectedFile.additions} / -{selectedFile.deletions}
                  </span>
                ) : null}
                {selectedFileCommentCount > 0 ? (
                  <span className="shrink-0 rounded-full bg-[var(--color-accent)]/15 px-2 py-0.5 text-xs text-[var(--color-accent)]">
                    {selectedFileCommentCount} line comment
                    {selectedFileCommentCount === 1 ? "" : "s"}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {prDiffLoading
                  ? "Loading GitHub diff…"
                  : currentPr
                    ? selectedPatch
                      ? `${selectedPatch.status}${selectedPatch.oldPath ? ` from ${selectedPatch.oldPath}` : ""}`
                      : `PR #${currentPr.number}`
                    : "No pull request selected"}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-[var(--color-bg-secondary)]">
              {selectedDiffText ? (
                <UnifiedDiffFallback
                  diffText={selectedDiffText}
                  filePath={
                    selectedPatch?.path ??
                    selectedFile?.path ??
                    `PR #${prDiff?.number ?? "selected"}`
                  }
                  oldFilePath={selectedPatch?.oldPath}
                  mode="unified"
                  focusedFilePath={selectedFile?.path ?? undefined}
                  selectedLine={lineCommentTarget}
                  onLineSelect={(selection) => {
                    setLineCommentTarget(selection);
                    setSelectedFilePath(selection.filePath);
                  }}
                />
              ) : (
                <div className="grid h-full place-items-center p-6">
                  <EmptyState
                    message={
                      currentPr
                        ? prDiffLoading
                          ? "Loading live pull request diff…"
                          : diffErrorMessage
                            ? diffErrorMessage
                            : selectedFile
                              ? (prFetchWarning ??
                                "No text patch returned for the selected file. It may be binary, too large, or omitted by GitHub.")
                              : (prFetchWarning ??
                                "No diff text returned for this pull request.")
                        : providerDetail
                    }
                  />
                </div>
              )}
            </div>
            {canMutateCurrentPr ? (
              <section className="border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-3">
                  <div className="mb-2 flex items-center justify-between gap-3 text-xs text-[var(--color-text-secondary)]">
                    <span>
                      Inline comment target:{" "}
                      {lineCommentTarget ? (
                        <span className="font-mono text-[var(--color-text-primary)]">
                          {lineCommentTarget.filePath}:{lineCommentTarget.line}{" "}
                          {lineCommentTarget.side}
                        </span>
                      ) : (
                        "click a diff line"
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!lineCommentTarget}
                      onClick={() => {
                        setLineCommentTarget(null);
                        setLineCommentBody("");
                      }}
                      className="text-[var(--color-text-muted)]"
                    >
                      Clear
                    </Button>
                  </div>
                  <textarea
                    value={lineCommentBody}
                    onChange={(event) => setLineCommentBody(event.target.value)}
                    rows={2}
                    placeholder="Add a GitHub review comment on the selected line…"
                    className="w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1.5 text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={
                        !lineCommentTarget ||
                        !lineCommentBody.trim() ||
                        reviewActionPending
                      }
                      onClick={submitLineComment}
                    >
                      Submit line comment
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}
          </>
        ) : activeTab === "stack" ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-bg-secondary)] p-4">
            <div className="mx-auto max-w-4xl space-y-4">
              <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Layers3 className="h-5 w-5 text-[var(--color-purple)]" />
                      <h3 className="font-semibold">Pull request stack</h3>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                      Dependency order is derived from each open pull request's
                      head and base branches. Landing uses squash merge, no
                      admin bypass, and preserves branches.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={reviewActionPending}
                      onClick={refreshPullRequestMetadata}
                    >
                      <RefreshCw className="h-4 w-4" /> Refresh
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!canSafelyLandStack || reviewActionPending}
                      onClick={() => void landPullRequestStack()}
                      title={stackLandingUnavailableReason}
                    >
                      <Layers3 className="h-4 w-4" /> Land stack
                    </Button>
                  </div>
                </div>

                {stackLandingOrder.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {stackLandingOrder.map((pr, index) => (
                      <button
                        key={pr.number}
                        type="button"
                        onClick={() =>
                          setSelectedPullRequestId(String(pr.number))
                        }
                        className={`grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border p-3 text-left ${currentPr?.number === pr.number ? "border-[var(--color-border-accent)] bg-[var(--color-bg-selected-muted)]" : "border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-hover)]"}`}
                      >
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--color-bg-surface)] text-xs font-semibold text-[var(--color-text-secondary)]">
                          {index + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            #{pr.number} {pr.title}
                          </span>
                          <span className="mt-1 block truncate font-mono text-xs text-[var(--color-text-muted)]">
                            {pr.headRefName ?? "head unavailable"} →{" "}
                            {pr.baseRefName ?? "base unavailable"}
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-1 text-[10px]">
                          <span
                            className={
                              pr.reviewDecision?.toLowerCase() === "approved"
                                ? "text-[var(--color-success)]"
                                : "text-[var(--color-warning)]"
                            }
                          >
                            {pr.reviewDecision ?? "review unknown"}
                          </span>
                          <span
                            className={
                              pr.mergeStateStatus?.toLowerCase() === "clean"
                                ? "text-[var(--color-success)]"
                                : "text-[var(--color-warning)]"
                            }
                          >
                            {pr.mergeStateStatus ?? "merge unknown"}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4">
                    <EmptyState
                      message={
                        stackLandingUnavailableReason ??
                        "No open pull requests returned by GitHub."
                      }
                    />
                  </div>
                )}
              </section>

              {stackLandingSafetyIssues.length > 0 ? (
                <section className="rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] p-4">
                  <h3 className="text-sm font-semibold text-[var(--color-danger)]">
                    Stack is not ready
                  </h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--color-text-secondary)]">
                    {stackLandingSafetyIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </section>
              ) : canSafelyLandStack ? (
                <section className="rounded-xl border border-[var(--color-success-border)] bg-[var(--color-success-bg)] p-4 text-sm text-[var(--color-success)]">
                  All {stackLandingOrder.length} pull requests are approved,
                  clean, and ready to land in order.
                </section>
              ) : null}
            </div>
          </div>
        ) : activeTab === "checks" ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-bg-secondary)] p-4">
            <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
              <button
                type="button"
                aria-expanded={checksExpanded}
                onClick={() => setChecksExpanded((expanded) => !expanded)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-[var(--color-bg-hover)]"
              >
                {checksExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <h3 className="font-semibold">Checks</h3>
                <span className="ml-auto text-xs text-[var(--color-text-secondary)]">
                  {passingChecks} of {checkRows.length} passing
                </span>
              </button>
              {checksExpanded ? (
                checkRows.length > 0 ? (
                  <div className="grid gap-px border-t border-[var(--color-border)] bg-[var(--color-border-muted)] sm:grid-cols-2 xl:grid-cols-3">
                    {checkRows.map((check, index) => (
                      <button
                        key={`${check.name}-${index}`}
                        type="button"
                        disabled={!check.url}
                        onClick={() =>
                          check.url && window.open(check.url, "_blank")
                        }
                        title={check.name}
                        className="grid min-h-20 grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-2 bg-[var(--color-bg-primary)] p-3 text-left hover:bg-[var(--color-bg-hover)] disabled:cursor-default"
                      >
                        <span
                          className={
                            check.passed
                              ? "text-[var(--color-success)]"
                              : "text-[var(--color-text-muted)]"
                          }
                        >
                          {check.passed ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : (
                            <ShieldCheck className="h-5 w-5" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="line-clamp-3 block break-words text-[11px] font-medium leading-4 text-[var(--color-text-primary)]">
                            {check.name}
                          </span>
                          {check.workflow || check.description ? (
                            <span className="mt-1 line-clamp-2 block text-[10px] leading-4 text-[var(--color-text-muted)]">
                              {check.workflow ?? check.description}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={
                            check.passed
                              ? "text-[10px] text-[var(--color-success)]"
                              : "text-[10px] text-[var(--color-text-muted)]"
                          }
                        >
                          {check.status}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="border-t border-[var(--color-border)] p-4">
                    <EmptyState message="No checks returned by GitHub." />
                  </div>
                )
              ) : null}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-bg-secondary)]">
            <div className="mx-auto flex max-w-4xl flex-col px-4 py-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Conversation
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!canMutateCurrentPr || reviewActionPending}
                    onClick={() => submitReview("approve")}
                    className="text-[var(--color-success)]"
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={!canMutateCurrentPr || reviewActionPending}
                    onClick={() => submitReview("request_changes")}
                  >
                    Request changes
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!canMutateCurrentPr || reviewActionPending}
                    onClick={() => submitReview("comment")}
                  >
                    Comment
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={!canMutateCurrentPr || reviewActionPending}
                    onClick={closePullRequest}
                  >
                    Close PR
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!currentPr?.url}
                    onClick={() =>
                      currentPr?.url && window.open(currentPr.url, "_blank")
                    }
                    className="text-[var(--color-accent)]"
                  >
                    <MessageSquarePlus className="h-4 w-4" /> Open
                  </Button>
                </div>
              </div>

              {currentPr || prDiff?.body ? (
                <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)]">
                  <div className="flex items-start gap-3 p-4">
                    <Avatar
                      src={prDiff?.authorAvatarUrl}
                      name={prDiff?.author ?? currentPr?.author}
                      size={32}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <b className="font-semibold text-[var(--color-text-primary)]">
                          {prDiff?.author ?? currentPr?.author ?? "GitHub"}
                        </b>
                        <AssociationBadge
                          value={prDiff?.authorAssociation ?? null}
                        />
                        <span className="text-[var(--color-text-secondary)]">
                          opened this pull request
                        </span>
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {formatRelative(prDiff?.createdAt)}
                        </span>
                      </div>
                      {currentPr ? (
                        <div className="mt-1 flex items-center gap-1.5 font-mono text-xs text-[var(--color-text-muted)]">
                          <span>{currentPr.headRefName ?? "head"}</span>
                          <ChevronRight className="h-3 w-3" />
                          <span>{currentPr.baseRefName ?? "base"}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="border-t border-[var(--color-border-muted)] px-4 py-4">
                    {prDiff?.body ? (
                      <Markdown>{prDiff.body}</Markdown>
                    ) : (
                      <p className="text-sm text-[var(--color-text-muted)]">
                        No description provided.
                      </p>
                    )}
                  </div>
                </section>
              ) : null}

              <div className="relative mt-4 pl-10 before:absolute before:bottom-2 before:left-[21px] before:top-2 before:w-px before:bg-[var(--color-border)]">
                {conversationItems.length > 0 ? (
                  conversationItems.map((item) =>
                    item.kind === "event" ? (
                      <EventRow key={item.id} item={item} />
                    ) : (
                      <CommentCard
                        key={item.id}
                        item={item}
                        onViewDiff={(path) => {
                          setSelectedFilePath(path);
                          setActiveTab("files");
                        }}
                      />
                    ),
                  )
                ) : (
                  <EmptyState message="No review activity returned by GitHub." />
                )}
              </div>
            </div>
          </div>
        )}
        {currentPr ? (
          <section className="border-t border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-3">
            <div className="grid gap-3 text-xs lg:grid-cols-[1.1fr_1fr_auto]">
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Complete pull request
                </h3>
                <p className="mt-1 text-[var(--color-text-muted)]">
                  {currentPr.headRefName ?? "head unavailable"} into{" "}
                  {currentPr.baseRefName ?? "base unavailable"} · Review{" "}
                  {currentPr.reviewDecision ?? "pending"} · Merge{" "}
                  {currentPr.mergeStateStatus ?? "unknown"}
                </p>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {(["squash", "merge", "rebase"] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setMergeMethod(method)}
                      className={`rounded-md border px-2 py-1.5 text-left ${mergeMethod === method ? "border-[var(--color-border-accent)] bg-[var(--color-bg-selected-muted)] text-[var(--color-text-primary)]" : "border-[var(--color-border-muted)] text-[var(--color-text-secondary)]"}`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
                <p className="text-[var(--color-text-muted)]">
                  {mergeMethodLabels[mergeMethod]}
                </p>
              </div>
              <div className="flex min-w-[220px] flex-col gap-2">
                <label className="inline-flex items-center gap-2 text-[var(--color-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={finalizeWithAdmin}
                    onChange={(event) =>
                      setFinalizeWithAdmin(event.target.checked)
                    }
                  />
                  Bypass required checks/reviews with admin override
                </label>
                <label className="inline-flex items-center gap-2 text-[var(--color-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={deleteHeadBranch}
                    onChange={(event) =>
                      setDeleteHeadBranch(event.target.checked)
                    }
                  />
                  Delete head branch after merge
                </label>
                <Button
                  variant="success"
                  disabled={!canMutateCurrentPr || reviewActionPending}
                  onClick={finalizePullRequest}
                >
                  Complete PR
                </Button>
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Admin bypass maps to <code>gh pr merge --admin</code>; GitHub will
              reject it unless the authenticated account can override branch
              protection.
            </p>
          </section>
        ) : null}
      </main>

      <aside className="min-h-0 overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Current PR</h3>
            {currentPr ? (
              <span
                className={`rounded px-2 py-1 text-xs ${pullRequestStateClass(currentPr)}`}
              >
                {stateLabel(currentPr.isDraft ? "draft" : currentPr.state)}
              </span>
            ) : null}
          </div>
          {currentPr ? (
            <>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                PR #{currentPr.number} · {currentPr.title}
              </p>
              <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                Updated by {currentPr.author ?? "GitHub"} ·{" "}
                {formatRelative(currentPr.updatedAt)}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <span className="rounded bg-[var(--color-bg-surface)] px-2 py-1">
                  Review: {currentPr.reviewDecision ?? "pending"}
                </span>
                <span className="rounded bg-[var(--color-bg-surface)] px-2 py-1">
                  Merge: {currentPr.mergeStateStatus ?? "unknown"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={reviewActionPending}
                  onClick={checkoutPullRequest}
                >
                  <GitBranch className="h-3.5 w-3.5" /> Checkout
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!canMutateCurrentPr || reviewActionPending}
                  onClick={updatePullRequestBranch}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Update branch
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={reviewActionPending}
                  onClick={refreshPullRequestMetadata}
                  className="col-span-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh metadata
                </Button>
              </div>
              <div className="mt-4 text-xs">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={!canMutateCurrentPr || reviewActionPending}
                  onClick={closePullRequest}
                  className="w-full"
                >
                  Close PR without merging
                </Button>
              </div>
              <div className="mt-4 space-y-3 border-l border-[var(--color-border)] pl-4 text-sm">
                <p className="rounded bg-[color:rgba(88,166,255,0.14)] p-2 text-[var(--color-accent)]">
                  {currentPr.headRefName ?? "head unavailable"}
                  <br />
                  <span className="text-[var(--color-text-secondary)]">
                    into {currentPr.baseRefName ?? "base unavailable"}
                  </span>
                </p>
                {parentPr ? (
                  <p>
                    Next returned PR #{parentPr.number}
                    <br />
                    <span className="text-[var(--color-text-muted)]">
                      {parentPr.title}
                    </span>
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">
              No pull request selected.
            </p>
          )}
        </div>
        <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">Labels</h3>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={!currentPr || reviewActionPending}
                onClick={() => editLabels("add")}
                className="text-[var(--color-accent)]"
              >
                Add
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={
                  !currentPr || reviewActionPending || labels.length === 0
                }
                onClick={() => editLabels("remove")}
              >
                Remove
              </Button>
            </div>
          </div>
          {labels.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {labels.map((label) => (
                <span
                  key={label.name}
                  title={label.description ?? undefined}
                  className="rounded-full border px-2 py-1 text-xs"
                  style={{
                    borderColor: label.color ? `#${label.color}` : undefined,
                    color: label.color ? `#${label.color}` : undefined,
                  }}
                >
                  {label.name}
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-3">
              <EmptyState message="No labels returned by GitHub." />
            </div>
          )}
        </div>
        <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Reviewers</h3>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canMutateCurrentPr || reviewActionPending}
              onClick={requestReview}
              className="text-[var(--color-accent)]"
            >
              Request review
            </Button>
          </div>
          {pendingReviewers.length > 0 ? (
            <div className="mt-3 space-y-2 text-sm">
              {pendingReviewers.map((reviewer) => (
                <div
                  key={`${reviewer.kind}-${reviewer.login}`}
                  className="flex items-center justify-between"
                >
                  <span>{reviewer.login}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {reviewer.kind}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {reviewRows.length > 0 ? (
            reviewRows.map((review) => (
              <div
                key={`${review.name}-${review.state}`}
                className="mt-3 flex items-center justify-between text-sm"
              >
                <span>
                  {review.name}
                  {review.isAuthor && (
                    <span className="ml-2 rounded bg-[color:rgba(88,166,255,0.14)] px-1.5 text-xs text-[var(--color-accent)]">
                      Author
                    </span>
                  )}
                </span>
                {review.state.toLowerCase().includes("approved") ? (
                  <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
                ) : (
                  <Circle className="h-4 w-4 text-[var(--color-text-muted)]" />
                )}
              </div>
            ))
          ) : (
            <div className="mt-3">
              <EmptyState message="No reviews returned by GitHub." />
            </div>
          )}
        </div>
        <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Checks</h3>
            <span className="text-xs text-[var(--color-text-secondary)]">
              {passingChecks} of {checkRows.length} passing
            </span>
          </div>
          {checkRows.length > 0 ? (
            checkRows.map((check) => (
              <div
                key={check.name}
                className="mt-3 flex items-center justify-between text-sm"
              >
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  {check.name}
                </span>
                <span
                  className={
                    check.passed
                      ? "text-[var(--color-success)]"
                      : "text-[var(--color-text-muted)]"
                  }
                >
                  {check.status}
                </span>
              </div>
            ))
          ) : (
            <div className="mt-3">
              <EmptyState message="No checks returned by GitHub." />
            </div>
          )}
        </div>
        <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Impacted summary</h3>
            <Filter className="h-4 w-4 text-[var(--color-text-muted)]" />
          </div>
          {changedFiles.length > 0 ? (
            <div className="mt-3 space-y-2 text-sm">
              {changedFiles.slice(0, 6).map((file) => (
                <div
                  key={file.path}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="truncate font-mono text-xs">
                    {file.path}
                  </span>
                  <span className="shrink-0 text-xs">
                    <span className="text-[var(--color-success)]">
                      +{file.additions}
                    </span>{" "}
                    <span className="text-[var(--color-danger)]">
                      -{file.deletions}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">
              No PR file impact returned by GitHub.
            </p>
          )}
        </div>
      </aside>
    </section>
  );
}
