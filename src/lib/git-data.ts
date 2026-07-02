import {
  mutationOptions,
  queryOptions,
  type QueryClient,
} from "@tanstack/react-query";
import {
  gitApi,
  type BisectStartRequest,
  type CheckoutBranchStrategy,
  type PatchApplyRequest,
  type PushBranchRequest,
} from "./tauri-api";
import type {
  BlameFileRequest,
  CommitSearchRequest,
  FileHistoryRequest,
  GitGrepRequest,
  GitMaintenanceMode,
  PickaxeSearchRequest,
  MergeWithOptionsRequest,
  StartRebaseRequest,
  RebaseTodoItem,
  ResetMode,
} from "../types/git";
import { useNoticeStore } from "../stores/notice-store";

const enabledRepo = (repoPath: string | null | undefined): repoPath is string =>
  Boolean(repoPath);

type GitInvalidationReason = "worktree" | "refs" | "remote" | "rebase" | "reflog" | "bisect";
export interface CheckoutBranchRequest {
  branchName: string;
  strategy: CheckoutBranchStrategy;
}
export interface CreateBranchRequest {
  name: string;
  checkout: boolean;
  startPoint?: string | null;
}

export interface RenameBranchRequest {
  oldName: string;
  newName: string;
}

export interface SetBranchUpstreamRequest {
  branchName: string;
  upstream?: string | null;
}


export interface FastForwardBranchRequest {
  branchName: string;
  upstream: string;
}

export interface AddRemoteRequest {
  name: string;
  url: string;
}

export interface UpdateRemoteRequest {
  name: string;
  fetchUrl: string;
  pushUrl?: string | null;
}

export interface DeleteRemoteBranchRequest {
  remote: string;
  branch: string;
}

export interface RemoteTagRequest {
  remote: string;
  name: string;
}


export interface MoveWorktreeRequest {
  path: string;
  newPath: string;
}

export interface LockWorktreeRequest {
  path: string;
  reason: string | null;
}

export interface SubmoduleInitUpdateRequest {
  path: string | null;
  recursive: boolean;
  remote: boolean;
}

export interface AddSubmoduleRequest {
  url: string;
  path: string;
  branch?: string | null;
  name?: string | null;
}

export interface SubmoduleSetBranchRequest {
  path: string;
  branch: string;
}

export interface CreateStashRequest {
  message?: string;
  includeUntracked: boolean;
}

export interface CreateStashForPathsRequest extends CreateStashRequest {
  paths: string[];
}

export interface CreateTagRequest {
  name: string;
  target?: string;
  message?: string;
}

export interface HunkPatchRequest {
  filePath: string;
  hunkPatch: string;
  staged?: boolean;
}

export interface DiscardFileRequest {
  filePath: string;
  staged: boolean;
  untracked: boolean;
}
export interface RequestPullRequestReviewRequest {
  number: number;
  reviewers: string[];
  teams?: string[];
}

export interface SubmitPullRequestReviewRequest {
  number: number;
  event: "approve" | "request_changes" | "comment";
  body?: string;
}

export interface SubmitPullRequestLineCommentRequest {
  number: number;
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  body: string;
}
export interface EditPullRequestLabelsRequest {
  number: number;
  labels: string[];
}

export interface MergePullRequestRequest {
  number: number;
  method: "merge" | "rebase" | "squash";
  admin?: boolean;
  deleteBranch?: boolean;
}

export interface GenerateSshKeyRequest {
  name: string;
  comment: string | null;
}

export interface HistoryCommitRequest {
  commitHash: string;
}

export interface ResetToCommitRequest extends HistoryCommitRequest {
  mode: ResetMode;
  confirmDiscardChanges: boolean;
}

export interface AmendCommitRequest {
  message?: string | null;
}

export interface ReflogSelectorRequest {
  selector: string;
}

export interface CreateBranchFromReflogRequest extends ReflogSelectorRequest {
  branchName: string;
  checkout: boolean;
}

export type BisectMarkRequest = {
  revision?: string | null;
};

export type RunGitFsckRequest = {
  full: boolean;
  strict: boolean;
};

export type RunGitMaintenanceRequest = {
  mode: GitMaintenanceMode;
};

export type VerifyGitSignatureRequest = {
  target: string;
};

export const gitKeys = {
  all: ["git"] as const,
  recentRepositories: () => [...gitKeys.all, "recent-repositories"] as const,
  favoriteRepositories: () =>
    [...gitKeys.all, "favorite-repositories"] as const,
  gitJobs: (repoPath: string | null | undefined) =>
    [...gitKeys.all, "jobs", repoPath ?? null] as const,
  repository: (repoPath: string | null | undefined) =>
    [...gitKeys.all, "repository", repoPath] as const,
  repositorySnapshot: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "snapshot"] as const,
  repositoryInfo: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "info"] as const,
  status: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "status"] as const,
  stagedFiles: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "staged-files"] as const,
  unstagedFiles: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "unstaged-files"] as const,
  commits: (repoPath: string | null | undefined, limit?: number) =>
    [...gitKeys.repository(repoPath), "commits", limit ?? null] as const,
  commitDetails: (
    repoPath: string | null | undefined,
    commitHash: string | null | undefined,
  ) => [...gitKeys.repository(repoPath), "commit-details", commitHash] as const,
  fileDiff: (
    repoPath: string | null | undefined,
    filePath: string | null | undefined,
    staged: boolean,
  ) =>
    [...gitKeys.repository(repoPath), "file-diff", filePath, staged] as const,
  commitDiff: (
    repoPath: string | null | undefined,
    commitHash: string | null | undefined,
  ) => [...gitKeys.repository(repoPath), "commit-diff", commitHash] as const,
  reflog: (repoPath: string | null | undefined, limit?: number) =>
    [...gitKeys.repository(repoPath), "reflog", limit ?? null] as const,
  reflogSearch: (
    repoPath: string | null | undefined,
    query: string | null | undefined,
    limit?: number,
  ) => [...gitKeys.repository(repoPath), "reflog-search", query ?? null, limit ?? null] as const,
  commitSearch: (
    repoPath: string | null | undefined,
    request: CommitSearchRequest | null | undefined,
  ) => [...gitKeys.repository(repoPath), "commit-search", request] as const,
  fileHistory: (
    repoPath: string | null | undefined,
    request: FileHistoryRequest | null | undefined,
  ) => [...gitKeys.repository(repoPath), "file-history", request] as const,
  blameFile: (
    repoPath: string | null | undefined,
    request: BlameFileRequest | null | undefined,
  ) => [...gitKeys.repository(repoPath), "blame", request] as const,
  gitGrep: (
    repoPath: string | null | undefined,
    request: GitGrepRequest | null | undefined,
  ) => [...gitKeys.repository(repoPath), "grep", request] as const,
  pickaxeSearch: (
    repoPath: string | null | undefined,
    request: PickaxeSearchRequest | null | undefined,
  ) => [...gitKeys.repository(repoPath), "pickaxe", request] as const,
  lostCommits: (repoPath: string | null | undefined, limit?: number) =>
    [...gitKeys.repository(repoPath), "lost-commits", limit ?? null] as const,
  branchSummary: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "branch-summary"] as const,
  workspaceSummary: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "workspace-summary"] as const,
  branches: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "branches"] as const,
  gitIdentity: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "git-identity"] as const,
  gitCredentialConfig: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "git-credential-config"] as const,
  lfsStatus: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "lfs-status"] as const,
  sshStatus: () => [...gitKeys.all, "ssh-status"] as const,
  remotes: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "remotes"] as const,
  stashes: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "stashes"] as const,
  tags: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "tags"] as const,
  worktrees: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "worktrees"] as const,
  submodules: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "submodules"] as const,
  submoduleForeachStatus: (
    repoPath: string | null | undefined,
    recursive: boolean,
  ) =>
    [...gitKeys.repository(repoPath), "submodule-foreach-status", recursive] as const,
  rebaseState: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "rebase-state"] as const,
  operationSummary: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "operation-summary"] as const,
  rerereStatus: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "rerere-status"] as const,
  bisectState: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "bisect-state"] as const,
  conflictContent: (
    repoPath: string | null | undefined,
    filePath: string | null | undefined,
  ) => [...gitKeys.repository(repoPath), "conflict-content", filePath] as const,
  githubOverview: (repoPath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "github-overview"] as const,
  pullRequestDiff: (
    repoPath: string | null | undefined,
    number: number | null | undefined,
  ) => [...gitKeys.repository(repoPath), "pull-request-diff", number] as const,
};

export function invalidateGitState(
  queryClient: QueryClient,
  repoPath: string | null | undefined,
) {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: gitKeys.recentRepositories() }),
    queryClient.invalidateQueries({ queryKey: gitKeys.favoriteRepositories() }),
  ];
  if (repoPath) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: gitKeys.repository(repoPath) }),
    );
  }

  return Promise.all(invalidations);
}

