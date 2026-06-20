import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { gitApi, type CheckoutBranchStrategy } from "./tauri-api";
import type { RebaseTodoItem } from "../types/git";
import { useNoticeStore } from "../stores/notice-store";


const enabledRepo = (repoPath: string | null | undefined): repoPath is string => Boolean(repoPath);

type GitInvalidationReason = "worktree" | "refs" | "remote" | "rebase";
export interface CheckoutBranchRequest {
  branchName: string;
  strategy: CheckoutBranchStrategy;
}
export interface CreateBranchRequest {
  name: string;
  checkout: boolean;
  startPoint?: string | null;
}

export interface FastForwardBranchRequest {
  branchName: string;
  upstream: string;
}

export interface CreateStashRequest {
  message?: string;
  includeUntracked: boolean;
}

export interface CreateTagRequest {
  name: string;
  target?: string;
  message?: string;
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

export interface GenerateSshKeyRequest {
  name: string;
  comment: string | null;
}





export const gitKeys = {
  all: ["git"] as const,
  recentRepositories: () => [...gitKeys.all, "recent-repositories"] as const,
  favoriteRepositories: () => [...gitKeys.all, "favorite-repositories"] as const,
  repository: (repoPath: string | null | undefined) => [...gitKeys.all, "repository", repoPath] as const,
  repositorySnapshot: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "snapshot"] as const,
  repositoryInfo: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "info"] as const,
  status: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "status"] as const,
  stagedFiles: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "staged-files"] as const,
  unstagedFiles: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "unstaged-files"] as const,
  commits: (repoPath: string | null | undefined, limit?: number) => [...gitKeys.repository(repoPath), "commits", limit ?? null] as const,
  commitDetails: (repoPath: string | null | undefined, commitHash: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "commit-details", commitHash] as const,
  fileDiff: (repoPath: string | null | undefined, filePath: string | null | undefined, staged: boolean) =>
    [...gitKeys.repository(repoPath), "file-diff", filePath, staged] as const,
  commitDiff: (repoPath: string | null | undefined, commitHash: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "commit-diff", commitHash] as const,
  branchSummary: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "branch-summary"] as const,
  workspaceSummary: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "workspace-summary"] as const,
  branches: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "branches"] as const,
  gitIdentity: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "git-identity"] as const,
  gitCredentialConfig: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "git-credential-config"] as const,
  lfsStatus: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "lfs-status"] as const,
  sshStatus: () => [...gitKeys.all, "ssh-status"] as const,
  remotes: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "remotes"] as const,
  stashes: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "stashes"] as const,
  tags: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "tags"] as const,
  worktrees: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "worktrees"] as const,
  submodules: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "submodules"] as const,
  rebaseState: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "rebase-state"] as const,
  conflictContent: (repoPath: string | null | undefined, filePath: string | null | undefined) =>
    [...gitKeys.repository(repoPath), "conflict-content", filePath] as const,
  githubOverview: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "github-overview"] as const,
  pullRequestDiff: (repoPath: string | null | undefined, number: number | null | undefined) =>
    [...gitKeys.repository(repoPath), "pull-request-diff", number] as const,
};

export function invalidateGitState(queryClient: QueryClient, repoPath: string | null | undefined) {
  const invalidations = [
    queryClient.invalidateQueries({ queryKey: gitKeys.recentRepositories() }),
    queryClient.invalidateQueries({ queryKey: gitKeys.favoriteRepositories() }),
  ];
  if (repoPath) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: gitKeys.repository(repoPath) }));
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
    queryClient.invalidateQueries({ queryKey: gitKeys.repositorySnapshot(repoPath) }),
  ];

  if (reason === "worktree") {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: [...gitKeys.repository(repoPath), "file-diff"] }),
    );
    invalidations.push(queryClient.invalidateQueries({ queryKey: gitKeys.stashes(repoPath) }));
  }

  if (reason === "refs" || reason === "remote" || reason === "rebase") {
    invalidations.push(queryClient.invalidateQueries({ queryKey: gitKeys.branchSummary(repoPath) }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: [...gitKeys.repository(repoPath), "commits"] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: [...gitKeys.repository(repoPath), "commit-details"] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: [...gitKeys.repository(repoPath), "commit-diff"] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: gitKeys.branches(repoPath) }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: gitKeys.remotes(repoPath) }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: gitKeys.tags(repoPath) }));
  }

  if (reason === "worktree" || reason === "rebase") {
    invalidations.push(queryClient.invalidateQueries({ queryKey: gitKeys.workspaceSummary(repoPath) }));
  }

  if (reason === "remote") {
    invalidations.push(queryClient.invalidateQueries({ queryKey: gitKeys.githubOverview(repoPath) }));
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: [...gitKeys.repository(repoPath), "pull-request-diff"] }),
    );
  }

  if (reason === "rebase") {
    invalidations.push(queryClient.invalidateQueries({ queryKey: gitKeys.rebaseState(repoPath) }));
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: [...gitKeys.repository(repoPath), "conflict-content"] }),
    );
  }

  return Promise.all(invalidations);
}

