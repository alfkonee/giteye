import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gitApi } from "../lib/tauri-api";

export function useBranches(repoPath: string | null) {
  return useQuery({
    queryKey: ["branches", repoPath],
    queryFn: () => gitApi.listBranches(repoPath!),
    enabled: !!repoPath,
  });
}

export function useCheckoutBranch(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (branchName: string) => gitApi.checkoutBranch(repoPath!, branchName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches", repoPath] });
      queryClient.invalidateQueries({ queryKey: ["repoInfo", repoPath] });
      queryClient.invalidateQueries({ queryKey: ["status", repoPath] });
      queryClient.invalidateQueries({ queryKey: ["commits", repoPath] });
    },
  });
}

export function useCreateBranch(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, checkout }: { name: string; checkout: boolean }) =>
      gitApi.createBranch(repoPath!, name, checkout),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches", repoPath] });
    },
  });
}

export function useDeleteBranch(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (branchName: string) => gitApi.deleteBranch(repoPath!, branchName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches", repoPath] });
    },
  });
}
