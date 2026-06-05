import { useQuery } from "@tanstack/react-query";
import { gitQueries } from "../lib/git-data";

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
