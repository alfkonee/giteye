import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw, XCircle } from "lucide-react";
import { useAppStore } from "../../stores/app-store";
import { useJobStore } from "../../stores/job-store";
import { gitApi } from "../../lib/tauri-api";

export function InterruptedJobRecovery() {
  const activeRepoPath = useAppStore((state) => state.activeRepoPath);
  const openCommandLog = useJobStore((state) => state.setCommandLogOpen);
  const selectJob = useJobStore((state) => state.selectJob);
  const queryClient = useQueryClient();
  const jobsQuery = useQuery({
    queryKey: ["interrupted-git-jobs", activeRepoPath ?? "all"],
    queryFn: () => gitApi.listGitJobs(activeRepoPath),
    refetchInterval: 5_000,
  });
  const interruptedJobs = (jobsQuery.data ?? []).filter((job) => job.status === "interrupted");
  const job = interruptedJobs[0];
  const recoveryRepoPath = activeRepoPath ?? job?.repoPath ?? null;
  const [abortArmed, setAbortArmed] = useState(false);
  const recoveryQuery = useQuery({
    queryKey: ["git-recovery-state", recoveryRepoPath],
    queryFn: () => gitApi.getGitRecoveryState(recoveryRepoPath!),
    enabled: Boolean(recoveryRepoPath),
  });
  const recoverMutation = useMutation({
    mutationFn: (action: "continue" | "abort") => gitApi.recoverGitOperation(recoveryRepoPath!, action),
    onSuccess: async () => {
      if (job) {
        await gitApi.dismissInterruptedGitJob(job.jobId);
      }
      void queryClient.invalidateQueries({ queryKey: ["interrupted-git-jobs", activeRepoPath ?? "all"] });
      void queryClient.invalidateQueries({ queryKey: ["git-recovery-state", recoveryRepoPath] });
    },
  });
  const dismissMutation = useMutation({
    mutationFn: () => gitApi.dismissInterruptedGitJob(job!.jobId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["interrupted-git-jobs", activeRepoPath ?? "all"] });
    },
  });

  if (!job) return null;

  const recovery = recoveryQuery.data;
  const canRecover = Boolean(recovery?.operation) && (recovery?.lockPaths.length ?? 0) === 0 && !recoverMutation.isPending;

  return (
    <aside className="fixed bottom-4 left-1/2 z-[85] w-[min(680px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-amber-500/50 bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-elevated)]" aria-live="assertive">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Git operation interrupted</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            {interruptedJobs.length === 1 ? job.title : `${interruptedJobs.length} Git jobs`} did not finish before GitEye closed.
            Inspect the repository before continuing or aborting.
          </p>
          {recovery?.lockPaths.length ? (
            <p className="mt-2 text-sm text-amber-300">
              Git index lock detected: {recovery.lockPaths.join(", ")}. Close the process that owns it before recovering.
            </p>
          ) : recovery?.operation ? (
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              Git reports a {recovery.operation} in progress.
            </p>
          ) : (
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              No resumable Git operation is currently present; inspect the captured command output.
            </p>
          )}
          {recoverMutation.error ? (
            <p className="mt-2 text-sm text-red-400">{String(recoverMutation.error)}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-tertiary)]"
              onClick={() => {
                selectJob(job.jobId);
                openCommandLog(true, job.jobId);
              }}
            >
              Inspect job
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canRecover}
              onClick={() => recoverMutation.mutate("continue")}
            >
              <RotateCcw className="size-3.5" aria-hidden="true" /> Continue
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-red-500/60 px-3 py-1.5 text-sm text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canRecover}
              onClick={() => {
                if (!abortArmed) {
                  setAbortArmed(true);
                  return;
                }
                recoverMutation.mutate("abort");
              }}
            >
              <XCircle className="size-3.5" aria-hidden="true" /> {abortArmed ? "Confirm abort" : "Abort operation"}
            </button>
            <button
              type="button"
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={dismissMutation.isPending}
              onClick={() => dismissMutation.mutate()}
            >
              Dismiss after inspection
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
