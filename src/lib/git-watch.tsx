import { useEffect, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAppStore } from "../stores/app-store";
import { isTerminalStatus, useJobStore } from "../stores/job-store";
import { useNoticeStore, type NoticeStatus } from "../stores/notice-store";
import type {
  GitJobEvent,
  GitJobStatus,
  RepositorySnapshot,
} from "../types/git";
import { gitKeys, invalidateGitStateByReason } from "./git-data";
import { GIT_JOB_EVENT_NAME, gitApi } from "./tauri-api";

interface GitStateChangedPayload {
  repoPath: string;
  reason: string;
}

type AppStoreWithOpenRepos = {
  activeRepoPath: string | null;
  openRepoPaths?: string[];
};

export function GitStateWatcher() {
  const activeRepoPath = useAppStore((state) => state.activeRepoPath);
  const openRepoPaths = useAppStore((state) => state.openRepoPaths);
  const watchedRepoPaths = useMemo(
    () => normalizeWatchedRepoPaths({ activeRepoPath, openRepoPaths }),
    [activeRepoPath, openRepoPaths],
  );
  const watchedRepoKey = watchedRepoPaths.join("\0");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (watchedRepoPaths.length === 0) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;
    const watchedRepos = new Set(watchedRepoPaths);
    const startedRepos = new Set<string>();

    void listen<GitStateChangedPayload>("git-state-changed", (event) => {
      if (!watchedRepos.has(event.payload.repoPath)) return;
      void invalidateGitStateByReason(
        queryClient,
        event.payload.repoPath,
        event.payload.reason,
      );
      invalidateSubmoduleParent(queryClient, event.payload.repoPath);
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlisten = cleanup;
        for (const repoPath of watchedRepoPaths) {
          startedRepos.add(repoPath);
          void gitApi.startRepositoryWatch(repoPath);
        }
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
      for (const repoPath of startedRepos) {
        void gitApi.stopRepositoryWatch(repoPath);
      }
    };
  }, [queryClient, watchedRepoKey]);

  return null;
}

export function GitJobEventListener() {
  const ingestEvent = useJobStore((state) => state.ingestEvent);
  const hydrateJobs = useJobStore((state) => state.hydrateJobs);
  const startNotice = useNoticeStore((state) => state.startNotice);
  const updateNotice = useNoticeStore((state) => state.updateNotice);
  const finishNotice = useNoticeStore((state) => state.finishNotice);
  const queryClient = useQueryClient();

  useEffect(() => {
    void gitApi
      .listGitJobs()
      .then(hydrateJobs)
      .catch(() => undefined);

    const jobNoticeIds = new Map<string, string>();
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen<GitJobEvent>(GIT_JOB_EVENT_NAME, (event) => {
      const payload = event.payload;
      ingestEvent(payload);
      updateJobNotice(
        payload,
        jobNoticeIds,
        startNotice,
        updateNotice,
        finishNotice,
      );
      refreshRepositoryListsForCompletedClone(queryClient, payload);
      refreshLfsDataForCompletedJob(queryClient, payload);
      if (isTerminalStatus(payload.status)) {
        void invalidateGitStateByReason(
          queryClient,
          payload.repoPath,
          "worktree",
        );
        invalidateSubmoduleParent(queryClient, payload.repoPath);
      }
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlisten = cleanup;
      }
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [
    finishNotice,
    hydrateJobs,
    ingestEvent,
    queryClient,
    startNotice,
    updateNotice,
  ]);

  return null;
}

function invalidateSubmoduleParent(queryClient: QueryClient, repoPath: string) {
  const snapshot = queryClient.getQueryData<RepositorySnapshot>(
    gitKeys.repositorySnapshot(repoPath),
  );
  const parent = snapshot?.repositoryInfo.submoduleParent;
  if (parent?.relationshipKind === "submodule") {
    void invalidateGitStateByReason(queryClient, parent.path, "worktree");
  }
}

function refreshRepositoryListsForCompletedClone(
  queryClient: QueryClient,
  event: GitJobEvent,
) {
  if (event.kind !== "clone" || event.status !== "succeeded") return;

  void Promise.all([
    queryClient.invalidateQueries({ queryKey: gitKeys.recentRepositories() }),
    queryClient.invalidateQueries({ queryKey: gitKeys.favoriteRepositories() }),
  ]);
}

function refreshLfsDataForCompletedJob(
  queryClient: QueryClient,
  event: GitJobEvent,
) {
  if (!event.kind.startsWith("lfs.") || !isTerminalStatus(event.status)) return;
  void Promise.all([
    queryClient.invalidateQueries({
      queryKey: gitKeys.lfsStatus(event.repoPath),
    }),
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey;
        return (
          key[0] === "git" &&
          key[1] === "repository" &&
          key[2] === event.repoPath &&
          key[3] === "lfs-locks"
        );
      },
    }),
  ]);
}

