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
  remotes: (repoPath: string | null | undefined) => [...gitKeys.repository(repoPath), "remotes"] as const,
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
  }

  if (reason === "refs" || reason === "remote") {
    invalidations.push(queryClient.invalidateQueries({ queryKey: gitKeys.branchSummary(repoPath) }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: [...gitKeys.repository(repoPath), "commits"] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: [...gitKeys.repository(repoPath), "commit-details"] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: [...gitKeys.repository(repoPath), "commit-diff"] }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: gitKeys.branches(repoPath) }));
    invalidations.push(queryClient.invalidateQueries({ queryKey: gitKeys.remotes(repoPath) }));
  }

  if (reason === "worktree") {
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
