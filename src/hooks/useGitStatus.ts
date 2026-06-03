import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gitApi } from "../lib/tauri-api";

export function useGitStatus(repoPath: string | null) {
  return useQuery({
    queryKey: ["status", repoPath],
    queryFn: () => gitApi.getStatus(repoPath!),
    enabled: !!repoPath,
  });
}

export function useStagedFiles(repoPath: string | null) {
  return useQuery({
    queryKey: ["stagedFiles", repoPath],
    queryFn: () => gitApi.getStagedFiles(repoPath!),
    enabled: !!repoPath,
  });
}

export function useUnstagedFiles(repoPath: string | null) {
  return useQuery({
    queryKey: ["unstagedFiles", repoPath],
    queryFn: () => gitApi.getUnstagedFiles(repoPath!),
    enabled: !!repoPath,
  });
}

export function useStageFile(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (filePath: string) => gitApi.stageFile(repoPath!, filePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["status", repoPath] });
      queryClient.invalidateQueries({ queryKey: ["stagedFiles", repoPath] });
      queryClient.invalidateQueries({ queryKey: ["unstagedFiles", repoPath] });
    },
  });
}

export function useUnstageFile(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (filePath: string) => gitApi.unstageFile(repoPath!, filePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["status", repoPath] });
      queryClient.invalidateQueries({ queryKey: ["stagedFiles", repoPath] });
      queryClient.invalidateQueries({ queryKey: ["unstagedFiles", repoPath] });
    },
  });
}

export function useStageAll(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => gitApi.stageAll(repoPath!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["status", repoPath] });
      queryClient.invalidateQueries({ queryKey: ["stagedFiles", repoPath] });
      queryClient.invalidateQueries({ queryKey: ["unstagedFiles", repoPath] });
    },
  });
}

export function useUnstageAll(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => gitApi.unstageAll(repoPath!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["status", repoPath] });
      queryClient.invalidateQueries({ queryKey: ["stagedFiles", repoPath] });
      queryClient.invalidateQueries({ queryKey: ["unstagedFiles", repoPath] });
    },
  });
}

export function useCommit(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => gitApi.commit(repoPath!, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["status", repoPath] });
      queryClient.invalidateQueries({ queryKey: ["repoInfo", repoPath] });
      queryClient.invalidateQueries({ queryKey: ["commits", repoPath] });
    },
  });
}
