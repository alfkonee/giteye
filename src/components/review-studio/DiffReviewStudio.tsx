import { useEffect, useMemo, useState } from "react";
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
import {
  UnifiedDiffFallback,
  type DiffLineSelection,
} from "../diff-viewer/UnifiedDiffFallback";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { gitApi } from "../../lib/tauri-api";
import { useAppStore } from "../../stores/app-store";
import type {
  ActivityItem,
  CheckRunSummary,
  PullRequestSummary,
  PullRequestFileDiff,
  ReviewCommentSummary,
  ReviewSummary,
} from "../../types/git";

interface ReviewRow {
  name: string;
  state: string;
  body: string;
  age: string;
  url: string | null;
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
  url: string | null;
}

type ReviewStudioTab = "conversations" | "files" | "checks";
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
  };
};

const reviewFromSummary = (
  review: ReviewSummary,
  author: string | null | undefined,
): ReviewRow => {
  const state = stateLabel(review.state);
  const body = review.body?.trim() || `Submitted a ${state.toLowerCase()} review.`;
  return {
    name: review.author ?? "GitHub reviewer",
    state,
    body,
    age: formatRelative(review.submittedAt),
    url: review.url,
    isAuthor: Boolean(author && review.author === author),
  };
};

const activityFromSummary = (activity: ActivityItem): ActivityRow => ({
  author: activity.actor ?? "GitHub",
  message: activity.title?.trim() || stateLabel(activity.kind),
  age: formatRelative(activity.createdAt),
  url: activity.url,
});

const commentFromSummary = (comment: ReviewCommentSummary): ActivityRow => ({
  author: comment.author ?? "GitHub reviewer",
  message: comment.path
    ? `${comment.path}${comment.line ? `:${comment.line}` : ""} — ${comment.body || "No comment body returned."}`
    : comment.body || "No comment body returned.",
  age: formatRelative(comment.createdAt),
  url: comment.url,
});