export function invalidateGitStateByReason(
  queryClient: QueryClient,
  repoPath: string | null | undefined,
  reason: GitInvalidationReason | string,
) {
  if (!repoPath) {
    return invalidateGitState(queryClient, repoPath);
  }

  const invalidations = [
    queryClient.invalidateQueries({
      queryKey: gitKeys.repositorySnapshot(repoPath),
    }),
  ];

  if (reason === "worktree") {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: gitKeys.worktrees(repoPath) }),
    );
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: gitKeys.submodules(repoPath) }),
    );
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: [...gitKeys.repository(repoPath), "submodule-foreach-status"],
      }),
    );
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: [...gitKeys.repository(repoPath), "file-diff"],
      }),
    );
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: gitKeys.stashes(repoPath) }),
    );
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: gitKeys.operationSummary(repoPath),
      }),
    );
  }

  if (reason === "refs" || reason === "remote" || reason === "rebase" || reason === "reflog" || reason === "bisect") {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: gitKeys.branchSummary(repoPath),
      }),
    );
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: [...gitKeys.repository(repoPath), "commits"],
      }),
    );
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: [...gitKeys.repository(repoPath), "commit-details"],
      }),
    );
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: [...gitKeys.repository(repoPath), "commit-diff"],
      }),
    );
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: gitKeys.branches(repoPath) }),
    );
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: gitKeys.remotes(repoPath) }),
    );
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: gitKeys.tags(repoPath) }),
    );
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: [...gitKeys.repository(repoPath), "reflog"],
      }),
    );
  }

  if (reason === "worktree" || reason === "rebase" || reason === "bisect") {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: gitKeys.workspaceSummary(repoPath),
      }),
    );
  }

  if (reason === "remote") {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: gitKeys.githubOverview(repoPath),
      }),
    );
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: [...gitKeys.repository(repoPath), "pull-request-diff"],
      }),
    );
  }

  if (reason === "rebase") {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: gitKeys.rebaseState(repoPath),
      }),
    );
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: gitKeys.rerereStatus(repoPath),
      }),
    );
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: [...gitKeys.repository(repoPath), "conflict-content"],
      }),
    );
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: gitKeys.operationSummary(repoPath),
      }),
    );
  }

  if (reason === "bisect") {
    invalidations.push(
      queryClient.invalidateQueries({
        queryKey: gitKeys.bisectState(repoPath),
      }),
    );
  }

  return Promise.all(invalidations);
}

const RECOVERY_HINTS = {
  hardDiscard:
    "Recovery: discarded tracked changes may only be available from editor or OS backups; stash or commit before discarding if you need a Git safety net.",
  reset:
    "Recovery: use Search & Archaeology → Reflog to find the previous HEAD, then create a recovery branch or reset back to that reflog entry.",
  forceWithLease:
    "Recovery: if the remote tip was replaced incorrectly, recover the old tip from a collaborator, local reflog, or host audit log and push a recovery branch.",
  deleteRemoteBranch:
    "Recovery: recreate the remote branch by pushing any local branch or reflog commit that still points at the deleted tip.",
  remotePrune:
    "Recovery: stale remote-tracking refs can be recreated by fetching again if the remote branch still exists; otherwise recover from a local branch or reflog tip.",
  deleteRemoteTag:
    "Recovery: recreate the remote tag by pushing a remaining local tag or recreating the tag at the intended commit.",
  maintenance:
    "Recovery: maintenance/gc changes object storage; rely on current refs/reflog promptly because unreachable objects may expire after cleanup.",
  rebase:
    "Recovery: abort while the rebase is active, or use ORIG_HEAD/reflog after completion to create a recovery branch or reset back.",
  cherryPickRevertConflict:
    "Recovery: resolve conflicts and continue from the resolver/working tree, or abort the partial cherry-pick/revert from Git if you do not want it.",
} as const;

function resetRecoveryHint(mode: ResetMode) {
  return mode === "hard"
    ? `${RECOVERY_HINTS.reset} Hard reset also overwrites tracked working tree and index changes.`
    : RECOVERY_HINTS.reset;
}

interface GitMutationNoticeContext {
  noticeId: string;
  recoveryHint: string | null;
}

function startGitActionNotice(
  title: string,
  detail: string,
  repoPath: string | null | undefined,
  recoveryHint: string | null = null,
): GitMutationNoticeContext {
  const noticeId = useNoticeStore.getState().startNotice({
    title,
    detail,
    repoPath,
    category: "git",
    recoveryHint,
  });

  return { noticeId, recoveryHint };
}

function setGitActionDetail(
  context: GitMutationNoticeContext | undefined,
  detail: string,
) {
  if (!context) {
    return;
  }

  useNoticeStore.getState().updateNotice(context.noticeId, { detail });
}

function finishGitActionNotice(
  context: GitMutationNoticeContext | undefined,
  detail: string,
) {
  if (!context) {
    return;
  }

  useNoticeStore.getState().finishNotice(context.noticeId, "success", detail, context.recoveryHint);
}

function failGitActionNotice(
  context: GitMutationNoticeContext | undefined,
  error: unknown,
) {
  if (!context) {
    return;
  }

  const detail =
    error instanceof Error && error.message.length > 0
      ? error.message
      : String(error);
  useNoticeStore.getState().finishNotice(context.noticeId, "error", detail, context.recoveryHint);
}

async function refreshRepositoryLists(
  queryClient: QueryClient,
  context: GitMutationNoticeContext | undefined,
) {
  setGitActionDetail(context, "Refreshing repository lists…");
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: gitKeys.recentRepositories() }),
    queryClient.invalidateQueries({ queryKey: gitKeys.favoriteRepositories() }),
  ]);
}

async function refreshGitStateAfterAction(
  queryClient: QueryClient,
  repoPath: string | null | undefined,
  context: GitMutationNoticeContext | undefined,
  reasons: GitInvalidationReason | GitInvalidationReason[] = "worktree",
) {
  setGitActionDetail(context, "Refreshing affected repository views…");
  const reasonList = Array.isArray(reasons) ? reasons : [reasons];
  await Promise.all(
    reasonList.map((reason) =>
      invalidateGitStateByReason(queryClient, repoPath, reason),
    ),
  );
}

