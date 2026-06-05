import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../lib/git-data";
import { useAppStore } from "../stores/app-store";

export function useRepositoryInfo(repoPath: string | null) {
  return useQuery(gitQueries.repositoryInfo(repoPath));
}

export function useOpenRepository() {
  const setActiveRepoPath = useAppStore((s) => s.setActiveRepoPath);
  const queryClient = useQueryClient();
  return useMutation(gitMutations.openRepository(queryClient, setActiveRepoPath));
}

export function useInitRepository() {
  const setActiveRepoPath = useAppStore((s) => s.setActiveRepoPath);
  const queryClient = useQueryClient();
  return useMutation(gitMutations.initRepository(queryClient, setActiveRepoPath));
}

export function useCloneRepository() {
  const setActiveRepoPath = useAppStore((s) => s.setActiveRepoPath);
  const queryClient = useQueryClient();
  return useMutation(gitMutations.cloneRepository(queryClient, setActiveRepoPath));
}

export function useRecentRepositories() {
  return useQuery(gitQueries.recentRepositories());
}
