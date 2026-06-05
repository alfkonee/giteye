import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../lib/git-data";

export function useGitStatus(repoPath: string | null) {
  return useQuery(gitQueries.status(repoPath));
}

export function useStagedFiles(repoPath: string | null) {
  return useQuery(gitQueries.stagedFiles(repoPath));
}

export function useUnstagedFiles(repoPath: string | null) {
  return useQuery(gitQueries.unstagedFiles(repoPath));
}

export function useStageFile(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.stageFile(queryClient, repoPath));
}

export function useUnstageFile(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.unstageFile(queryClient, repoPath));
}

export function useStageAll(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.stageAll(queryClient, repoPath));
}

export function useUnstageAll(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.unstageAll(queryClient, repoPath));
}

export function useCommit(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.commit(queryClient, repoPath));
}