export const gitQueries = {
  repositorySnapshot: (repoPath: string | null) =>
    queryOptions({
      queryKey: gitKeys.repositorySnapshot(repoPath),
      queryFn: () => gitApi.getRepositorySnapshot(repoPath!),
      enabled: enabledRepo(repoPath),
    }),

  repositoryInfo: (repoPath: string | null) =>
    queryOptions({
      queryKey: gitKeys.repositorySnapshot(repoPath),
      queryFn: () => gitApi.getRepositorySnapshot(repoPath!),
      enabled: enabledRepo(repoPath),
      select: (snapshot) => snapshot.repositoryInfo,
    }),

  recentRepositories: () =>
    queryOptions({
      queryKey: gitKeys.recentRepositories(),
      queryFn: () => gitApi.listRecentRepositories(),
    }),

  favoriteRepositories: () =>
    queryOptions({
      queryKey: gitKeys.favoriteRepositories(),
      queryFn: () => gitApi.listFavoriteRepositories(),
    }),

  gitJobs: (repoPath?: string | null) =>
    queryOptions({
      queryKey: gitKeys.gitJobs(repoPath),
      queryFn: () => gitApi.listGitJobs(repoPath ?? null),
    }),

  status: (repoPath: string | null) =>
    queryOptions({
      queryKey: gitKeys.repositorySnapshot(repoPath),
      queryFn: () => gitApi.getRepositorySnapshot(repoPath!),
      enabled: enabledRepo(repoPath),
      select: (snapshot) => snapshot.files,
    }),

  stagedFiles: (repoPath: string | null) =>
    queryOptions({
      queryKey: gitKeys.repositorySnapshot(repoPath),
      queryFn: () => gitApi.getRepositorySnapshot(repoPath!),
      enabled: enabledRepo(repoPath),
      select: (snapshot) => snapshot.files.filter((file) => file.staged),
    }),

  unstagedFiles: (repoPath: string | null) =>
    queryOptions({
      queryKey: gitKeys.repositorySnapshot(repoPath),
      queryFn: () => gitApi.getRepositorySnapshot(repoPath!),
      enabled: enabledRepo(repoPath),
      select: (snapshot) => snapshot.files.filter((file) => file.unstaged),
    }),

  branchSummary: (repoPath: string | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.branchSummary(repoPath),
      queryFn: () => gitApi.getBranchSummary(repoPath!),
      enabled: enabledRepo(repoPath) && enabled,
    }),

  workspaceSummary: (repoPath: string | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.workspaceSummary(repoPath),
      queryFn: () => gitApi.getWorkspaceSummary(repoPath!),
      enabled: enabledRepo(repoPath) && enabled,
    }),

  commits: (repoPath: string | null, limit?: number) =>
    queryOptions({
      queryKey: gitKeys.commits(repoPath, limit),
      queryFn: () => gitApi.getCommitHistory(repoPath!, limit),
      enabled: enabledRepo(repoPath),
    }),

  commitDetails: (repoPath: string | null, commitHash: string | null) =>
    queryOptions({
      queryKey: gitKeys.commitDetails(repoPath, commitHash),
      queryFn: () => gitApi.getCommitDetails(repoPath!, commitHash!),
      enabled: enabledRepo(repoPath) && Boolean(commitHash),
    }),

  fileDiff: (
    repoPath: string | null,
    filePath: string | null,
    staged: boolean,
  ) =>
    queryOptions({
      queryKey: gitKeys.fileDiff(repoPath, filePath, staged),
      queryFn: () => gitApi.getFileDiff(repoPath!, filePath!, staged),
      enabled: enabledRepo(repoPath) && Boolean(filePath),
    }),

  commitDiff: (repoPath: string | null, commitHash: string | null) =>
    queryOptions({
      queryKey: gitKeys.commitDiff(repoPath, commitHash),
      queryFn: () => gitApi.getCommitDiff(repoPath!, commitHash!),
      enabled: enabledRepo(repoPath) && Boolean(commitHash),
    }),

  reflog: (repoPath: string | null, limit?: number, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.reflog(repoPath, limit),
      queryFn: () => gitApi.listReflogEntries(repoPath!, limit),
      enabled: enabledRepo(repoPath) && enabled,
    }),

  commitSearch: (
    repoPath: string | null,
    request: CommitSearchRequest | null,
    enabled = true,
  ) =>
    queryOptions({
      queryKey: gitKeys.commitSearch(repoPath, request),
      queryFn: () => gitApi.commitSearch(repoPath!, request!),
      enabled: enabledRepo(repoPath) && Boolean(request?.query.trim()) && enabled,
    }),

  fileHistory: (
    repoPath: string | null,
    request: FileHistoryRequest | null,
    enabled = true,
  ) =>
    queryOptions({
      queryKey: gitKeys.fileHistory(repoPath, request),
      queryFn: () => gitApi.fileHistory(repoPath!, request!),
      enabled: enabledRepo(repoPath) && Boolean(request?.filePath.trim()) && enabled,
    }),

  blameFile: (
    repoPath: string | null,
    request: BlameFileRequest | null,
    enabled = true,
  ) =>
    queryOptions({
      queryKey: gitKeys.blameFile(repoPath, request),
      queryFn: () => gitApi.blameFile(repoPath!, request!),
      enabled: enabledRepo(repoPath) && Boolean(request?.filePath.trim()) && enabled,
    }),

  gitGrep: (
    repoPath: string | null,
    request: GitGrepRequest | null,
    enabled = true,
  ) =>
    queryOptions({
      queryKey: gitKeys.gitGrep(repoPath, request),
      queryFn: () => gitApi.gitGrep(repoPath!, request!),
      enabled: enabledRepo(repoPath) && Boolean(request?.query.trim()) && enabled,
    }),

  pickaxeSearch: (
    repoPath: string | null,
    request: PickaxeSearchRequest | null,
    enabled = true,
  ) =>
    queryOptions({
      queryKey: gitKeys.pickaxeSearch(repoPath, request),
      queryFn: () => gitApi.pickaxeSearch(repoPath!, request!),
      enabled: enabledRepo(repoPath) && Boolean(request?.query.trim()) && enabled,
    }),

  lostCommits: (repoPath: string | null, limit?: number, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.lostCommits(repoPath, limit),
      queryFn: () => gitApi.discoverLostCommits(repoPath!, limit),
      enabled: enabledRepo(repoPath) && enabled,
    }),

  branches: (repoPath: string | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.branches(repoPath),
      queryFn: () => gitApi.listBranches(repoPath!),
      enabled: enabledRepo(repoPath) && enabled,
    }),

  remotes: (repoPath: string | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.remotes(repoPath),
      queryFn: () => gitApi.listRemotes(repoPath!),
      enabled: enabledRepo(repoPath) && enabled,
    }),

  stashes: (repoPath: string | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.stashes(repoPath),
      queryFn: () => gitApi.listStashes(repoPath!),
      enabled: enabledRepo(repoPath) && enabled,
    }),

  tags: (repoPath: string | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.tags(repoPath),
      queryFn: () => gitApi.listTags(repoPath!),
      enabled: enabledRepo(repoPath) && enabled,
    }),

  worktrees: (repoPath: string | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.worktrees(repoPath),
      queryFn: () => gitApi.listWorktrees(repoPath!),
      enabled: enabledRepo(repoPath) && enabled,
    }),

  submodules: (repoPath: string | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.submodules(repoPath),
      queryFn: () => gitApi.listSubmodules(repoPath!),
      enabled: enabledRepo(repoPath) && enabled,
    }),

  submoduleForeachStatus: (
    repoPath: string | null,
    recursive: boolean,
    enabled = true,
  ) =>
    queryOptions({
      queryKey: gitKeys.submoduleForeachStatus(repoPath, recursive),
      queryFn: () => gitApi.submoduleForeachStatus(repoPath!, recursive),
      enabled: enabledRepo(repoPath) && enabled,
    }),

  rebaseState: (repoPath: string | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.rebaseState(repoPath),
      queryFn: () => gitApi.getRebaseState(repoPath!),
      enabled: enabledRepo(repoPath) && enabled,
      refetchInterval: (query) => (query.state.data?.inProgress ? 3000 : false),
    }),

  operationSummary: (repoPath: string | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.operationSummary(repoPath),
      queryFn: () => gitApi.getOperationSummary(repoPath!),
      enabled: enabledRepo(repoPath) && enabled,
      refetchInterval: (query) => (query.state.data?.operation ? 3000 : false),
    }),

  rerereStatus: (repoPath: string | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.rerereStatus(repoPath),
      queryFn: () => gitApi.getRerereStatus(repoPath!),
      enabled: enabledRepo(repoPath) && enabled,
    }),

  bisectState: (repoPath: string | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.bisectState(repoPath),
      queryFn: () => gitApi.getBisectState(repoPath!),
      enabled: enabledRepo(repoPath) && enabled,
      refetchInterval: (query) => (query.state.data?.inProgress ? 3000 : false),
    }),

  conflictContent: (
    repoPath: string | null,
    filePath: string | null,
    enabled = true,
  ) =>
    queryOptions({
      queryKey: gitKeys.conflictContent(repoPath, filePath),
      queryFn: () => gitApi.getConflictContent(repoPath!, filePath!),
      enabled: enabledRepo(repoPath) && Boolean(filePath) && enabled,
    }),

  gitIdentity: (repoPath: string | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.gitIdentity(repoPath),
      queryFn: () => gitApi.getGitIdentity(repoPath!),
      enabled: enabledRepo(repoPath) && enabled,
    }),

  gitCredentialConfig: (repoPath: string | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.gitCredentialConfig(repoPath),
      queryFn: () => gitApi.getGitCredentialConfig(repoPath!),
      enabled: enabledRepo(repoPath) && enabled,
    }),
  lfsStatus: (repoPath: string | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.lfsStatus(repoPath),
      queryFn: () => gitApi.getLfsStatus(repoPath!),
      enabled: enabledRepo(repoPath) && enabled,
    }),

  sshStatus: () =>
    queryOptions({
      queryKey: gitKeys.sshStatus(),
      queryFn: () => gitApi.getSshStatus(),
    }),

  githubOverview: (repoPath: string | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.githubOverview(repoPath),
      queryFn: () => gitApi.getRepositoryGithubOverview(repoPath!),
      enabled: enabledRepo(repoPath) && enabled,
    }),

  pullRequestDiff: (
    repoPath: string | null,
    number: number | null,
    enabled = true,
  ) =>
    queryOptions({
      queryKey: gitKeys.pullRequestDiff(repoPath, number),
      queryFn: () => gitApi.getPullRequestDiff(repoPath!, number!),
      enabled: enabledRepo(repoPath) && Boolean(number) && enabled,
    }),
};

