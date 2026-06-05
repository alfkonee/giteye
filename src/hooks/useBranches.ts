import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../lib/git-data";

export function useBranches(repoPath: string | null) {
  return useQuery(gitQueries.branches(repoPath));
}

export function useCheckoutBranch(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.checkoutBranch(queryClient, repoPath));
}

export function useCreateBranch(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.createBranch(queryClient, repoPath));
}

export function useDeleteBranch(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation(gitMutations.deleteBranch(queryClient, repoPath));
}