interface GitMutationNoticeContext {
  noticeId: string;
}

function startGitActionNotice(title: string, detail: string, repoPath: string | null | undefined): GitMutationNoticeContext {
  const noticeId = useNoticeStore.getState().startNotice({
    title,
    detail,
    repoPath,
    category: "git",
  });

  return { noticeId };
}

function setGitActionDetail(context: GitMutationNoticeContext | undefined, detail: string) {
  if (!context) {
    return;
  }

  useNoticeStore.getState().updateNotice(context.noticeId, { detail });
}

function finishGitActionNotice(context: GitMutationNoticeContext | undefined, detail: string) {
  if (!context) {
    return;
  }

  useNoticeStore.getState().finishNotice(context.noticeId, "success", detail);
}

function failGitActionNotice(context: GitMutationNoticeContext | undefined, error: unknown) {
  if (!context) {
    return;
  }

  const detail = error instanceof Error && error.message.length > 0 ? error.message : String(error);
  useNoticeStore.getState().finishNotice(context.noticeId, "error", detail);
}

async function refreshRepositoryLists(queryClient: QueryClient, context: GitMutationNoticeContext | undefined) {
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
  await Promise.all(reasonList.map((reason) => invalidateGitStateByReason(queryClient, repoPath, reason)));
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

  fileDiff: (repoPath: string | null, filePath: string | null, staged: boolean) =>
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

  rebaseState: (repoPath: string | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.rebaseState(repoPath),
      queryFn: () => gitApi.getRebaseState(repoPath!),
      enabled: enabledRepo(repoPath) && enabled,
      refetchInterval: (query) => (query.state.data?.inProgress ? 3000 : false),
    }),

  conflictContent: (repoPath: string | null, filePath: string | null, enabled = true) =>
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

  pullRequestDiff: (repoPath: string | null, number: number | null, enabled = true) =>
    queryOptions({
      queryKey: gitKeys.pullRequestDiff(repoPath, number),
      queryFn: () => gitApi.getPullRequestDiff(repoPath!, number!),
      enabled: enabledRepo(repoPath) && Boolean(number) && enabled,
    }),
};

