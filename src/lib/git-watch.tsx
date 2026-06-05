import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "../stores/app-store";
import { invalidateGitStateByReason } from "./git-data";
import { gitApi } from "./tauri-api";

interface GitStateChangedPayload {
  repoPath: string;
  reason: string;
}

export function GitStateWatcher() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!activeRepoPath) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void gitApi.startRepositoryWatch(activeRepoPath);

    const fallbackInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void invalidateGitStateByReason(queryClient, activeRepoPath, "worktree");
      }
    }, 2_500);

    void listen<GitStateChangedPayload>("git-state-changed", (event) => {
      if (event.payload.repoPath !== activeRepoPath) return;
      void invalidateGitStateByReason(queryClient, activeRepoPath, event.payload.reason);
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlisten = cleanup;
      }
    });

    return () => {
      disposed = true;
      window.clearInterval(fallbackInterval);
      unlisten?.();
      void gitApi.stopRepositoryWatch(activeRepoPath);
    };
  }, [activeRepoPath, queryClient]);

  return null;
}
