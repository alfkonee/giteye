import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { gitApi } from "./tauri-api";
import type { RebaseTodoItem } from "../types/git";


const enabledRepo = (repoPath: string | null | undefined): repoPath is string => Boolean(repoPath);

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
  reason: "worktree" | "refs" | "remote" | "rebase" | string,
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

  if (reason === "worktree" || reason === "remote") {
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
      onSuccess: (data) => {
        queryClient.setQueryData(gitKeys.repositorySnapshot(data.repositoryInfo.path), data);
        setActiveRepoPath(data.repositoryInfo.path);
        void invalidateGitState(queryClient, data.repositoryInfo.path);
      },
    }),

  initRepository: (queryClient: QueryClient, setActiveRepoPath: (path: string | null) => void) =>
    mutationOptions({
      mutationFn: (path: string) => gitApi.initRepository(path),
      onSuccess: (data) => {
        queryClient.setQueryData(gitKeys.repositorySnapshot(data.repositoryInfo.path), data);
        setActiveRepoPath(data.repositoryInfo.path);
        void invalidateGitState(queryClient, data.repositoryInfo.path);
      },
    }),

  cloneRepository: (queryClient: QueryClient, setActiveRepoPath: (path: string | null) => void) =>
    mutationOptions({
      mutationFn: ({ url, destination }: { url: string; destination: string }) => gitApi.cloneRepository(url, destination),
      onSuccess: (data) => {
        queryClient.setQueryData(gitKeys.repositorySnapshot(data.repositoryInfo.path), data);
        setActiveRepoPath(data.repositoryInfo.path);
        void invalidateGitState(queryClient, data.repositoryInfo.path);
      },
    }),

  setRepositoryFavorite: (queryClient: QueryClient) =>
    mutationOptions({
      mutationFn: ({ repoPath, name, favorite }: { repoPath: string; name: string; favorite: boolean }) =>
        gitApi.setRepositoryFavorite(repoPath, name, favorite),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: gitKeys.favoriteRepositories() });
        void queryClient.invalidateQueries({ queryKey: gitKeys.recentRepositories() });
      },
    }),

  stageFile: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (filePath: string) => gitApi.stageFile(repoPath!, filePath),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  unstageFile: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (filePath: string) => gitApi.unstageFile(repoPath!, filePath),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  stageAll: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.stageAll(repoPath!),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  unstageAll: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.unstageAll(repoPath!),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  commit: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (message: string) => gitApi.commit(repoPath!, message),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  checkoutBranch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (branchName: string) => gitApi.checkoutBranch(repoPath!, branchName),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  createBranch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ name, checkout }: { name: string; checkout: boolean }) => gitApi.createBranch(repoPath!, name, checkout),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  deleteBranch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (branchName: string) => gitApi.deleteBranch(repoPath!, branchName),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  fetch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (remote?: string) => gitApi.fetch(repoPath!, remote),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  pull: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ remote, branch }: { remote?: string; branch?: string }) => gitApi.pull(repoPath!, remote, branch),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  push: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ remote, branch }: { remote?: string; branch?: string }) => gitApi.push(repoPath!, remote, branch),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  createWorktree: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ path, branch, createBranch }: { path: string; branch: string | null; createBranch: boolean }) =>
        gitApi.createWorktree(repoPath!, path, branch, createBranch),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  removeWorktree: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ path, force }: { path: string; force: boolean }) => gitApi.removeWorktree(repoPath!, path, force),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  pruneWorktrees: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.pruneWorktrees(repoPath!),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  updateSubmodule: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ path, recursive }: { path: string; recursive: boolean }) => gitApi.updateSubmodule(repoPath!, path, recursive),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  syncSubmodules: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ recursive }: { recursive: boolean }) => gitApi.syncSubmodules(repoPath!, recursive),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  openSubmodule: (repoPath: string | null) =>
    mutationOptions({
      mutationFn: (path: string) => gitApi.openSubmodule(repoPath!, path),
    }),

  bumpSubmodule: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ path }: { path: string }) => gitApi.bumpSubmodule(repoPath!, path),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  continueRebase: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.continueRebase(repoPath!),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  abortRebase: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.abortRebase(repoPath!),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  skipRebase: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: () => gitApi.skipRebase(repoPath!),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  markFileResolved: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (filePath: string) => gitApi.markFileResolved(repoPath!, filePath),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  updateRebaseTodo: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (items: RebaseTodoItem[]) => gitApi.updateRebaseTodo(repoPath!, items),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  checkoutPullRequest: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (number: number) => gitApi.checkoutPullRequest(repoPath!, number),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  updatePullRequestBranch: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: (number: number) => gitApi.updatePullRequestBranch(repoPath!, number),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),

  mergePullRequest: (queryClient: QueryClient, repoPath: string | null) =>
    mutationOptions({
      mutationFn: ({ number, method }: { number: number; method: "merge" | "rebase" | "squash" }) =>
        gitApi.mergePullRequest(repoPath!, number, method),
      onSuccess: () => void invalidateGitState(queryClient, repoPath),
    }),
};