function normalizeWatchedRepoPaths(state: AppStoreWithOpenRepos) {
  const paths =
    state.openRepoPaths && state.openRepoPaths.length > 0
      ? state.openRepoPaths
      : state.activeRepoPath
        ? [state.activeRepoPath]
        : [];
  return Array.from(new Set(paths.filter(Boolean))).sort();
}

function updateJobNotice(
  event: GitJobEvent,
  jobNoticeIds: Map<string, string>,
  startNotice: ReturnType<typeof useNoticeStore.getState>["startNotice"],
  updateNotice: ReturnType<typeof useNoticeStore.getState>["updateNotice"],
  finishNotice: ReturnType<typeof useNoticeStore.getState>["finishNotice"],
) {
  let noticeId = jobNoticeIds.get(event.jobId);
  if (!noticeId) {
    noticeId = startNotice({
      title: event.title,
      detail: jobNoticeDetail(event),
      status: "pending",
      category: "git",
      repoPath: event.repoPath,
      action: {
        label: "Open command log",
        target: "command-log",
        jobId: event.jobId,
      },
    });
    jobNoticeIds.set(event.jobId, noticeId);
  }

  if (isTerminalStatus(event.status)) {
    finishNotice(
      noticeId,
      noticeStatusForJob(event.status),
      jobNoticeDetail(event),
      event.error
        ? "Open the command log for stdout, stderr, command arguments, and the final error."
        : null,
    );
    jobNoticeIds.delete(event.jobId);
    return;
  }

  updateNotice(noticeId, {
    title: event.title,
    detail: jobNoticeDetail(event),
    status: "pending",
    repoPath: event.repoPath,
    action: {
      label: "Open command log",
      target: "command-log",
      jobId: event.jobId,
    },
  });
}

function jobNoticeDetail(event: GitJobEvent) {
  if (event.status === "queued") {
    return "Queued; waiting for the repository job runner.";
  }

  if (event.status === "running") {
    return event.stream
      ? `Streaming ${event.stream.channel}: ${event.stream.line}`
      : "Running; output is streaming to the command log.";
  }

  if (event.status === "attentionRequired") {
    return "Paused for conflicts. Open the workspace resolver to review and continue.";
  }
  if (event.status === "interrupted")
    return "Interrupted; inspect repository state before resuming.";

  if (event.status === "succeeded") {
    return event.exitCode === null || event.exitCode === undefined
      ? "Finished successfully."
      : `Finished successfully with exit code ${event.exitCode}.`;
  }

  if (event.status === "failed") {
    return event.error ?? "Failed; open the command log for details.";
  }

  return "Canceled; open the command log for details.";
}

function noticeStatusForJob(
  status: GitJobStatus,
): Extract<NoticeStatus, "success" | "error" | "info"> {
  if (status === "succeeded") return "success";
  if (status === "failed") return "error";
  return "info";
}