const filesFromDiff = (
  diffText: string | null | undefined,
): PullRequestFileDiff[] => {
  if (!diffText) return [];
  const files: PullRequestFileDiff[] = [];
  let current: PullRequestFileDiff | null = null;
  for (const line of diffText.split("\n")) {
    const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (match) {
      current = {
        path: match[2],
        additions: 0,
        deletions: 0,
        status: "modified",
      };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("new file mode")) current.status = "added";
    else if (line.startsWith("deleted file mode")) current.status = "deleted";
    else if (line.startsWith("+") && !line.startsWith("+++")) current.additions += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) current.deletions += 1;
  }
  return files;
};

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
      className={`w-full rounded-md border p-3 text-left text-sm transition-colors ${selected ? "border-[var(--color-accent)] bg-[var(--color-bg-selected)]/15" : "border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-hover)]"}`}
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
  const { data: githubOverview, isError } = useQuery(
    gitQueries.githubOverview(activeRepoPath),
  );
  const livePrs = githubOverview?.pullRequests ?? [];
  const selectedPullRequestId = useAppStore((s) => s.selectedPullRequestId);
  const setSelectedPullRequestId = useAppStore(
    (s) => s.setSelectedPullRequestId,
  );
  const [prFilter, setPrFilter] = useState("");
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [lineCommentTarget, setLineCommentTarget] =
    useState<DiffLineSelection | null>(null);
  const [lineCommentBody, setLineCommentBody] = useState("");
  const [activeTab, setActiveTab] = useState<ReviewStudioTab>("conversations");
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>("squash");
  const [finalizeWithAdmin, setFinalizeWithAdmin] = useState(false);
  const [deleteHeadBranch, setDeleteHeadBranch] = useState(true);

  const selectedPrNumber = selectedPullRequestId
    ? Number(selectedPullRequestId)
    : null;
  const currentPr =
    livePrs.find((pr) => pr.number === selectedPrNumber) ?? livePrs[0] ?? null;
  const filteredPrs = useMemo(() => {
    const query = prFilter.trim().toLowerCase();
    if (!query) return livePrs;
    return livePrs.filter((pr) =>
      [`#${pr.number}`, pr.title, pr.author, pr.headRefName, pr.baseRefName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [livePrs, prFilter]);

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
  } = useQuery(
    gitQueries.pullRequestDiff(activeRepoPath, currentPr?.number ?? null),
  );
  const currentPrIndex = currentPr
    ? livePrs.findIndex((pr) => pr.number === currentPr.number)
    : -1;
  const parentPr =
    currentPrIndex >= 0 ? (livePrs[currentPrIndex + 1] ?? null) : null;
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
  const checkRows = (prDiff?.checkRuns ?? githubOverview?.checkRuns ?? []).map(
    statusFromCheck,
  );
  const reviewRows = (prDiff?.reviews ?? githubOverview?.reviews ?? []).map(
    (review) => reviewFromSummary(review, currentPr?.author),
  );
  const activityRows = [
    ...(prDiff?.comments ?? []).map(commentFromSummary),
    ...(prDiff?.activity ?? githubOverview?.activity ?? [])
      .slice(0, 8)
      .map(activityFromSummary),
  ];
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
  const commentCount = activityRows.length + reviewRows.length;
  const derivedChangedFiles = useMemo(
    () => filesFromDiff(prDiff?.diffText),
    [prDiff?.diffText],
  );
  const changedFiles =
    prDiff?.files && prDiff.files.length > 0
      ? prDiff.files
      : derivedChangedFiles;
  const firstChangedFilePath = changedFiles[0]?.path ?? null;
  const diffErrorMessage = formatErrorMessage(prDiffError);
  const diffUnavailable = currentPr && !prDiffLoading && !prDiff && prDiffError;
  const prFetchWarning = prDiff?.fetchError ?? null;
  const selectedFile =
    changedFiles.find((file) => file.path === selectedFilePath) ??
    changedFiles[0] ??
    null;
  const pendingReviewers = currentPr?.reviewRequests ?? [];
  const labels = currentPr?.labels ?? [];
  const reviewActionPending =
    requestReviewMutation.isPending ||
    submitReviewMutation.isPending ||
    addLabelMutation.isPending ||
    removeLabelMutation.isPending ||
    lineCommentMutation.isPending ||
    mergePrMutation.isPending ||
    closePrMutation.isPending;
  const reviewActionError =
    requestReviewMutation.error ??
    submitReviewMutation.error ??
    addLabelMutation.error ??
    removeLabelMutation.error ??
    lineCommentMutation.error ??
    mergePrMutation.error ??
    closePrMutation.error;
  const canMutateCurrentPr = Boolean(
    currentPr && currentPr.state?.toLowerCase() === "open",
  );
  const requestReview = () => {
    if (!currentPr) return;
    const input = window.prompt("Reviewer usernames or teams, comma-separated");
    const reviewers =
      input
        ?.split(",")
        .map((reviewer) => reviewer.trim())
        .filter(Boolean) ?? [];
    if (reviewers.length === 0) return;
    requestReviewMutation.mutate({ number: currentPr.number, reviewers });
  };
  const submitReview = (event: "approve" | "request_changes" | "comment") => {
    if (!currentPr) return;
    const body =
      event === "approve"
        ? (window.prompt("Optional approval note") ?? undefined)
        : window.prompt(
            event === "request_changes"
              ? "Describe requested changes"
              : "Review comment",
          );
    if (event !== "approve" && !body?.trim()) return;
    submitReviewMutation.mutate({
      number: currentPr.number,
      event,
      body: body?.trim() || undefined,
    });
  };
  const editLabels = (mode: "add" | "remove") => {
    if (!currentPr) return;
    const input = window.prompt(
      mode === "add"
        ? "Labels to add, comma-separated"
        : "Labels to remove, comma-separated",
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
  const finalizePullRequest = () => {
    if (!currentPr) return;
    const bypassCopy = finalizeWithAdmin
      ? " This will ask GitHub to bypass required checks/reviews with --admin."
      : "";
    if (
      !window.confirm(
        `Complete PR #${currentPr.number} with ${mergeMethodLabels[mergeMethod]}?${bypassCopy}`,
      )
    )
      return;
    mergePrMutation.mutate({
      number: currentPr.number,
      method: mergeMethod,
      admin: finalizeWithAdmin,
      deleteBranch: deleteHeadBranch,
    });
  };
  const closePullRequest = () => {
    if (!currentPr) return;
    if (!window.confirm(`Close PR #${currentPr.number} without merging?`))
      return;
    closePrMutation.mutate(currentPr.number);
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
    setLineCommentTarget(null);
    setLineCommentBody("");
  }, [currentPr?.number, firstChangedFilePath]);

  return (
    <section className="grid h-full min-h-0 grid-cols-[260px_minmax(650px,1fr)_300px] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <aside className="flex min-h-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <div className="border-b border-[var(--color-border)] p-3">
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
              {filteredPrs.length} / {livePrs.length} pull requests
            </span>
            <span className="rounded-full bg-[var(--color-bg-surface)] px-2 py-0.5 text-[var(--color-text-muted)]">
              live
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
                  livePrs.length > 0
                    ? "No pull requests match this filter."
                    : "No pull requests returned by GitHub."
                }
              />
            )}
          </div>
          <div className="mt-4 mb-2 flex items-center gap-1 px-2 py-1 text-xs text-[var(--color-text-secondary)]">
            <FileCode2 className="h-4 w-4" /> Changed files
          </div>
          <div className="space-y-2">
            {changedFiles.length > 0 ? (
              changedFiles.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setSelectedFilePath(file.path)}
                  className={`w-full rounded-md border p-3 text-left text-sm transition-colors ${selectedFile?.path === file.path ? "border-[var(--color-accent)] bg-[var(--color-bg-selected)]/15" : "border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-hover)]"}`}
                >
                  <div className="truncate font-mono text-xs text-[var(--color-text-secondary)]">
                    {file.path}
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
            ) : livePrs.length > 0 ? (
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
              <span className="rounded bg-[color:rgba(63,185,80,0.12)] px-2 py-1 text-xs text-[var(--color-success)]">
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
          <div className="border-b border-[var(--color-danger)]/30 bg-[color:rgba(248,81,73,0.08)] px-4 py-2 text-xs text-[var(--color-danger)]">
            {formatErrorMessage(reviewActionError)}
          </div>
        ) : null}
        {diffErrorMessage || prFetchWarning ? (
          <div className="border-b border-[var(--color-danger)]/30 bg-[color:rgba(248,81,73,0.08)] px-4 py-2 text-xs text-[var(--color-danger)]">
            {diffErrorMessage ?? prFetchWarning}
          </div>
        ) : null}
        {activeTab === "files" ? (
          <>
            <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-sm">
              <span className="inline-flex items-center gap-2">
                <FileCode2 className="h-4 w-4" />{" "}
                {selectedFile?.path ?? "No file selected"}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {prDiffLoading
                  ? "Loading GitHub diff…"
                  : currentPr
                    ? `PR #${currentPr.number}`
                    : "No pull request selected"}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden bg-[var(--color-bg-secondary)]">
              {prDiff?.diffText ? (
                <UnifiedDiffFallback
                  diffText={prDiff.diffText}
                  filePath={selectedFile?.path ?? `PR #${prDiff.number}`}
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
                            : (prFetchWarning ?? "No diff text returned for this pull request.")
                        : providerDetail
                    }
                  />
                </div>
              )}
            </div>
            {currentPr ? (
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
                    <button
                      disabled={!lineCommentTarget}
                      onClick={() => {
                        setLineCommentTarget(null);
                        setLineCommentBody("");
                      }}
                      className="text-[var(--color-text-muted)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Clear
                    </button>
                  </div>
                  <textarea
                    value={lineCommentBody}
                    onChange={(event) => setLineCommentBody(event.target.value)}
                    rows={2}
                    placeholder="Add a GitHub review comment on the selected line…"
                    className="w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1.5 text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      disabled={
                        !lineCommentTarget ||
                        !lineCommentBody.trim() ||
                        reviewActionPending
                      }
                      onClick={submitLineComment}
                      className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Submit line comment
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
          </>
        ) : activeTab === "checks" ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-bg-secondary)] p-4">
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">Checks</h3>
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {passingChecks} of {checkRows.length} passing
                </span>
              </div>
              {checkRows.length > 0 ? (
                checkRows.map((check) => (
                  <div
                    key={check.name}
                    className="mt-3 flex items-center justify-between text-sm first:mt-0"
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
                <EmptyState message="No checks returned by GitHub." />
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-bg-secondary)] p-4">
            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4">
              <div className="mb-3 flex items-center justify-between gap-3 text-sm">
                <div className="flex gap-5">
                  <span className="font-semibold">
                    Activity ({commentCount})
                  </span>
                  <span className="text-[var(--color-text-secondary)]">
                    GitHub comments, reviews, and timeline
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={!currentPr || reviewActionPending}
                    onClick={() => submitReview("approve")}
                    className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-success)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    disabled={!currentPr || reviewActionPending}
                    onClick={() => submitReview("request_changes")}
                    className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Request changes
                  </button>
                  <button
                    disabled={!currentPr || reviewActionPending}
                    onClick={() => submitReview("comment")}
                    className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Comment
                  </button>
                  <button
                    disabled={!canMutateCurrentPr || reviewActionPending}
                    onClick={closePullRequest}
                    className="rounded-md border border-[var(--color-danger)]/50 px-2 py-1 text-xs text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Close PR
                  </button>
                  <button
                    disabled={!currentPr?.url}
                    onClick={() =>
                      currentPr?.url && window.open(currentPr.url, "_blank")
                    }
                    className="inline-flex items-center gap-2 text-[var(--color-accent)] disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)]"
                  >
                    <MessageSquarePlus className="h-4 w-4" /> Open
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {reviewRows.length > 0
                  ? reviewRows.map((review) => (
                      <div
                        key={`${review.name}-${review.state}`}
                        className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{review.name}</span>
                          <span className="text-xs text-[var(--color-text-muted)]">
                            {review.age} · {review.state}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-[var(--color-text-secondary)]">
                          {review.body}
                        </p>
                        {review.url ? (
                          <button
                            type="button"
                            onClick={() => window.open(review.url!, "_blank")}
                            className="mt-2 text-xs text-[var(--color-accent)]"
                          >
                            Open review
                          </button>
                        ) : null}
                      </div>
                    ))
                  : null}
                {activityRows.length > 0 ? (
                  activityRows.map((activity) => (
                    <div
                      key={`${activity.author}-${activity.message}`}
                      className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <b className="text-[var(--color-text-primary)]">
                          {activity.author}
                        </b>
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {activity.age}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-[var(--color-text-secondary)]">
                        {activity.message}
                      </p>
                      {activity.url ? (
                        <button
                          type="button"
                          onClick={() => window.open(activity.url!, "_blank")}
                          className="mt-2 text-xs text-[var(--color-accent)]"
                        >
                          Open on GitHub
                        </button>
                      ) : null}
                    </div>
                  ))
                ) : reviewRows.length === 0 ? (
                  <EmptyState message="No review activity returned by GitHub." />
                ) : null}
              </div>
            </section>
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
                      className={`rounded-md border px-2 py-1.5 text-left ${mergeMethod === method ? "border-[var(--color-accent)] bg-[var(--color-bg-selected)]/20 text-[var(--color-text-primary)]" : "border-[var(--color-border-muted)] text-[var(--color-text-secondary)]"}`}
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
                    onChange={(event) => setFinalizeWithAdmin(event.target.checked)}
                  />
                  Bypass required checks/reviews with admin override
                </label>
                <label className="inline-flex items-center gap-2 text-[var(--color-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={deleteHeadBranch}
                    onChange={(event) => setDeleteHeadBranch(event.target.checked)}
                  />
                  Delete head branch after merge
                </label>
                <button
                  disabled={!canMutateCurrentPr || reviewActionPending}
                  onClick={finalizePullRequest}
                  className="rounded-md bg-[var(--color-success)] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Complete PR
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
              Admin bypass maps to <code>gh pr merge --admin</code>; GitHub will reject it unless the authenticated account can override branch protection.
            </p>
          </section>
        ) : null}
      </main>

      <aside className="min-h-0 overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Current PR</h3>
            {currentPr ? (
              <span className="rounded bg-[color:rgba(63,185,80,0.12)] px-2 py-1 text-xs text-[var(--color-success)]">
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
              <div className="mt-4 text-xs">
                <button
                  disabled={!canMutateCurrentPr || reviewActionPending}
                  onClick={closePullRequest}
                  className="w-full rounded-md border border-[var(--color-danger)]/50 px-2 py-1.5 text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Close PR without merging
                </button>
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
              <button
                disabled={!currentPr || reviewActionPending}
                onClick={() => editLabels("add")}
                className="text-xs text-[var(--color-accent)] disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)]"
              >
                Add
              </button>
              <button
                disabled={
                  !currentPr || reviewActionPending || labels.length === 0
                }
                onClick={() => editLabels("remove")}
                className="text-xs text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)]"
              >
                Remove
              </button>
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
            <button
              disabled={!currentPr || reviewActionPending}
              onClick={requestReview}
              className="text-xs text-[var(--color-accent)] disabled:cursor-not-allowed disabled:text-[var(--color-text-muted)]"
            >
              Request review
            </button>
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
