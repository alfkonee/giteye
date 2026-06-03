import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gitApi } from "../lib/tauri-api";
import { useAppStore } from "../stores/app-store";

export function useRepositoryInfo(repoPath: string | null) {
  return useQuery({
    queryKey: ["repoInfo", repoPath],
    queryFn: () => gitApi.getRepositoryInfo(repoPath!),
    enabled: !!repoPath,
  });
}

export function useOpenRepository() {
  const setActiveRepoPath = useAppStore((s) => s.setActiveRepoPath);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (path: string) => gitApi.openRepository(path),
    onSuccess: (data) => {
      setActiveRepoPath(data.path);
      queryClient.invalidateQueries({ queryKey: ["recentRepos"] });
      queryClient.invalidateQueries({ queryKey: ["repoInfo"] });
    },
  });
}

export function useRecentRepositories() {
  return useQuery({
    queryKey: ["recentRepos"],
    queryFn: () => gitApi.listRecentRepositories(),
  });
}
