import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../lib/git-data";

export function useWorktrees(repoPath: string | null) {
  return useQuery(gitQueries.worktrees(repoPath));
}

export function useCreateWorktree(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.createWorktree(queryClient, repoPath));
}

export function useRemoveWorktree(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.removeWorktree(queryClient, repoPath));
}

export function usePruneWorktrees(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.pruneWorktrees(queryClient, repoPath));
}

export function usePruneWorktreesDryRun(repoPath: string | null) {
  return useMutation(gitMutations.pruneWorktreesDryRun(repoPath));
}

export function useMoveWorktree(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.moveWorktree(queryClient, repoPath));
}

export function useLockWorktree(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.lockWorktree(queryClient, repoPath));
}

export function useUnlockWorktree(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.unlockWorktree(queryClient, repoPath));
}

export function useRepairWorktree(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.repairWorktree(queryClient, repoPath));
}


export function useRepairWorktreeDryRun(repoPath: string | null) {
  return useMutation(gitMutations.repairWorktreeDryRun(repoPath));
}

export function useSubmodules(repoPath: string | null) {
  return useQuery(gitQueries.submodules(repoPath));
}

export function useSubmoduleForeachStatus(
  repoPath: string | null,
  recursive: boolean,
  enabled = true,
) {
  return useQuery(gitQueries.submoduleForeachStatus(repoPath, recursive, enabled));
}


export function useUpdateSubmodule(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.updateSubmodule(queryClient, repoPath));
}

export function useSubmoduleInitUpdate(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.submoduleInitUpdate(queryClient, repoPath));
}

export function useSubmoduleSetBranch(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.submoduleSetBranch(queryClient, repoPath));
}

export function useSyncSubmodules(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.syncSubmodules(queryClient, repoPath));
}

export function useBumpSubmodule(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.bumpSubmodule(queryClient, repoPath));
}

export function useRebaseState(repoPath: string | null) {
  return useQuery(gitQueries.rebaseState(repoPath));
}

export function useConflictContent(repoPath: string | null, filePath: string | null) {
  return useQuery(gitQueries.conflictContent(repoPath, filePath));
}

export function useRebaseActions(repoPath: string | null) {
  const queryClient = useQueryClient();

  return {
    continueRebase: useMutation(gitMutations.continueRebase(queryClient, repoPath)),
    abortRebase: useMutation(gitMutations.abortRebase(queryClient, repoPath)),
    skipRebase: useMutation(gitMutations.skipRebase(queryClient, repoPath)),
    markFileResolved: useMutation(gitMutations.markFileResolved(queryClient, repoPath)),
    updateTodo: useMutation(gitMutations.updateRebaseTodo(queryClient, repoPath)),
  };
}

export function useRepositoryGithubOverview(repoPath: string | null) {
  return useQuery(gitQueries.githubOverview(repoPath));
}

export function usePullRequestDiff(repoPath: string | null, number: number | null) {
  return useQuery(gitQueries.pullRequestDiff(repoPath, number));
}

export function usePullRequestActions(repoPath: string | null) {
  const queryClient = useQueryClient();

  return {
    checkout: useMutation(gitMutations.checkoutPullRequest(queryClient, repoPath)),
    updateBranch: useMutation(gitMutations.updatePullRequestBranch(queryClient, repoPath)),
    merge: useMutation(gitMutations.mergePullRequest(queryClient, repoPath)),
  };
}

export function useOpenSubmodule(repoPath: string | null) {
  return useMutation(gitMutations.openSubmodule(repoPath));
}