export const gitMutations = {
  openRepository: (queryClient: QueryClient, setActiveRepoPath: (path: string | null) => void) =>
    mutationOptions({
      mutationFn: (path: string) => gitApi.openRepository(path),
      onMutate: (path) => startGitActionNotice("Opening repository", path, path),
      onSuccess: async (data, _path, context) => {
        queryClient.setQueryData(gitKeys.repositorySnapshot(data.repositoryInfo.path), data);
        setActiveRepoPath(data.repositoryInfo.path);
        await refreshRepositoryLists(queryClient, context);
        finishGitActionNotice(context, "Repository loaded.");
      },
      onError: (error, _path, context) => failGitActionNotice(context, error),
    }),

  initRepository: (queryClient: QueryClient, setActiveRepoPath: (path: string | null) => void) =>
    mutationOptions({
      mutationFn: (path: string) => gitApi.initRepository(path),
      onMutate: (path) => startGitActionNotice("Initializing repository", path, path),
      onSuccess: async (data, _path, context) => {
        queryClient.setQueryData(gitKeys.repositorySnapshot(data.repositoryInfo.path), data);
        setActiveRepoPath(data.repositoryInfo.path);
        await refreshRepositoryLists(queryClient, context);
        finishGitActionNotice(context, "Repository initialized.");
      },
      onError: (error, _path, context) => failGitActionNotice(context, error),
    }),

  cloneRepository: (queryClient: QueryClient, setActiveRepoPath: (path: string | null) => void) =>
    mutationOptions({
      mutationFn: ({ url, destination }: { url: string; destination: string }) => gitApi.cloneRepository(url, destination),
      onMutate: ({ url, destination }) => startGitActionNotice("Cloning repository", `${url} → ${destination}`, destination),
      onSuccess: async (data, _variables, context) => {
        queryClient.setQueryData(gitKeys.repositorySnapshot(data.repositoryInfo.path), data);
        setActiveRepoPath(data.repositoryInfo.path);
        await refreshRepositoryLists(queryClient, context);
        finishGitActionNotice(context, "Clone complete.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  setRepositoryFavorite: (queryClient: QueryClient) =>
    mutationOptions({
      mutationFn: ({ repoPath, name, favorite }: { repoPath: string; name: string; favorite: boolean }) =>
        gitApi.setRepositoryFavorite(repoPath, name, favorite),
      onMutate: ({ repoPath, name, favorite }) =>
        startGitActionNotice(favorite ? "Adding favorite" : "Removing favorite", name, repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshRepositoryLists(queryClient, context);
        finishGitActionNotice(context, "Repository lists refreshed.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  stageFile: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (filePath: string) => gitApi.stageFile(repoPath!, filePath),
      onMutate: (filePath) => startGitActionNotice("Staging file", filePath, repoPath),
      onSuccess: async (_data, _filePath, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(context, "File staged and repository views refreshed.");
      },
      onError: (error, _filePath, context) => failGitActionNotice(context, error),
    }),

  unstageFile: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (filePath: string) => gitApi.unstageFile(repoPath!, filePath),
      onMutate: (filePath) => startGitActionNotice("Unstaging file", filePath, repoPath),
      onSuccess: async (_data, _filePath, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(context, "File unstaged and repository views refreshed.");
      },
      onError: (error, _filePath, context) => failGitActionNotice(context, error),
    }),

  stageAll: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.stageAll(repoPath!),
      onMutate: () => startGitActionNotice("Staging all files", "Preparing the index…", repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(context, "All files staged and repository views refreshed.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  unstageAll: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.unstageAll(repoPath!),
      onMutate: () => startGitActionNotice("Unstaging all files", "Resetting the index…", repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(context, "All files unstaged and repository views refreshed.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  commit: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (message: string) => gitApi.commit(repoPath!, message),
      onMutate: (message) => startGitActionNotice("Creating commit", message.split("\n", 1)[0], repoPath),
      onSuccess: async (_data, _message, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, ["worktree", "refs"]);
        finishGitActionNotice(context, "Commit created and affected Git views refreshed.");
      },
      onError: (error, _message, context) => failGitActionNotice(context, error),
    }),

  checkoutBranch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ branchName, strategy }: CheckoutBranchRequest) => gitApi.checkoutBranch(repoPath!, branchName, strategy),
      onMutate: ({ branchName, strategy }) =>
        startGitActionNotice(
          strategy === "stash" ? "Stashing changes and checking out branch" : "Checking out branch",
          branchName,
          repoPath,
        ),
      onSuccess: async (_data, { branchName }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, ["refs", "worktree"]);
        finishGitActionNotice(context, `${branchName} checked out and repository views refreshed.`);
      },
      onError: (error, _branchName, context) => failGitActionNotice(context, error),
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
        await refreshGitStateAfterAction(queryClient, repoPath, context, ["refs", "worktree"]);
        finishGitActionNotice(context, `${name} created and repository views refreshed.`);
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  fastForwardBranch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ branchName, upstream }: FastForwardBranchRequest) =>
        gitApi.fastForwardBranch(repoPath!, branchName, upstream),
      onMutate: ({ branchName, upstream }) =>
        startGitActionNotice("Fast-forwarding branch", `${branchName} from ${upstream}`, repoPath),
      onSuccess: async (_data, { branchName }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, ["refs", "worktree"]);
        finishGitActionNotice(context, `${branchName} fast-forwarded and repository views refreshed.`);
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  mergeBranch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (source: string) => gitApi.mergeBranch(repoPath!, source),
      onMutate: (source) => startGitActionNotice("Merging branch", `${source} into current branch`, repoPath),
      onSuccess: async (_data, source, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, ["refs", "worktree"]);
        finishGitActionNotice(context, `${source} merged into the current branch.`);
      },
      onError: (error, _source, context) => failGitActionNotice(context, error),
    }),

  setGitIdentity: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ name, email }: { name: string | null; email: string | null }) =>
        gitApi.setGitIdentity(repoPath!, name, email),
      onMutate: ({ name, email }) =>
        startGitActionNotice("Saving Git identity", [name, email].filter(Boolean).join(" · ") || "Clearing local identity", repoPath),
      onSuccess: async (identity, _variables, context) => {
        queryClient.setQueryData(gitKeys.gitIdentity(repoPath), identity);
        finishGitActionNotice(context, "Git identity saved.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  setGitCredentialHelper: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (helper: string | null) => gitApi.setGitCredentialHelper(repoPath!, helper),
      onMutate: (helper) => startGitActionNotice("Saving credential helper", helper || "Clearing local helper", repoPath),
      onSuccess: (config, _helper, context) => {
        queryClient.setQueryData(gitKeys.gitCredentialConfig(repoPath), config);
        finishGitActionNotice(context, "Credential helper saved.");
      },
      onError: (error, _helper, context) => failGitActionNotice(context, error),
    }),

  installLfs: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.installLfs(repoPath!),
      onMutate: () => startGitActionNotice("Installing Git LFS", "Configuring local repository hooks", repoPath),
      onSuccess: async (_data, _variables, context) => {
        await queryClient.invalidateQueries({ queryKey: gitKeys.lfsStatus(repoPath) });
        finishGitActionNotice(context, "Git LFS installed for this repository.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  trackLfsPattern: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (pattern: string) => gitApi.trackLfsPattern(repoPath!, pattern),
      onMutate: (pattern) => startGitActionNotice("Tracking Git LFS pattern", pattern, repoPath),
      onSuccess: async (_data, _pattern, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "worktree");
        await queryClient.invalidateQueries({ queryKey: gitKeys.lfsStatus(repoPath) });
        finishGitActionNotice(context, "Git LFS tracking updated.");
      },
      onError: (error, _pattern, context) => failGitActionNotice(context, error),
    }),

  untrackLfsPattern: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (pattern: string) => gitApi.untrackLfsPattern(repoPath!, pattern),
      onMutate: (pattern) => startGitActionNotice("Untracking Git LFS pattern", pattern, repoPath),
      onSuccess: async (_data, _pattern, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "worktree");
        await queryClient.invalidateQueries({ queryKey: gitKeys.lfsStatus(repoPath) });
        finishGitActionNotice(context, "Git LFS tracking updated.");
      },
      onError: (error, _pattern, context) => failGitActionNotice(context, error),
    }),

  generateSshKey: (queryClient: QueryClient) =>
    mutationOptions({
      mutationFn: ({ name, comment }: GenerateSshKeyRequest) => gitApi.generateSshKey(name, comment),
      onMutate: ({ name }) => startGitActionNotice("Generating SSH key", name, null),
      onSuccess: (status, _variables, context) => {
        queryClient.setQueryData(gitKeys.sshStatus(), status);
        finishGitActionNotice(context, "SSH key generated.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  addSshKeyToAgent: (queryClient: QueryClient) =>
    mutationOptions({
      mutationFn: (name: string) => gitApi.addSshKeyToAgent(name),
      onMutate: (name) => startGitActionNotice("Adding SSH key to agent", name, null),
      onSuccess: (status, _name, context) => {
        queryClient.setQueryData(gitKeys.sshStatus(), status);
        finishGitActionNotice(context, "SSH agent updated.");
      },
      onError: (error, _name, context) => failGitActionNotice(context, error),
    }),

  deleteBranch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (branchName: string) => gitApi.deleteBranch(repoPath!, branchName),
      onMutate: (branchName) => startGitActionNotice("Deleting branch", branchName, repoPath),
      onSuccess: async (_data, branchName, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "refs");
        finishGitActionNotice(context, `${branchName} deleted and repository views refreshed.`);
      },
      onError: (error, _branchName, context) => failGitActionNotice(context, error),
    }),

  fetch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (remote?: string) => gitApi.fetch(repoPath!, remote),
      onMutate: (remote) => startGitActionNotice("Fetching", remote ? `Remote: ${remote}` : "Fetching from configured remotes…", repoPath),
      onSuccess: async (_data, _remote, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "remote");
        finishGitActionNotice(context, "Fetch complete and affected Git views refreshed.");
      },
      onError: (error, _remote, context) => failGitActionNotice(context, error),
    }),

  pull: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ remote, branch }: { remote?: string; branch?: string }) => gitApi.pull(repoPath!, remote, branch),
      onMutate: ({ remote, branch }) =>
        startGitActionNotice("Pulling", [remote, branch].filter(Boolean).join("/") || "Pulling current branch…", repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, ["remote", "refs", "worktree"]);
        finishGitActionNotice(context, "Pull complete and affected Git views refreshed.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  push: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ remote, branch }: { remote?: string; branch?: string }) => gitApi.push(repoPath!, remote, branch),
      onMutate: ({ remote, branch }) =>
        startGitActionNotice("Pushing", [remote, branch].filter(Boolean).join("/") || "Pushing current branch…", repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "remote");
        finishGitActionNotice(context, "Push complete and affected Git views refreshed.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  createStash: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ message, includeUntracked }: CreateStashRequest) =>
        gitApi.createStash(repoPath!, message, includeUntracked),
      onMutate: ({ message }) => startGitActionNotice("Creating stash", message?.trim() || "Saving local changes…", repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "worktree");
        finishGitActionNotice(context, "Stash created and working tree refreshed.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  applyStash: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (stashName: string) => gitApi.applyStash(repoPath!, stashName),
      onMutate: (stashName) => startGitActionNotice("Applying stash", stashName, repoPath),
      onSuccess: async (_data, _stashName, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "worktree");
        finishGitActionNotice(context, "Stash applied and working tree refreshed.");
      },
      onError: (error, _stashName, context) => failGitActionNotice(context, error),
    }),

  popStash: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (stashName: string) => gitApi.popStash(repoPath!, stashName),
      onMutate: (stashName) => startGitActionNotice("Popping stash", stashName, repoPath),
      onSuccess: async (_data, _stashName, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "worktree");
        finishGitActionNotice(context, "Stash popped and working tree refreshed.");
      },
      onError: (error, _stashName, context) => failGitActionNotice(context, error),
    }),

  dropStash: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (stashName: string) => gitApi.dropStash(repoPath!, stashName),
      onMutate: (stashName) => startGitActionNotice("Dropping stash", stashName, repoPath),
      onSuccess: async (_data, _stashName, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "worktree");
        finishGitActionNotice(context, "Stash dropped and stash list refreshed.");
      },
      onError: (error, _stashName, context) => failGitActionNotice(context, error),
    }),

  createTag: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ name, target, message }: CreateTagRequest) =>
        gitApi.createTag(repoPath!, name, target, message),
      onMutate: ({ name, target }) => startGitActionNotice("Creating tag", target ? `${name} at ${target}` : name, repoPath),
      onSuccess: async (_data, { name }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "refs");
        finishGitActionNotice(context, `${name} created and refs refreshed.`);
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  deleteTag: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (name: string) => gitApi.deleteTag(repoPath!, name),
      onMutate: (name) => startGitActionNotice("Deleting tag", name, repoPath),
      onSuccess: async (_data, name, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "refs");
        finishGitActionNotice(context, `${name} deleted and refs refreshed.`);
      },
      onError: (error, _name, context) => failGitActionNotice(context, error),
    }),

  createWorktree: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ path, branch, createBranch }: { path: string; branch: string | null; createBranch: boolean }) =>
        gitApi.createWorktree(repoPath!, path, branch, createBranch),
      onMutate: ({ path, branch }) => startGitActionNotice("Creating worktree", branch ? `${branch} → ${path}` : path, repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(context, "Worktree created and repository views refreshed.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  removeWorktree: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ path, force }: { path: string; force: boolean }) => gitApi.removeWorktree(repoPath!, path, force),
      onMutate: ({ path, force }) => startGitActionNotice(force ? "Force removing worktree" : "Removing worktree", path, repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(context, "Worktree removed and repository views refreshed.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  pruneWorktrees: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.pruneWorktrees(repoPath!),
      onMutate: () => startGitActionNotice("Pruning worktrees", "Removing stale worktree metadata…", repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(context, "Worktrees pruned and repository views refreshed.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  updateSubmodule: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ path, recursive }: { path: string; recursive: boolean }) => gitApi.updateSubmodule(repoPath!, path, recursive),
      onMutate: ({ path, recursive }) =>
        startGitActionNotice("Updating submodule", recursive ? `${path} recursively` : path, repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(context, "Submodule updated and repository views refreshed.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  syncSubmodules: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ recursive }: { recursive: boolean }) => gitApi.syncSubmodules(repoPath!, recursive),
      onMutate: ({ recursive }) =>
        startGitActionNotice("Syncing submodules", recursive ? "Recursive sync requested…" : "Syncing configured submodules…", repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(context, "Submodules synced and repository views refreshed.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  openSubmodule: (repoPath: string | null) =>
    mutationOptions({
      mutationFn: (path: string) => gitApi.openSubmodule(repoPath!, path),
      onMutate: (path) => startGitActionNotice("Opening submodule", path, repoPath),
      onSuccess: (_data, _path, context) => finishGitActionNotice(context, "Submodule opened."),
      onError: (error, _path, context) => failGitActionNotice(context, error),
    }),

  bumpSubmodule: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ path }: { path: string }) => gitApi.bumpSubmodule(repoPath!, path),
      onMutate: ({ path }) => startGitActionNotice("Bumping submodule", path, repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context);
        finishGitActionNotice(context, "Submodule bumped and repository views refreshed.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  continueRebase: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.continueRebase(repoPath!),
      onMutate: () => startGitActionNotice("Continuing rebase", "Applying the next rebase step…", repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, ["rebase", "refs", "worktree"]);
        finishGitActionNotice(context, "Rebase advanced and repository views refreshed.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  abortRebase: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.abortRebase(repoPath!),
      onMutate: () => startGitActionNotice("Aborting rebase", "Restoring repository state…", repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, ["rebase", "refs", "worktree"]);
        finishGitActionNotice(context, "Rebase aborted and repository views refreshed.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  skipRebase: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.skipRebase(repoPath!),
      onMutate: () => startGitActionNotice("Skipping rebase commit", "Dropping the current patch…", repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, ["rebase", "refs", "worktree"]);
        finishGitActionNotice(context, "Commit skipped and repository views refreshed.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  markFileResolved: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (filePath: string) => gitApi.markFileResolved(repoPath!, filePath),
      onMutate: (filePath) => startGitActionNotice("Marking conflict resolved", filePath, repoPath),
      onSuccess: async (_data, _filePath, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, ["rebase", "worktree"]);
        finishGitActionNotice(context, "Conflict marked resolved and repository views refreshed.");
      },
      onError: (error, _filePath, context) => failGitActionNotice(context, error),
    }),

  checkoutConflictSide: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ filePath, side }: { filePath: string; side: "ours" | "theirs" }) =>
        gitApi.checkoutConflictSide(repoPath!, filePath, side),
      onMutate: ({ filePath, side }) => startGitActionNotice(side === "ours" ? "Using current side" : "Using incoming side", filePath, repoPath),
      onSuccess: async (_data, _variables, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, ["rebase", "worktree"]);
        finishGitActionNotice(context, "Conflict side applied, staged, and repository views refreshed.");
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  updateRebaseTodo: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (items: RebaseTodoItem[]) => gitApi.updateRebaseTodo(repoPath!, items),
      onMutate: (items) => startGitActionNotice("Updating rebase todo", `${items.length} item${items.length === 1 ? "" : "s"}`, repoPath),
      onSuccess: async (_data, _items, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "rebase");
        finishGitActionNotice(context, "Rebase todo updated and repository views refreshed.");
      },
      onError: (error, _items, context) => failGitActionNotice(context, error),
    }),

  checkoutPullRequest: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (number: number) => gitApi.checkoutPullRequest(repoPath!, number),
      onMutate: (number) => startGitActionNotice("Checking out pull request", `PR #${number}`, repoPath),
      onSuccess: async (_data, number, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, ["remote", "refs", "worktree"]);
        finishGitActionNotice(context, `PR #${number} checked out and repository views refreshed.`);
      },
      onError: (error, _number, context) => failGitActionNotice(context, error),
    }),

  updatePullRequestBranch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (number: number) => gitApi.updatePullRequestBranch(repoPath!, number),
      onMutate: (number) => startGitActionNotice("Updating pull request branch", `PR #${number}`, repoPath),
      onSuccess: async (_data, number, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, ["remote", "refs", "worktree"]);
        finishGitActionNotice(context, `PR #${number} updated and repository views refreshed.`);
      },
      onError: (error, _number, context) => failGitActionNotice(context, error),
    }),

  requestPullRequestReview: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ number, reviewers, teams = [] }: RequestPullRequestReviewRequest) =>
        gitApi.requestPullRequestReview(repoPath!, number, reviewers, teams),
      onMutate: ({ number, reviewers, teams = [] }) =>
        startGitActionNotice("Requesting pull request review", `PR #${number} · ${reviewers.length + teams.length} reviewer${reviewers.length + teams.length === 1 ? "" : "s"}`, repoPath),
      onSuccess: async (_data, { number }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "remote");
        finishGitActionNotice(context, `Review requested for PR #${number}.`);
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  submitPullRequestReview: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ number, event, body }: SubmitPullRequestReviewRequest) =>
        gitApi.submitPullRequestReview(repoPath!, number, event, body),
      onMutate: ({ number, event }) => startGitActionNotice("Submitting pull request review", `PR #${number} · ${event}`, repoPath),
      onSuccess: async (_data, { number }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "remote");
        finishGitActionNotice(context, `Review submitted for PR #${number}.`);
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  submitPullRequestLineComment: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ number, path, line, side, body }: SubmitPullRequestLineCommentRequest) =>
        gitApi.submitPullRequestLineComment(repoPath!, number, path, line, side, body),
      onMutate: ({ number, path, line }) =>
        startGitActionNotice("Submitting pull request line comment", `PR #${number} · ${path}:${line}`, repoPath),
      onSuccess: async (_data, { number }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "remote");
        finishGitActionNotice(context, `Line comment submitted for PR #${number}.`);
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  addPullRequestLabel: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ number, labels }: EditPullRequestLabelsRequest) =>
        gitApi.addPullRequestLabel(repoPath!, number, labels),
      onMutate: ({ number, labels }) => startGitActionNotice("Adding pull request labels", `PR #${number} · ${labels.join(", ")}`, repoPath),
      onSuccess: async (_data, { number }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "remote");
        finishGitActionNotice(context, `Labels added to PR #${number}.`);
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  removePullRequestLabel: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ number, labels }: EditPullRequestLabelsRequest) =>
        gitApi.removePullRequestLabel(repoPath!, number, labels),
      onMutate: ({ number, labels }) => startGitActionNotice("Removing pull request labels", `PR #${number} · ${labels.join(", ")}`, repoPath),
      onSuccess: async (_data, { number }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, "remote");
        finishGitActionNotice(context, `Labels removed from PR #${number}.`);
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),

  mergePullRequest: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ number, method }: { number: number; method: "merge" | "rebase" | "squash" }) =>
        gitApi.mergePullRequest(repoPath!, number, method),
      onMutate: ({ number, method }) => startGitActionNotice("Merging pull request", `PR #${number} via ${method}`, repoPath),
      onSuccess: async (_data, { number }, context) => {
        await refreshGitStateAfterAction(queryClient, repoPath, context, ["remote", "refs", "worktree"]);
        finishGitActionNotice(context, `PR #${number} merged and repository views refreshed.`);
      },
      onError: (error, _variables, context) => failGitActionNotice(context, error),
    }),
};
