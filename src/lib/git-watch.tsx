import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "../stores/app-store";
import { useJobStore } from "../stores/job-store";
import { useNoticeStore, type NoticeStatus } from "../stores/notice-store";
import type { GitJobEvent, GitJobStatus } from "../types/git";
import { invalidateGitStateByReason } from "./git-data";
import { GIT_JOB_EVENT_NAME, gitApi } from "./tauri-api";

interface GitStateChangedPayload {
  repoPath: string;
  reason: string;
}

type AppStoreWithOpenRepos = {
  activeRepoPath: string | null;
  openRepoPaths?: string[];
};

const jobNoticeIds = new Map<string, string>();

export function GitStateWatcher() {
  const watchedRepoPaths = useAppStore((state) =>
    normalizeWatchedRepoPaths(state as AppStoreWithOpenRepos),
  );
  const watchedRepoKey = watchedRepoPaths.join("\0");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (watchedRepoPaths.length === 0) return;

    let disposed = false;
    let unlisten: (() => void) | undefined;
    const watchedRepos = new Set(watchedRepoPaths);

    for (const repoPath of watchedRepoPaths) {
      void gitApi.startRepositoryWatch(repoPath);
    }

    void listen<GitStateChangedPayload>("git-state-changed", (event) => {
      if (!watchedRepos.has(event.payload.repoPath)) return;
      void invalidateGitStateByReason(queryClient, event.payload.repoPath, event.payload.reason);
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
      for (const repoPath of watchedRepoPaths) {
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

  useEffect(() => {
    void gitApi.listGitJobs().then(hydrateJobs).catch(() => undefined);

    let disposed = false;
    let unlisten: (() => void) | undefined;

    void listen<GitJobEvent>(GIT_JOB_EVENT_NAME, (event) => {
      const payload = event.payload;
      ingestEvent(payload);
      updateJobNotice(payload, startNotice, updateNotice, finishNotice);

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
  }, [finishNotice, hydrateJobs, ingestEvent, startNotice, updateNotice]);

  return null;
}

function normalizeWatchedRepoPaths(state: AppStoreWithOpenRepos) {
  const paths = state.openRepoPaths && state.openRepoPaths.length > 0
    ? state.openRepoPaths
    : state.activeRepoPath
      ? [state.activeRepoPath]
      : [];
  return Array.from(new Set(paths.filter(Boolean))).sort();
}

function updateJobNotice(
  event: GitJobEvent,
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
      action: { label: "Open command log", target: "command-log", jobId: event.jobId },
    });
    jobNoticeIds.set(event.jobId, noticeId);
  }

  if (isTerminalJobStatus(event.status)) {
    finishNotice(
      noticeId,
      noticeStatusForJob(event.status),
      jobNoticeDetail(event),
      event.error ? "Open the command log for stdout, stderr, command arguments, and the final error." : null,
    );
    return;
  }

  updateNotice(noticeId, {
    title: event.title,
    detail: jobNoticeDetail(event),
    status: "pending",
    repoPath: event.repoPath,
    action: { label: "Open command log", target: "command-log", jobId: event.jobId },
  });
}

function jobNoticeDetail(event: GitJobEvent) {
  if (event.status === "queued") {
    return "Queued; waiting for the repository job runner.";
  }

  if (event.status === "running") {
    return event.stream ? `Streaming ${event.stream.channel}: ${event.stream.line}` : "Running; output is streaming to the command log.";
  }

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

function noticeStatusForJob(status: GitJobStatus): Extract<NoticeStatus, "success" | "error" | "info"> {
  if (status === "succeeded") return "success";
  if (status === "failed") return "error";
  return "info";
}

function isTerminalJobStatus(status: GitJobStatus) {
  return status === "succeeded" || status === "failed" || status === "canceled" || status === "cancelled";
}