export const gitMutations = {
  openRepository: (
    queryClient: QueryClient,
    setActiveRepoPath: (path: string | null) => void,
  ) =>
    mutationOptions({
      mutationFn: (path: string) => gitApi.openRepository(path),
      onMutate: (path) =>
        startGitActionNotice("Opening repository", path, path),
      onSuccess: async (data, _path, context) => {
        queryClient.setQueryData(
          gitKeys.repositorySnapshot(data.repositoryInfo.path),
          data,
        );
        setActiveRepoPath(data.repositoryInfo.path);
        await refreshRepositoryLists(queryClient, context);
        finishGitActionNotice(context, "Repository loaded.");
      },
      onError: (error, _path, context) => failGitActionNotice(context, error),
    }),

  initRepository: (
    queryClient: QueryClient,
    setActiveRepoPath: (path: string | null) => void,
  ) =>
    mutationOptions({
      mutationFn: (path: string) => gitApi.initRepository(path),
      onMutate: (path) =>
        startGitActionNotice("Initializing repository", path, path),
      onSuccess: async (data, _path, context) => {
        queryClient.setQueryData(
          gitKeys.repositorySnapshot(data.repositoryInfo.path),
          data,
        );
        setActiveRepoPath(data.repositoryInfo.path);
        await refreshRepositoryLists(queryClient, context);
        finishGitActionNotice(context, "Repository initialized.");
      },
      onError: (error, _path, context) => failGitActionNotice(context, error),
    }),

  cloneRepository: (
    queryClient: QueryClient,
    _setActiveRepoPath: (path: string | null) => void,
  ) =>
    mutationOptions({
      mutationFn: ({
        url,
        destination,
      }: {
        url: string;
        destination: string;
      }) => gitApi.cloneRepository(url, destination),
      onMutate: ({ url, destination }) =>
        startGitActionNotice(
          "Cloning repository",
          `${url} → ${destination}`,
          destination,
        ),
      onSuccess: async (job, _variables, context) => {
        await refreshRepositoryLists(queryClient, context);
        finishGitActionNotice(
          context,
          `${job.title} queued. Track progress in the command log.`,
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  setRepositoryFavorite: (queryClient: QueryClient) =>
    mutationOptions({
      mutationFn: ({
        repoPath,
        name,
        favorite,
      }: {
        repoPath: string;
        name: string;
        favorite: boolean;
      }) => gitApi.setRepositoryFavorite(repoPath, name, favorite),
      onMutate: ({ repoPath, name, favorite }) =>
        startGitActionNotice(
          favorite ? "Adding favorite" : "Removing favorite",
          name,
          repoPath,
        ),
      onSuccess: async (_data, _variables, context) => {
        await refreshRepositoryLists(queryClient, context);
        finishGitActionNotice(context, "Repository lists refreshed.");
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  stageFile: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (filePath: string) => gitApi.stageFile(repoPath!, filePath),
      onMutate: (filePath) =>
        startGitActionNotice("Staging file", filePath, repoPath),
      onSuccess: async (_data, _filePath, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(
          context,
          "File staged and repository views refreshed.",
        );
      },
      onError: (error, _filePath, context) =>
        failGitActionNotice(context, error),
    }),

  unstageFile: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (filePath: string) => gitApi.unstageFile(repoPath!, filePath),
      onMutate: (filePath) =>
        startGitActionNotice("Unstaging file", filePath, repoPath),
      onSuccess: async (_data, _filePath, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(
          context,
          "File unstaged and repository views refreshed.",
        );
      },
      onError: (error, _filePath, context) =>
        failGitActionNotice(context, error),
    }),

  applyPatch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (request: PatchApplyRequest) =>
        gitApi.applyPatch(repoPath!, request),
      onMutate: (request) =>
        startGitActionNotice("Applying patch", request.filePath, repoPath),
      onSuccess: async (_data, _request, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(
          context,
          "Patch applied and repository views refreshed.",
        );
      },
      onError: (error, _request, context) =>
        failGitActionNotice(context, error),
    }),

  stageHunk: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (request: HunkPatchRequest) =>
        gitApi.stageHunk(repoPath!, request.filePath, request.hunkPatch),
      onMutate: (request) =>
        startGitActionNotice("Staging hunk", request.filePath, repoPath),
      onSuccess: async (_data, _request, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(
          context,
          "Hunk staged and repository views refreshed.",
        );
      },
      onError: (error, _request, context) =>
        failGitActionNotice(context, error),
    }),

  unstageHunk: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (request: HunkPatchRequest) =>
        gitApi.unstageHunk(repoPath!, request.filePath, request.hunkPatch),
      onMutate: (request) =>
        startGitActionNotice("Unstaging hunk", request.filePath, repoPath),
      onSuccess: async (_data, _request, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(
          context,
          "Hunk unstaged and repository views refreshed.",
        );
      },
      onError: (error, _request, context) =>
        failGitActionNotice(context, error),
    }),

  discardHunk: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (request: HunkPatchRequest) =>
        gitApi.discardHunk(repoPath!, request.filePath, Boolean(request.staged), request.hunkPatch),
      onMutate: (request) =>
        startGitActionNotice("Discarding hunk", request.filePath, repoPath, RECOVERY_HINTS.hardDiscard),
      onSuccess: async (_data, _request, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(
          context,
          "Hunk discarded and repository views refreshed.",
        );
      },
      onError: (error, _request, context) =>
        failGitActionNotice(context, error),
    }),

  discardFile: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (request: DiscardFileRequest) =>
        gitApi.discardFile(repoPath!, request.filePath, request.staged, request.untracked),
      onMutate: (request) =>
        startGitActionNotice("Discarding file changes", request.filePath, repoPath, RECOVERY_HINTS.hardDiscard),
      onSuccess: async (_data, _request, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(
          context,
          "File changes discarded and repository views refreshed.",
        );
      },
      onError: (error, _request, context) =>
        failGitActionNotice(context, error),
    }),

  stageAll: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.stageAll(repoPath!),
      onMutate: () =>
        startGitActionNotice(
          "Staging all files",
          "Preparing the index…",
          repoPath,
        ),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(
          context,
          "All files staged and repository views refreshed.",
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  unstageAll: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.unstageAll(repoPath!),
      onMutate: () =>
        startGitActionNotice(
          "Unstaging all files",
          "Resetting the index…",
          repoPath,
        ),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(
          context,
          "All files unstaged and repository views refreshed.",
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  commit: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (message: string) => gitApi.commit(repoPath!, message),
      onMutate: (message) =>
        startGitActionNotice(
          "Creating commit",
          message.split("\n", 1)[0],
          repoPath,
        ),
      onSuccess: async (_data, _message, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, [
          "worktree",
          "refs",
        ]);
        finishGitActionNotice(
          context,
          "Commit created and affected Git views refreshed.",
        );
      },
      onError: (error, _message, context) =>
        failGitActionNotice(context, error),
    }),

  cherryPickCommit: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ commitHash }: HistoryCommitRequest) =>
        gitApi.cherryPickCommit(repoPath!, commitHash),
      onMutate: ({ commitHash }) =>
        startGitActionNotice("Cherry-picking commit", commitHash, repoPath, RECOVERY_HINTS.cherryPickRevertConflict),
      onSuccess: async (_data, { commitHash }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, [
          "worktree",
          "refs",
          "reflog",
        ]);
        finishGitActionNotice(
          context,
          `${commitHash.slice(0, 8)} cherry-picked onto the current branch.`,
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  revertCommit: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ commitHash }: HistoryCommitRequest) =>
        gitApi.revertCommit(repoPath!, commitHash),
      onMutate: ({ commitHash }) =>
        startGitActionNotice("Reverting commit", commitHash, repoPath, RECOVERY_HINTS.cherryPickRevertConflict),
      onSuccess: async (_data, { commitHash }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, [
          "worktree",
          "refs",
          "reflog",
        ]);
        finishGitActionNotice(
          context,
          `${commitHash.slice(0, 8)} reverted on the current branch.`,
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  previewResetToCommit: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ commitHash }: HistoryCommitRequest) =>
        gitApi.previewResetToCommit(repoPath!, commitHash),
    }),

  resetToCommit: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({
        commitHash,
        mode,
        confirmDiscardChanges,
      }: ResetToCommitRequest) =>
        gitApi.resetToCommit(
          repoPath!,
          commitHash,
          mode,
          confirmDiscardChanges,
        ),
      onMutate: ({ commitHash, mode }) =>
        startGitActionNotice(
          `Resetting ${mode}`,
          `${mode} reset to ${commitHash}`,
          repoPath,
          resetRecoveryHint(mode),
        ),
      onSuccess: async (_data, { commitHash, mode }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, [
          "worktree",
          "refs",
          "reflog",
        ]);
        finishGitActionNotice(
          context,
          `Repository ${mode}-reset to ${commitHash.slice(0, 8)}.`,
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  previewAmend: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ message }: AmendCommitRequest) =>
        gitApi.previewAmend(repoPath!, message),
    }),

  amendCommit: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ message }: AmendCommitRequest) =>
        gitApi.amendCommit(repoPath!, message),
      onMutate: ({ message }) =>
        startGitActionNotice(
          "Amending HEAD commit",
          message?.split("\n", 1)[0]?.trim() || "Reusing current message",
          repoPath,
        ),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, [
          "worktree",
          "refs",
          "reflog",
        ]);
        finishGitActionNotice(context, "HEAD commit amended.");
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  checkoutReflogEntry: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ selector }: ReflogSelectorRequest) =>
        gitApi.checkoutReflogEntry(repoPath!, selector),
      onMutate: ({ selector }) =>
        startGitActionNotice("Checking out reflog entry", selector, repoPath),
      onSuccess: async (_data, { selector }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, [
          "worktree",
          "refs",
          "reflog",
        ]);
        finishGitActionNotice(context, `${selector} checked out.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  createBranchFromReflogEntry: (
    queryClient: QueryClient,
    repoPath: string | null,
  ) =>
    mutationOptions({
      mutationFn: ({
        selector,
        branchName,
        checkout,
      }: CreateBranchFromReflogRequest) =>
        gitApi.createBranchFromReflogEntry(
          repoPath!,
          branchName,
          selector,
          checkout,
        ),
      onMutate: ({ selector, branchName, checkout }) =>
        startGitActionNotice(
          checkout
            ? "Creating and checking out recovery branch"
            : "Creating recovery branch",
          `${branchName} from ${selector}`,
          repoPath,
        ),
      onSuccess: async (_data, { branchName, checkout }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, [
          "refs",
          ...(checkout ? (["worktree"] as const) : []),
        ]);
        finishGitActionNotice(
          context,
          `${branchName} created from reflog entry.`,
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  checkoutBranch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ branchName, strategy }: CheckoutBranchRequest) =>
        gitApi.checkoutBranch(repoPath!, branchName, strategy),
      onMutate: ({ branchName, strategy }) =>
        startGitActionNotice(
          strategy === "stash"
            ? "Stashing changes and checking out branch"
            : "Checking out branch",
          branchName,
          repoPath,
        ),
      onSuccess: async (_data, { branchName }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, [
          "refs",
          "worktree",
        ]);
        finishGitActionNotice(
          context,
          `${branchName} checked out and repository views refreshed.`,
        );
      },
      onError: (error, _branchName, context) =>
        failGitActionNotice(context, error),
    }),

  createBranch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ name, checkout, startPoint }: CreateBranchRequest) =>
        gitApi.createBranch(repoPath!, name, checkout, startPoint),
      onMutate: ({ name, checkout, startPoint }) =>
        startGitActionNotice(
          checkout ? "Creating and checking out branch" : "Creating branch",
          startPoint ? `${name} from ${startPoint}` : name,
          repoPath,
        ),
      onSuccess: async (_data, { name }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, [
          "refs",
          "worktree",
        ]);
        finishGitActionNotice(
          context,
          `${name} created and repository views refreshed.`,
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  renameBranch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ oldName, newName }: RenameBranchRequest) =>
        gitApi.renameBranch(repoPath!, oldName, newName),
      onMutate: ({ oldName, newName }) =>
        startGitActionNotice(
          "Renaming branch",
          `${oldName} → ${newName}`,
          repoPath,
        ),
      onSuccess: async (_data, { newName }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, [
          "refs",
          "worktree",
        ]);
        finishGitActionNotice(
          context,
          `${newName} renamed and repository views refreshed.`,
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  setBranchUpstream: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ branchName, upstream }: SetBranchUpstreamRequest) =>
        gitApi.setBranchUpstream(repoPath!, branchName, upstream),
      onMutate: ({ branchName, upstream }) =>
        startGitActionNotice(
          upstream ? "Setting branch upstream" : "Clearing branch upstream",
          upstream ? `${branchName} tracks ${upstream}` : branchName,
          repoPath,
        ),
      onSuccess: async (_data, { branchName }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "refs");
        finishGitActionNotice(
          context,
          `${branchName} tracking updated and refs refreshed.`,
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),


  fastForwardBranch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ branchName, upstream }: FastForwardBranchRequest) =>
        gitApi.fastForwardBranch(repoPath!, branchName, upstream),
      onMutate: ({ branchName, upstream }) =>
        startGitActionNotice(
          "Fast-forwarding branch",
          `${branchName} from ${upstream}`,
          repoPath,
        ),
      onSuccess: async (_data, { branchName }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, [
          "refs",
          "worktree",
        ]);
        finishGitActionNotice(
          context,
          `${branchName} fast-forwarded and repository views refreshed.`,
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  mergeBranch: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (source: string) => gitApi.mergeBranch(repoPath!, source),
      onMutate: (source) =>
        startGitActionNotice(
          "Merging branch",
          `${source} into current branch`,
          repoPath,
        ),
      onSuccess: (job, _source, context) => {
        finishGitActionNotice(context, `${job.title} queued. Track progress in the command log.`);
      },
      onError: (error, _source, context) => failGitActionNotice(context, error),
    }),
  mergeWithOptions: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (request: MergeWithOptionsRequest) =>
        gitApi.mergeWithOptions(repoPath!, request),
      onMutate: ({ source, noFf, squash, strategyOption }) =>
        startGitActionNotice(
          "Merging with options",
          [
            source,
            noFf ? "--no-ff" : null,
            squash ? "--squash" : null,
            strategyOption ? `-X ${strategyOption}` : null,
          ].filter(Boolean).join(" · "),
          repoPath,
        ),
      onSuccess: (job, _request, context) => {
        finishGitActionNotice(context, `${job.title} queued. Track progress in the command log.`);
      },
      onError: (error, _request, context) => failGitActionNotice(context, error),
    }),

  setGitIdentity: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({
        name,
        email,
      }: {
        name: string | null;
        email: string | null;
      }) => gitApi.setGitIdentity(repoPath!, name, email),
      onMutate: ({ name, email }) =>
        startGitActionNotice(
          "Saving Git identity",
          [name, email].filter(Boolean).join(" · ") ||
            "Clearing local identity",
          repoPath,
        ),
      onSuccess: async (identity, _variables, context) => {
        queryClient.setQueryData(gitKeys.gitIdentity(repoPath), identity);
        finishGitActionNotice(context, "Git identity saved.");
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  setGitCredentialHelper: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (helper: string | null) =>
        gitApi.setGitCredentialHelper(repoPath!, helper),
      onMutate: (helper) =>
        startGitActionNotice(
          "Saving credential helper",
          helper || "Clearing local helper",
          repoPath,
        ),
      onSuccess: (config, _helper, context) => {
        queryClient.setQueryData(gitKeys.gitCredentialConfig(repoPath), config);
        finishGitActionNotice(context, "Credential helper saved.");
      },
      onError: (error, _helper, context) => failGitActionNotice(context, error),
    }),

  installLfs: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.installLfs(repoPath!),
      onMutate: () =>
        startGitActionNotice(
          "Installing Git LFS",
          "Configuring local repository hooks",
          repoPath,
        ),
      onSuccess: async (_data, _variables, context) => {
        await queryClient.invalidateQueries({
          queryKey: gitKeys.lfsStatus(repoPath),
        });
        finishGitActionNotice(
          context,
          "Git LFS installed for this repository.",
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  trackLfsPattern: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (pattern: string) =>
        gitApi.trackLfsPattern(repoPath!, pattern),
      onMutate: (pattern) =>
        startGitActionNotice("Tracking Git LFS pattern", pattern, repoPath),
      onSuccess: async (_data, _pattern, context) => {
        await refreshGitStateAfterAction(
          queryClient,
          repoPath,
          context,
          "worktree",
        );
        await queryClient.invalidateQueries({
          queryKey: gitKeys.lfsStatus(repoPath),
        });
        finishGitActionNotice(context, "Git LFS tracking updated.");
      },
      onError: (error, _pattern, context) =>
        failGitActionNotice(context, error),
    }),

  untrackLfsPattern: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (pattern: string) =>
        gitApi.untrackLfsPattern(repoPath!, pattern),
      onMutate: (pattern) =>
        startGitActionNotice("Untracking Git LFS pattern", pattern, repoPath),
      onSuccess: async (_data, _pattern, context) => {
        await refreshGitStateAfterAction(
          queryClient,
          repoPath,
          context,
          "worktree",
        );
        await queryClient.invalidateQueries({
          queryKey: gitKeys.lfsStatus(repoPath),
        });
        finishGitActionNotice(context, "Git LFS tracking updated.");
      },
      onError: (error, _pattern, context) =>
        failGitActionNotice(context, error),
    }),

  generateSshKey: (queryClient: QueryClient) =>
    mutationOptions({
      mutationFn: ({ name, comment }: GenerateSshKeyRequest) =>
        gitApi.generateSshKey(name, comment),
      onMutate: ({ name }) =>
        startGitActionNotice("Generating SSH key", name, null),
      onSuccess: (status, _variables, context) => {
        queryClient.setQueryData(gitKeys.sshStatus(), status);
        finishGitActionNotice(context, "SSH key generated.");
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  addSshKeyToAgent: (queryClient: QueryClient) =>
    mutationOptions({
      mutationFn: (name: string) => gitApi.addSshKeyToAgent(name),
      onMutate: (name) =>
        startGitActionNotice("Adding SSH key to agent", name, null),
      onSuccess: (status, _name, context) => {
        queryClient.setQueryData(gitKeys.sshStatus(), status);
        finishGitActionNotice(context, "SSH agent updated.");
      },
      onError: (error, _name, context) => failGitActionNotice(context, error),
    }),

  deleteBranch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (branchName: string) =>
        gitApi.deleteBranch(repoPath!, branchName),
      onMutate: (branchName) =>
        startGitActionNotice("Deleting branch", branchName, repoPath),
      onSuccess: async (_data, branchName, context) => {
        await refreshGitStateAfterAction(
          queryClient,
          repoPath,
          context,
          "refs",
        );
        finishGitActionNotice(
          context,
          `${branchName} deleted and repository views refreshed.`,
        );
      },
      onError: (error, _branchName, context) =>
        failGitActionNotice(context, error),
    }),

  fetch: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (remote?: string) => gitApi.fetch(repoPath!, remote),
      onMutate: (remote) =>
        startGitActionNotice(
          "Fetching",
          remote ? `Remote: ${remote}` : "Fetching from configured remotes…",
          repoPath,
        ),
      onSuccess: (job, _remote, context) => {
        finishGitActionNotice(context, `${job.title} queued. Track progress in the command log.`);
      },
      onError: (error, _remote, context) => failGitActionNotice(context, error),
    }),

  pull: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ remote, branch }: { remote?: string; branch?: string }) =>
        gitApi.pull(repoPath!, remote, branch),
      onMutate: ({ remote, branch }) =>
        startGitActionNotice(
          "Pulling",
          [remote, branch].filter(Boolean).join("/") ||
            "Pulling current branch…",
          repoPath,
        ),
      onSuccess: (job, _variables, context) => {
        finishGitActionNotice(context, `${job.title} queued. Track progress in the command log.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  push: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ remote, branch }: { remote?: string; branch?: string }) =>
        gitApi.push(repoPath!, remote, branch),
      onMutate: ({ remote, branch }) =>
        startGitActionNotice(
          "Pushing",
          [remote, branch].filter(Boolean).join("/") ||
            "Pushing current branch…",
          repoPath,
        ),
      onSuccess: (job, _variables, context) => {
        finishGitActionNotice(context, `${job.title} queued. Track progress in the command log.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  addRemote: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ name, url }: AddRemoteRequest) =>
        gitApi.addRemote(repoPath!, name, url),
      onMutate: ({ name, url }) =>
        startGitActionNotice("Adding remote", `${name} → ${url}`, repoPath),
      onSuccess: async (_data, { name }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "remote");
        finishGitActionNotice(context, `${name} added and remotes refreshed.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  updateRemote: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ name, fetchUrl, pushUrl }: UpdateRemoteRequest) =>
        gitApi.updateRemote(repoPath!, name, fetchUrl, pushUrl),
      onMutate: ({ name, fetchUrl }) =>
        startGitActionNotice("Updating remote", `${name} → ${fetchUrl}`, repoPath),
      onSuccess: async (_data, { name }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "remote");
        finishGitActionNotice(context, `${name} updated and remotes refreshed.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  deleteRemote: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (name: string) => gitApi.deleteRemote(repoPath!, name),
      onMutate: (name) => startGitActionNotice("Deleting remote", name, repoPath),
      onSuccess: async (_data, name, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "remote");
        finishGitActionNotice(context, `${name} deleted and remotes refreshed.`);
      },
      onError: (error, _name, context) => failGitActionNotice(context, error),
    }),

  pruneRemote: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (name: string) => gitApi.pruneRemote(repoPath!, name),
      onMutate: (name) => startGitActionNotice("Pruning remote", name, repoPath, RECOVERY_HINTS.remotePrune),
      onSuccess: async (_data, name, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "remote");
        finishGitActionNotice(context, `${name} pruned and refs refreshed.`);
      },
      onError: (error, _name, context) => failGitActionNotice(context, error),
    }),

  pruneRemoteDryRun: (repoPath: string | null) =>
    mutationOptions({
      mutationFn: (name: string) => gitApi.pruneRemoteDryRun(repoPath!, name),
    }),

  pushBranchDryRun: (repoPath: string | null) =>
    mutationOptions({
      mutationFn: (request: PushBranchRequest) =>
        gitApi.pushBranchDryRun(repoPath!, request),
    }),

  pushBranch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (request: PushBranchRequest) =>
        gitApi.pushBranch(repoPath!, request),
      onMutate: ({ remote, localBranch, remoteBranch, forceWithLease }) =>
        startGitActionNotice(
          forceWithLease ? "Force-with-lease pushing branch" : "Pushing branch",
          `${localBranch} → ${remote}/${remoteBranch || localBranch}`,
          repoPath,
          forceWithLease ? RECOVERY_HINTS.forceWithLease : null,
        ),
      onSuccess: async (_data, { localBranch }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "remote");
        finishGitActionNotice(
          context,
          `${localBranch} pushed and remote refs refreshed.`,
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  deleteRemoteBranchDryRun: (repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ remote, branch }: DeleteRemoteBranchRequest) =>
        gitApi.deleteRemoteBranchDryRun(repoPath!, remote, branch),
    }),

  deleteRemoteBranch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ remote, branch }: DeleteRemoteBranchRequest) =>
        gitApi.deleteRemoteBranch(repoPath!, remote, branch),
      onMutate: ({ remote, branch }) =>
        startGitActionNotice("Deleting remote branch", `${remote}/${branch}`, repoPath, RECOVERY_HINTS.deleteRemoteBranch),
      onSuccess: async (_data, { remote, branch }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "remote");
        finishGitActionNotice(
          context,
          `${remote}/${branch} deleted and remote refs refreshed.`,
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),


  createStash: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ message, includeUntracked }: CreateStashRequest) =>
        gitApi.createStash(repoPath!, message, includeUntracked),
      onMutate: ({ message }) =>
        startGitActionNotice(
          "Creating stash",
          message?.trim() || "Saving local changes…",
          repoPath,
        ),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(
          queryClient,
          repoPath,
          context,
          "worktree",
        );
        finishGitActionNotice(
          context,
          "Stash created and working tree refreshed.",
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  createStashForPaths: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ message, includeUntracked, paths }: CreateStashForPathsRequest) =>
        gitApi.createStashForPaths(repoPath!, message, includeUntracked, paths),
      onMutate: ({ message, paths }) =>
        startGitActionNotice(
          "Stashing selected paths",
          message?.trim() || paths.join(", "),
          repoPath,
        ),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(
          queryClient,
          repoPath,
          context,
          "worktree",
        );
        finishGitActionNotice(
          context,
          "Selected paths stashed and working tree refreshed.",
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  applyStash: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (stashName: string) =>
        gitApi.applyStash(repoPath!, stashName),
      onMutate: (stashName) =>
        startGitActionNotice("Applying stash", stashName, repoPath),
      onSuccess: async (_data, _stashName, context) => {
        await refreshGitStateAfterAction(
          queryClient,
          repoPath,
          context,
          "worktree",
        );
        finishGitActionNotice(
          context,
          "Stash applied and working tree refreshed.",
        );
      },
      onError: (error, _stashName, context) =>
        failGitActionNotice(context, error),
    }),

  popStash: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (stashName: string) => gitApi.popStash(repoPath!, stashName),
      onMutate: (stashName) =>
        startGitActionNotice("Popping stash", stashName, repoPath),
      onSuccess: async (_data, _stashName, context) => {
        await refreshGitStateAfterAction(
          queryClient,
          repoPath,
          context,
          "worktree",
        );
        finishGitActionNotice(
          context,
          "Stash popped and working tree refreshed.",
        );
      },
      onError: (error, _stashName, context) =>
        failGitActionNotice(context, error),
    }),

  dropStash: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (stashName: string) => gitApi.dropStash(repoPath!, stashName),
      onMutate: (stashName) =>
        startGitActionNotice("Dropping stash", stashName, repoPath),
      onSuccess: async (_data, _stashName, context) => {
        await refreshGitStateAfterAction(
          queryClient,
          repoPath,
          context,
          "worktree",
        );
        finishGitActionNotice(
          context,
          "Stash dropped and stash list refreshed.",
        );
      },
      onError: (error, _stashName, context) =>
        failGitActionNotice(context, error),
    }),

  createTag: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ name, target, message }: CreateTagRequest) =>
        gitApi.createTag(repoPath!, name, target, message),
      onMutate: ({ name, target }) =>
        startGitActionNotice(
          "Creating tag",
          target ? `${name} at ${target}` : name,
          repoPath,
        ),
      onSuccess: async (_data, { name }, context) => {
        await refreshGitStateAfterAction(
          queryClient,
          repoPath,
          context,
          "refs",
        );
        finishGitActionNotice(context, `${name} created and refs refreshed.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  deleteTag: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (name: string) => gitApi.deleteTag(repoPath!, name),
      onMutate: (name) => startGitActionNotice("Deleting tag", name, repoPath),
      onSuccess: async (_data, name, context) => {
        await refreshGitStateAfterAction(
          queryClient,
          repoPath,
          context,
          "refs",
        );
        finishGitActionNotice(context, `${name} deleted and refs refreshed.`);
      },
      onError: (error, _name, context) => failGitActionNotice(context, error),
    }),

  pushTagDryRun: (repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ remote, name }: RemoteTagRequest) =>
        gitApi.pushTagDryRun(repoPath!, remote, name),
    }),

  pushTag: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ remote, name }: RemoteTagRequest) =>
        gitApi.pushTag(repoPath!, remote, name),
      onMutate: ({ remote, name }) =>
        startGitActionNotice("Pushing tag", `${name} → ${remote}`, repoPath),
      onSuccess: async (_data, { name }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "remote");
        finishGitActionNotice(context, `${name} pushed and remote refs refreshed.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  deleteRemoteTagDryRun: (repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ remote, name }: RemoteTagRequest) =>
        gitApi.deleteRemoteTagDryRun(repoPath!, remote, name),
    }),

  deleteRemoteTag: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ remote, name }: RemoteTagRequest) =>
        gitApi.deleteRemoteTag(repoPath!, remote, name),
      onMutate: ({ remote, name }) =>
        startGitActionNotice("Deleting remote tag", `${remote}/${name}`, repoPath, RECOVERY_HINTS.deleteRemoteTag),
      onSuccess: async (_data, { name }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "remote");
        finishGitActionNotice(
          context,
          `${name} deleted remotely and refs refreshed.`,
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),


  createWorktree: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({
        path,
        branch,
        createBranch,
      }: {
        path: string;
        branch: string | null;
        createBranch: boolean;
      }) => gitApi.createWorktree(repoPath!, path, branch, createBranch),
      onMutate: ({ path, branch }) =>
        startGitActionNotice(
          "Creating worktree",
          branch ? `${branch} → ${path}` : path,
          repoPath,
        ),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(
          context,
          "Worktree created and repository views refreshed.",
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  removeWorktree: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ path, force }: { path: string; force: boolean }) =>
        gitApi.removeWorktree(repoPath!, path, force),
      onMutate: ({ path, force }) =>
        startGitActionNotice(
          force ? "Force removing worktree" : "Removing worktree",
          path,
          repoPath,
        ),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(
          context,
          "Worktree removed and repository views refreshed.",
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  pruneWorktrees: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.pruneWorktrees(repoPath!),
      onMutate: () =>
        startGitActionNotice(
          "Pruning worktrees",
          "Removing stale worktree metadata…",
          repoPath,
        ),
      onSuccess: (job, _variables, context) => {
        finishGitActionNotice(context, `${job.title} queued. Track progress in the command log.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  pruneWorktreesDryRun: (repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.pruneWorktreesDryRun(repoPath!),
    }),

  moveWorktree: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ path, newPath }: MoveWorktreeRequest) =>
        gitApi.moveWorktree(repoPath!, path, newPath),
      onMutate: ({ path, newPath }) =>
        startGitActionNotice("Moving worktree", `${path} → ${newPath}`, repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(
          context,
          "Worktree moved and repository views refreshed.",
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  lockWorktree: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ path, reason }: LockWorktreeRequest) =>
        gitApi.lockWorktree(repoPath!, path, reason),
      onMutate: ({ path, reason }) =>
        startGitActionNotice(
          "Locking worktree",
          reason ? `${path} · ${reason}` : path,
          repoPath,
        ),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(
          context,
          "Worktree locked and repository views refreshed.",
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  unlockWorktree: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (path: string) => gitApi.unlockWorktree(repoPath!, path),
      onMutate: (path) =>
        startGitActionNotice("Unlocking worktree", path, repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(
          context,
          "Worktree unlocked and repository views refreshed.",
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  repairWorktree: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (path: string) => gitApi.repairWorktree(repoPath!, path),
      onMutate: (path) =>
        startGitActionNotice("Repairing worktree", path, repoPath),
      onSuccess: (job, _variables, context) => {
        finishGitActionNotice(context, `${job.title} queued. Track progress in the command log.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  repairWorktreeDryRun: (repoPath: string | null) =>
    mutationOptions({
      mutationFn: (path: string) => gitApi.repairWorktreeDryRun(repoPath!, path),
    }),

  updateSubmodule: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ path, recursive }: { path: string; recursive: boolean }) =>
        gitApi.updateSubmodule(repoPath!, path, recursive),
      onMutate: ({ path, recursive }) =>
        startGitActionNotice(
          "Updating submodule",
          recursive ? `${path} recursively` : path,
          repoPath,
        ),
      onSuccess: (job, _variables, context) => {
        finishGitActionNotice(context, `${job.title} queued. Track progress in the command log.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  addSubmodule: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ url, path, branch, name }: AddSubmoduleRequest) =>
        gitApi.addSubmodule(repoPath!, url, path, branch, name),
      onMutate: ({ url, path, branch, name }) =>
        startGitActionNotice(
          "Adding submodule",
          [path, url, branch ? `branch ${branch}` : null, name ? `name ${name}` : null]
            .filter(Boolean)
            .join(" · "),
          repoPath,
        ),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(
          context,
          "Submodule added and repository views refreshed.",
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  submoduleInitUpdate: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ path, recursive, remote }: SubmoduleInitUpdateRequest) =>
        gitApi.submoduleInitUpdate(repoPath!, path, recursive, remote),
      onMutate: ({ path, recursive, remote }) =>
        startGitActionNotice(
          path ? "Initializing submodule" : "Initializing submodules",
          [
            path ?? "all submodules",
            recursive ? "recursive" : null,
            remote ? "remote tracking" : null,
          ]
            .filter(Boolean)
            .join(" · "),
          repoPath,
        ),
      onSuccess: (job, _variables, context) => {
        finishGitActionNotice(context, `${job.title} queued. Track progress in the command log.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  submoduleSetBranch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ path, branch }: SubmoduleSetBranchRequest) =>
        gitApi.submoduleSetBranch(repoPath!, path, branch),
      onMutate: ({ path, branch }) =>
        startGitActionNotice(
          "Setting submodule branch",
          `${path} → ${branch}`,
          repoPath,
        ),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(
          context,
          "Submodule branch tracking saved and repository views refreshed.",
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  syncSubmodules: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ recursive }: { recursive: boolean }) =>
        gitApi.syncSubmodules(repoPath!, recursive),
      onMutate: ({ recursive }) =>
        startGitActionNotice(
          "Syncing submodules",
          recursive
            ? "Recursive sync requested…"
            : "Syncing configured submodules…",
          repoPath,
        ),
      onSuccess: (job, _variables, context) => {
        finishGitActionNotice(context, `${job.title} queued. Track progress in the command log.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  openSubmodule: (repoPath: string | null) =>
    mutationOptions({
      mutationFn: (path: string) => gitApi.openSubmodule(repoPath!, path),
      onMutate: (path) =>
        startGitActionNotice("Opening submodule", path, repoPath),
      onSuccess: (_data, _path, context) =>
        finishGitActionNotice(context, "Submodule opened."),
      onError: (error, _path, context) => failGitActionNotice(context, error),
    }),

  bumpSubmodule: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ path }: { path: string }) =>
        gitApi.bumpSubmodule(repoPath!, path),
      onMutate: ({ path }) =>
        startGitActionNotice("Bumping submodule", path, repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(
          context,
          "Submodule bumped and repository views refreshed.",
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  previewRebase: (repoPath: string | null) =>
    mutationOptions({
      mutationFn: (request: StartRebaseRequest) =>
        gitApi.previewRebase(repoPath!, request),
    }),

  rebaseOnto: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (request: StartRebaseRequest) => gitApi.rebaseOnto(repoPath!, request),
      onMutate: ({ branch, upstream, onto, autostash }) =>
        startGitActionNotice(
          "Starting rebase",
          [
            branch ? `${branch} ` : "current branch ",
            `from ${upstream}`,
            onto ? `onto ${onto}` : null,
            autostash ? "with autostash" : null,
          ].filter(Boolean).join(" · "),
          repoPath,
          RECOVERY_HINTS.rebase,
        ),
      onSuccess: (job, _request, context) => {
        finishGitActionNotice(context, `${job.title} queued. Track progress in the command log.`);
      },
      onError: (error, _request, context) => failGitActionNotice(context, error),
    }),

  rebaseUpstream: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (request: StartRebaseRequest) => gitApi.rebaseUpstream(repoPath!, request),
      onMutate: ({ branch, upstream, autostash }) =>
        startGitActionNotice(
          "Rebasing onto upstream",
          [
            branch ? `${branch} ` : "current branch ",
            upstream,
            autostash ? "with autostash" : null,
          ].filter(Boolean).join(" · "),
          repoPath,
          RECOVERY_HINTS.rebase,
        ),
      onSuccess: (job, _request, context) => {
        finishGitActionNotice(context, `${job.title} queued. Track progress in the command log.`);
      },
      onError: (error, _request, context) => failGitActionNotice(context, error),
    }),

  setRerereEnabled: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (enabled: boolean) => gitApi.setRerereEnabled(repoPath!, enabled),
      onMutate: (enabled) =>
        startGitActionNotice(
          enabled ? "Enabling rerere" : "Disabling rerere",
          "Updating repository conflict reuse config",
          repoPath,
        ),
      onSuccess: (status, _enabled, context) => {
        queryClient.setQueryData(gitKeys.rerereStatus(repoPath), status);
        finishGitActionNotice(context, status.enabled ? "rerere enabled." : "rerere disabled.");
      },
      onError: (error, _enabled, context) => failGitActionNotice(context, error),
    }),

  continueRebase: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.continueRebase(repoPath!),
      onMutate: () =>
        startGitActionNotice(
          "Continuing rebase",
          "Applying the next rebase step…",
          repoPath,
          RECOVERY_HINTS.rebase,
        ),
      onSuccess: (job, _variables, context) => {
        finishGitActionNotice(context, `${job.title} queued. Track progress in the command log.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  abortRebase: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.abortRebase(repoPath!),
      onMutate: () =>
        startGitActionNotice(
          "Aborting rebase",
          "Restoring repository state…",
          repoPath,
          RECOVERY_HINTS.rebase,
        ),
      onSuccess: (job, _variables, context) => {
        finishGitActionNotice(context, `${job.title} queued. Track progress in the command log.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  skipRebase: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.skipRebase(repoPath!),
      onMutate: () =>
        startGitActionNotice(
          "Skipping rebase commit",
          "Dropping the current patch…",
          repoPath,
          RECOVERY_HINTS.rebase,
        ),
      onSuccess: (job, _variables, context) => {
        finishGitActionNotice(context, `${job.title} queued. Track progress in the command log.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  markFileResolved: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (filePath: string) =>
        gitApi.markFileResolved(repoPath!, filePath),
      onMutate: (filePath) =>
        startGitActionNotice("Marking conflict resolved", filePath, repoPath),
      onSuccess: async (_data, _filePath, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, [
          "rebase",
          "worktree",
        ]);
        finishGitActionNotice(
          context,
          "Conflict marked resolved and repository views refreshed.",
        );
      },
      onError: (error, _filePath, context) =>
        failGitActionNotice(context, error),
    }),

  checkoutConflictSide: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({
        filePath,
        side,
      }: {
        filePath: string;
        side: "ours" | "theirs";
      }) => gitApi.checkoutConflictSide(repoPath!, filePath, side),
      onMutate: ({ filePath, side }) =>
        startGitActionNotice(
          side === "ours" ? "Using current side" : "Using incoming side",
          filePath,
          repoPath,
        ),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, [
          "rebase",
          "worktree",
        ]);
        finishGitActionNotice(
          context,
          "Conflict side applied, staged, and repository views refreshed.",
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  updateRebaseTodo: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (items: RebaseTodoItem[]) =>
        gitApi.updateRebaseTodo(repoPath!, items),
      onMutate: (items) =>
        startGitActionNotice(
          "Updating rebase todo",
          `${items.length} item${items.length === 1 ? "" : "s"}`,
          repoPath,
        ),
      onSuccess: async (_data, _items, context) => {
        await refreshGitStateAfterAction(
          queryClient,
          repoPath,
          context,
          "rebase",
        );
        finishGitActionNotice(
          context,
          "Rebase todo updated and repository views refreshed.",
        );
      },
      onError: (error, _items, context) => failGitActionNotice(context, error),
    }),

  bisectStart: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (request: BisectStartRequest) =>
        gitApi.bisectStart(repoPath!, request),
      onMutate: ({ badRevision, goodRevisions = [] }) =>
        startGitActionNotice(
          "Starting git bisect",
          `Bad: ${badRevision || "HEAD"} · Good: ${goodRevisions.join(", ") || "not set"}`,
          repoPath,
        ),
      onSuccess: async (summary, _request, context) => {
        queryClient.setQueryData(gitKeys.bisectState(repoPath), summary.state);
        await refreshGitStateAfterAction(queryClient, repoPath, context, "bisect");
        finishGitActionNotice(context, "Bisect started and repository views refreshed.");
      },
      onError: (error, _request, context) => failGitActionNotice(context, error),
    }),

  bisectGood: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ revision }: BisectMarkRequest = {}) =>
        gitApi.bisectGood(repoPath!, revision),
      onMutate: ({ revision }: BisectMarkRequest = {}) =>
        startGitActionNotice("Marking bisect revision good", revision || "current checkout", repoPath),
      onSuccess: async (summary, _request, context) => {
        queryClient.setQueryData(gitKeys.bisectState(repoPath), summary.state);
        await refreshGitStateAfterAction(queryClient, repoPath, context, "bisect");
        finishGitActionNotice(context, "Good revision recorded.");
      },
      onError: (error, _request, context) => failGitActionNotice(context, error),
    }),

  bisectBad: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ revision }: BisectMarkRequest = {}) =>
        gitApi.bisectBad(repoPath!, revision),
      onMutate: ({ revision }: BisectMarkRequest = {}) =>
        startGitActionNotice("Marking bisect revision bad", revision || "current checkout", repoPath),
      onSuccess: async (summary, _request, context) => {
        queryClient.setQueryData(gitKeys.bisectState(repoPath), summary.state);
        await refreshGitStateAfterAction(queryClient, repoPath, context, "bisect");
        finishGitActionNotice(context, "Bad revision recorded.");
      },
      onError: (error, _request, context) => failGitActionNotice(context, error),
    }),

  bisectSkip: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ revision }: BisectMarkRequest = {}) =>
        gitApi.bisectSkip(repoPath!, revision),
      onMutate: ({ revision }: BisectMarkRequest = {}) =>
        startGitActionNotice("Skipping bisect revision", revision || "current checkout", repoPath),
      onSuccess: async (summary, _request, context) => {
        queryClient.setQueryData(gitKeys.bisectState(repoPath), summary.state);
        await refreshGitStateAfterAction(queryClient, repoPath, context, "bisect");
        finishGitActionNotice(context, "Revision skipped for this bisect.");
      },
      onError: (error, _request, context) => failGitActionNotice(context, error),
    }),

  bisectReset: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ revision }: BisectMarkRequest = {}) =>
        gitApi.bisectReset(repoPath!, revision),
      onMutate: ({ revision }: BisectMarkRequest = {}) =>
        startGitActionNotice("Resetting git bisect", revision || "Original branch", repoPath),
      onSuccess: async (summary, _request, context) => {
        queryClient.setQueryData(gitKeys.bisectState(repoPath), summary.state);
        await refreshGitStateAfterAction(queryClient, repoPath, context, "bisect");
        finishGitActionNotice(context, "Bisect reset and repository views refreshed.");
      },
      onError: (error, _request, context) => failGitActionNotice(context, error),
    }),

  runGitFsck: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ full, strict }: RunGitFsckRequest) =>
        gitApi.runGitFsck(repoPath!, full, strict),
      onMutate: ({ full, strict }) =>
        startGitActionNotice(
          "Running git fsck",
          `${full ? "Full" : "Reachable"} check${strict ? " · strict" : ""}`,
          repoPath,
        ),
      onSuccess: (_result, _request, context) =>
        finishGitActionNotice(context, "Repository object check complete."),
      onError: (error, _request, context) => failGitActionNotice(context, error),
    }),

  runGitMaintenance: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ mode }: RunGitMaintenanceRequest) =>
        gitApi.runGitMaintenance(repoPath!, mode),
      onMutate: ({ mode }) =>
        startGitActionNotice(
          mode === "gc" ? "Running git gc" : "Running git maintenance",
          "This can take a while on large repositories.",
          repoPath,
          RECOVERY_HINTS.maintenance,
        ),
      onSuccess: (_result, { mode }, context) =>
        finishGitActionNotice(
          context,
          mode === "gc" ? "Garbage collection complete." : "Maintenance complete.",
        ),
      onError: (error, _request, context) => failGitActionNotice(context, error),
    }),

  verifyGitSignature: (_queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ target }: VerifyGitSignatureRequest) =>
        gitApi.verifyGitSignature(repoPath!, target),
      onMutate: ({ target }) =>
        startGitActionNotice("Verifying Git signature", target, repoPath),
      onSuccess: (result, { target }, context) =>
        finishGitActionNotice(
          context,
          result.status === "valid" ? `${target} has a valid signature.` : `${target} signature status: ${result.status}.`,
        ),
      onError: (error, _request, context) => failGitActionNotice(context, error),
    }),

  checkoutPullRequest: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (number: number) =>
        gitApi.checkoutPullRequest(repoPath!, number),
      onMutate: (number) =>
        startGitActionNotice(
          "Checking out pull request",
          `PR #${number}`,
          repoPath,
        ),
      onSuccess: async (_data, number, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, [
          "remote",
          "refs",
          "worktree",
        ]);
        finishGitActionNotice(
          context,
          `PR #${number} checked out and repository views refreshed.`,
        );
      },
      onError: (error, _number, context) => failGitActionNotice(context, error),
    }),

  updatePullRequestBranch: (
    queryClient: QueryClient,
    repoPath: string | null,
  ) =>
    mutationOptions({
      mutationFn: (number: number) =>
        gitApi.updatePullRequestBranch(repoPath!, number),
      onMutate: (number) =>
        startGitActionNotice(
          "Updating pull request branch",
          `PR #${number}`,
          repoPath,
        ),
      onSuccess: async (_data, number, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, [
          "remote",
          "refs",
          "worktree",
        ]);
        finishGitActionNotice(
          context,
          `PR #${number} updated and repository views refreshed.`,
        );
      },
      onError: (error, _number, context) => failGitActionNotice(context, error),
    }),

  requestPullRequestReview: (
    queryClient: QueryClient,
    repoPath: string | null,
  ) =>
    mutationOptions({
      mutationFn: ({
        number,
        reviewers,
        teams = [],
      }: RequestPullRequestReviewRequest) =>
        gitApi.requestPullRequestReview(repoPath!, number, reviewers, teams),
      onMutate: ({ number, reviewers, teams = [] }) =>
        startGitActionNotice(
          "Requesting pull request review",
          `PR #${number} · ${reviewers.length + teams.length} reviewer${reviewers.length + teams.length === 1 ? "" : "s"}`,
          repoPath,
        ),
      onSuccess: async (_data, { number }, context) => {
        await refreshGitStateAfterAction(
          queryClient,
          repoPath,
          context,
          "remote",
        );
        finishGitActionNotice(context, `Review requested for PR #${number}.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  submitPullRequestReview: (
    queryClient: QueryClient,
    repoPath: string | null,
  ) =>
    mutationOptions({
      mutationFn: ({ number, event, body }: SubmitPullRequestReviewRequest) =>
        gitApi.submitPullRequestReview(repoPath!, number, event, body),
      onMutate: ({ number, event }) =>
        startGitActionNotice(
          "Submitting pull request review",
          `PR #${number} · ${event}`,
          repoPath,
        ),
      onSuccess: async (_data, { number }, context) => {
        await refreshGitStateAfterAction(
          queryClient,
          repoPath,
          context,
          "remote",
        );
        finishGitActionNotice(context, `Review submitted for PR #${number}.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  submitPullRequestLineComment: (
    queryClient: QueryClient,
    repoPath: string | null,
  ) =>
    mutationOptions({
      mutationFn: ({
        number,
        path,
        line,
        side,
        body,
      }: SubmitPullRequestLineCommentRequest) =>
        gitApi.submitPullRequestLineComment(
          repoPath!,
          number,
          path,
          line,
          side,
          body,
        ),
      onMutate: ({ number, path, line }) =>
        startGitActionNotice(
          "Submitting pull request line comment",
          `PR #${number} · ${path}:${line}`,
          repoPath,
        ),
      onSuccess: async (_data, { number }, context) => {
        await refreshGitStateAfterAction(
          queryClient,
          repoPath,
          context,
          "remote",
        );
        finishGitActionNotice(
          context,
          `Line comment submitted for PR #${number}.`,
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  addPullRequestLabel: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ number, labels }: EditPullRequestLabelsRequest) =>
        gitApi.addPullRequestLabel(repoPath!, number, labels),
      onMutate: ({ number, labels }) =>
        startGitActionNotice(
          "Adding pull request labels",
          `PR #${number} · ${labels.join(", ")}`,
          repoPath,
        ),
      onSuccess: async (_data, { number }, context) => {
        await refreshGitStateAfterAction(
          queryClient,
          repoPath,
          context,
          "remote",
        );
        finishGitActionNotice(context, `Labels added to PR #${number}.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  removePullRequestLabel: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ number, labels }: EditPullRequestLabelsRequest) =>
        gitApi.removePullRequestLabel(repoPath!, number, labels),
      onMutate: ({ number, labels }) =>
        startGitActionNotice(
          "Removing pull request labels",
          `PR #${number} · ${labels.join(", ")}`,
          repoPath,
        ),
      onSuccess: async (_data, { number }, context) => {
        await refreshGitStateAfterAction(
          queryClient,
          repoPath,
          context,
          "remote",
        );
        finishGitActionNotice(context, `Labels removed from PR #${number}.`);
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  mergePullRequest: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ number, method, admin, deleteBranch }: MergePullRequestRequest) =>
        gitApi.mergePullRequest(repoPath!, number, method, {
          admin: admin ?? false,
          deleteBranch: deleteBranch ?? true,
        }),
      onMutate: ({ number, method, admin, deleteBranch }) =>
        startGitActionNotice(
          "Merging pull request",
          `PR #${number} via ${method}${admin ? " with admin bypass" : ""}${deleteBranch === false ? " without deleting branch" : ""}`,
          repoPath,
        ),
      onSuccess: async (_data, { number }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, [
          "remote",
          "refs",
          "worktree",
        ]);
        finishGitActionNotice(
          context,
          `PR #${number} merged and repository views refreshed.`,
        );
      },
      onError: (error, _variables, context) =>
        failGitActionNotice(context, error),
    }),

  closePullRequest: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (number: number) =>
        gitApi.closePullRequest(repoPath!, number),
      onMutate: (number) =>
        startGitActionNotice("Closing pull request", `PR #${number}`, repoPath),
      onSuccess: async (_data, number, context) => {
        await refreshGitStateAfterAction(
          queryClient,
          repoPath,
          context,
          "remote",
        );
        finishGitActionNotice(context, `PR #${number} closed.`);
      },
      onError: (error, _number, context) => failGitActionNotice(context, error),
    }),
};
