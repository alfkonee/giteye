import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../lib/git-data";

export function useCommitHistory(repoPath: string | null, limit?: number) {
  return useQuery(gitQueries.commits(repoPath, limit));
}

export function useCommitDetails(repoPath: string | null, commitHash: string | null) {
  return useQuery(gitQueries.commitDetails(repoPath, commitHash));
}

export function useFileDiff(repoPath: string | null, filePath: string | null, staged: boolean) {
  return useQuery(gitQueries.fileDiff(repoPath, filePath, staged));
}

export function useCommitDiff(repoPath: string | null, commitHash: string | null) {
  return useQuery(gitQueries.commitDiff(repoPath, commitHash));
}

export function useReflogEntries(repoPath: string | null, limit?: number, enabled = true) {
  return useQuery(gitQueries.reflog(repoPath, limit, enabled));
}

export function useHistorySurgeryMutations(repoPath: string | null) {
  const queryClient = useQueryClient();

  return {
    cherryPick: useMutation(gitMutations.cherryPickCommit(queryClient, repoPath)),
    revert: useMutation(gitMutations.revertCommit(queryClient, repoPath)),
    previewReset: useMutation(gitMutations.previewResetToCommit(queryClient, repoPath)),
    reset: useMutation(gitMutations.resetToCommit(queryClient, repoPath)),
    amend: useMutation(gitMutations.amendCommit(queryClient, repoPath)),
    checkoutReflogEntry: useMutation(gitMutations.checkoutReflogEntry(queryClient, repoPath)),
    createBranchFromReflogEntry: useMutation(gitMutations.createBranchFromReflogEntry(queryClient, repoPath)),
  };
}
