import { useQuery } from "@tanstack/react-query";
import { gitApi } from "../lib/tauri-api";

export function useCommitHistory(repoPath: string | null, limit?: number) {
  return useQuery({
    queryKey: ["commits", repoPath, limit],
    queryFn: () => gitApi.getCommitHistory(repoPath!, limit),
    enabled: !!repoPath,
  });
}

export function useCommitDetails(repoPath: string | null, commitHash: string | null) {
  return useQuery({
    queryKey: ["commitDetails", repoPath, commitHash],
    queryFn: () => gitApi.getCommitDetails(repoPath!, commitHash!),
    enabled: !!repoPath && !!commitHash,
  });
}

export function useFileDiff(repoPath: string | null, filePath: string | null, staged: boolean) {
  return useQuery({
    queryKey: ["fileDiff", repoPath, filePath, staged],
    queryFn: () => gitApi.getFileDiff(repoPath!, filePath!, staged),
    enabled: !!repoPath && !!filePath,
  });
}
