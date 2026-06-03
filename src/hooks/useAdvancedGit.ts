import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitApi } from "../lib/tauri-api";
import type { RebaseTodoItem } from "../types/git";

const enabledRepo = (repoPath: string | null | undefined): repoPath is string => Boolean(repoPath);

export function useWorktrees(repoPath: string | null) {
  return useQuery({
    queryKey: ["worktrees", repoPath],
    queryFn: () => gitApi.listWorktrees(repoPath!),
    enabled: enabledRepo(repoPath),
  });
}

export function useCreateWorktree(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, branch, createBranch }: { path: string; branch: string | null; createBranch: boolean }) =>
      gitApi.createWorktree(repoPath!, path, branch, createBranch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["worktrees", repoPath] }),
  });
}

export function useRemoveWorktree(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, force }: { path: string; force: boolean }) => gitApi.removeWorktree(repoPath!, path, force),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["worktrees", repoPath] }),
  });
}

export function usePruneWorktrees(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => gitApi.pruneWorktrees(repoPath!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["worktrees", repoPath] }),
  });
}

export function useSubmodules(repoPath: string | null) {
  return useQuery({
    queryKey: ["submodules", repoPath],
    queryFn: () => gitApi.listSubmodules(repoPath!),
    enabled: enabledRepo(repoPath),
  });
}

export function useUpdateSubmodule(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, recursive }: { path: string; recursive: boolean }) => gitApi.updateSubmodule(repoPath!, path, recursive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["submodules", repoPath] }),
  });
}

export function useSyncSubmodules(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recursive }: { recursive: boolean }) => gitApi.syncSubmodules(repoPath!, recursive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["submodules", repoPath] }),
  });
}

export function useBumpSubmodule(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path }: { path: string }) => gitApi.bumpSubmodule(repoPath!, path),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["submodules", repoPath] }),
  });
}

export function useRebaseState(repoPath: string | null) {
  return useQuery({
    queryKey: ["rebase-state", repoPath],
    queryFn: () => gitApi.getRebaseState(repoPath!),
    enabled: enabledRepo(repoPath),
    refetchInterval: (query) => (query.state.data?.inProgress ? 3000 : false),
  });
}

export function useConflictContent(repoPath: string | null, filePath: string | null) {
  return useQuery({
    queryKey: ["conflict-content", repoPath, filePath],
    queryFn: () => gitApi.getConflictContent(repoPath!, filePath!),
    enabled: enabledRepo(repoPath) && Boolean(filePath),
  });
}

export function useRebaseActions(repoPath: string | null) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["rebase-state", repoPath] });
    queryClient.invalidateQueries({ queryKey: ["conflict-content", repoPath] });
  };

  return {
    continueRebase: useMutation({ mutationFn: () => gitApi.continueRebase(repoPath!), onSuccess: invalidate }),
    abortRebase: useMutation({ mutationFn: () => gitApi.abortRebase(repoPath!), onSuccess: invalidate }),
    skipRebase: useMutation({ mutationFn: () => gitApi.skipRebase(repoPath!), onSuccess: invalidate }),
    markFileResolved: useMutation({ mutationFn: (filePath: string) => gitApi.markFileResolved(repoPath!, filePath), onSuccess: invalidate }),
    updateTodo: useMutation({ mutationFn: (items: RebaseTodoItem[]) => gitApi.updateRebaseTodo(repoPath!, items), onSuccess: invalidate }),
  };
}

export function useRepositoryGithubOverview(repoPath: string | null) {
  return useQuery({
    queryKey: ["github-overview", repoPath],
    queryFn: () => gitApi.getRepositoryGithubOverview(repoPath!),
    enabled: enabledRepo(repoPath),
  });
}

export function usePullRequestDiff(repoPath: string | null, number: number | null) {
  return useQuery({
    queryKey: ["pull-request-diff", repoPath, number],
    queryFn: () => gitApi.getPullRequestDiff(repoPath!, number!),
    enabled: enabledRepo(repoPath) && Boolean(number),
  });
}

export function usePullRequestActions(repoPath: string | null) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["github-overview", repoPath] });
    queryClient.invalidateQueries({ queryKey: ["pull-request-diff", repoPath] });
    queryClient.invalidateQueries({ queryKey: ["repoInfo", repoPath] });
  };

  return {
    checkout: useMutation({ mutationFn: (number: number) => gitApi.checkoutPullRequest(repoPath!, number), onSuccess: invalidate }),
    updateBranch: useMutation({ mutationFn: (number: number) => gitApi.updatePullRequestBranch(repoPath!, number), onSuccess: invalidate }),
    merge: useMutation({ mutationFn: ({ number, method }: { number: number; method: "merge" | "rebase" | "squash" }) => gitApi.mergePullRequest(repoPath!, number, method), onSuccess: invalidate }),
  };
}
