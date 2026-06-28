import { useEffect, useMemo } from "react";
import { Ban, CheckCircle2, CircleDashed, Clock3, Loader2, TerminalSquare, Trash2, XCircle } from "lucide-react";
import { gitApi } from "../../lib/tauri-api";
import { cn } from "../../lib/cn";
import { isTerminalStatus, useJobStore, type GitJobLogEntry } from "../../stores/job-store";
import type { GitJobStatus } from "../../types/git";

export function CommandLogDrawer() {
  const jobsById = useJobStore((state) => state.jobsById);
  const jobOrder = useJobStore((state) => state.jobOrder);
  const open = useJobStore((state) => state.commandLogOpen);
  const selectedJobId = useJobStore((state) => state.selectedJobId);
  const repoFilter = useJobStore((state) => state.repoFilter);
  const setOpen = useJobStore((state) => state.setCommandLogOpen);
  const selectJob = useJobStore((state) => state.selectJob);
  const setRepoFilter = useJobStore((state) => state.setRepoFilter);
  const clearJobOutput = useJobStore((state) => state.clearJobOutput);
  const hydrateJobs = useJobStore((state) => state.hydrateJobs);

  const jobs = useMemo(() => jobOrder.map((jobId) => jobsById[jobId]).filter(Boolean), [jobOrder, jobsById]);
  const repos = useMemo(() => Array.from(new Set(jobs.map((job) => job.repoPath))), [jobs]);
  const filteredJobs = useMemo(
    () => jobs.filter((job) => !repoFilter || job.repoPath === repoFilter),
    [jobs, repoFilter],
  );
  const selectedJob = (selectedJobId ? jobsById[selectedJobId] : null) ?? filteredJobs[0] ?? null;
  const runningCount = jobs.filter((job) => !isTerminalStatus(job.status)).length;

  useEffect(() => {
    if (!open || !selectedJob?.jobId) return;
    void gitApi.getGitJob(selectedJob.jobId).then((job) => {
      if (job) hydrateJobs([job]);
    }).catch(() => undefined);
  }, [hydrateJobs, open, selectedJob?.jobId]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-[70] flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-xs font-semibold text-[var(--color-text-primary)] shadow-[var(--shadow-elevated)] transition-colors hover:border-[var(--color-accent)]/60 hover:bg-[var(--color-bg-hover)]"
        aria-label="Open command log"
      >
        <TerminalSquare className="h-4 w-4 text-[var(--color-accent)]" />
        <span>Command log</span>
        {runningCount > 0 && (
          <span className="rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-1.5 py-0.5 text-[10px] text-[var(--color-accent)]">
            {runningCount} running
          </span>
        )}
      </button>
    );
  }

  return (
    <section className="fixed bottom-4 right-4 top-4 z-[90] flex w-[min(960px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-elevated)]">
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-[var(--color-border-muted)]">
        <header className="border-b border-[var(--color-border-muted)] p-3">
          <div className="flex items-center gap-2">
            <TerminalSquare className="h-4 w-4 text-[var(--color-accent)]" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-[var(--color-text-primary)]">Command log</h2>
              <p className="text-[11px] text-[var(--color-text-muted)]">GitEye-triggered background jobs and streamed output.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              aria-label="Close command log"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <select
              value={repoFilter ?? ""}
              onChange={(event) => setRepoFilter(event.target.value || null)}
              className="min-w-0 flex-1 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
              aria-label="Filter command log by repository"
            >
              <option value="">All repositories</option>
              {repos.map((repoPath) => (
                <option key={repoPath} value={repoPath}>
                  {repoName(repoPath)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                clearJobOutput(repoFilter);
                void gitApi.clearGitJobLog(repoFilter).catch(() => undefined);
              }}
              disabled={filteredJobs.length === 0}
              className="rounded-md border border-[var(--color-border-muted)] px-2 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={repoFilter ? "Clear filtered command output" : "Clear command output"}
              title={repoFilter ? "Clear filtered command output" : "Clear command output"}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filteredJobs.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--color-text-muted)]">
              Background Git commands will appear here when they run.
            </div>
          ) : (
            filteredJobs.map((job) => (
              <button
                type="button"
                key={job.jobId}
                onClick={() => selectJob(job.jobId)}
                className={cn(
                  "w-full border-b border-[var(--color-border-muted)] px-3 py-3 text-left transition-colors hover:bg-[var(--color-bg-hover)]",
                  selectedJob?.jobId === job.jobId && "bg-[var(--color-bg-tertiary)]",
                )}
              >
                <div className="flex items-start gap-2">
                  <JobStatusIcon status={job.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-xs font-semibold text-[var(--color-text-primary)]">{job.title}</span>
                      <span className="shrink-0 rounded-full border border-[var(--color-border-muted)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                        {job.kind}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-[var(--color-text-muted)]">{repoName(job.repoPath)}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                      {statusLabel(job.status)} · {timeLabel(job.createdAt)}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {selectedJob ? <JobDetails job={selectedJob} /> : <EmptyJobDetails />}
      </main>
    </section>
  );
}

function JobDetails({ job }: { job: GitJobLogEntry }) {
  const canCancel = !isTerminalStatus(job.status);

  return (
    <>
      <header className="border-b border-[var(--color-border-muted)] p-4">
        <div className="flex items-start gap-3">
          <JobStatusIcon status={job.status} large />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-[var(--color-text-primary)]">{job.title}</h3>
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]", statusPillClass(job.status))}>
                {statusLabel(job.status)}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">{job.repoPath}</p>
          </div>
          {canCancel && (
            <button
              type="button"
              onClick={() => void gitApi.cancelGitJob(job.jobId)}
              className="rounded-md border border-[var(--color-danger)]/35 px-2 py-1 text-xs text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10"
            >
              Cancel
            </button>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          <MetadataItem label="Job ID" value={job.jobId} />
          <MetadataItem label="Kind" value={job.kind} />
          <MetadataItem label="Started" value={job.startedAt ? timeLabel(job.startedAt) : "not started"} />
          <MetadataItem label="Duration" value={durationLabel(job.startedAt ?? job.createdAt, job.finishedAt ?? Date.now())} />
          <MetadataItem label="Command" value={commandLabel(job)} wide />
          <MetadataItem label="Invalidates" value={job.invalidationReasons.length > 0 ? job.invalidationReasons.join(", ") : "none"} wide />
        </dl>

        {(job.exitCode !== null || job.error) && (
          <div className="mt-3 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs">
            <span className="font-semibold text-[var(--color-text-primary)]">Final result: </span>
            <span className={job.error ? "text-[var(--color-danger)]" : "text-[var(--color-text-secondary)]"}>
              {job.error ?? `exit code ${job.exitCode}`}
            </span>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-[#05070b] p-4 font-mono text-xs leading-5 text-slate-200">
        {job.lines.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-slate-500">
            No stdout or stderr has been emitted for this job yet.
          </div>
        ) : (
          <ol className="space-y-1">
            {job.lines.map((line) => (
              <li key={line.id} className="grid grid-cols-[4.5rem_1fr] gap-3">
                <span className={line.channel === "stderr" ? "text-rose-300" : "text-sky-300"}>{line.channel}</span>
                <span className="whitespace-pre-wrap break-words">{line.line}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

function EmptyJobDetails() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-[var(--color-text-muted)]">
      Select a command to inspect its metadata, stdout, stderr, and final result.
    </div>
  );
}

function MetadataItem({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-2", wide && "col-span-2")}>
      <dt className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-1 truncate text-[var(--color-text-secondary)]" title={value}>{value}</dd>
    </div>
  );
}

function JobStatusIcon({ status, large = false }: { status: GitJobStatus; large?: boolean }) {
  const className = cn(large ? "h-5 w-5" : "h-4 w-4", statusIconClass(status));

  if (status === "queued") {
    return <Clock3 className={className} />;
  }

  if (status === "running") {
    return <Loader2 className={cn(className, "animate-spin")} />;
  }

  if (status === "succeeded") {
    return <CheckCircle2 className={className} />;
  }

  if (status === "failed") {
    return <XCircle className={className} />;
  }

  if (status === "canceled" || status === "cancelled") {
    return <Ban className={className} />;
  }

  return <CircleDashed className={className} />;
}

function statusIconClass(status: GitJobStatus) {
  if (status === "succeeded") return "text-[var(--color-success)]";
  if (status === "failed") return "text-[var(--color-danger)]";
  if (status === "canceled" || status === "cancelled") return "text-[var(--color-text-muted)]";
  return "text-[var(--color-accent)]";
}

function statusPillClass(status: GitJobStatus) {
  if (status === "succeeded") return "border-[var(--color-success)]/35 bg-[var(--color-success)]/10 text-[var(--color-success)]";
  if (status === "failed") return "border-[var(--color-danger)]/35 bg-[var(--color-danger)]/10 text-[var(--color-danger)]";
  if (status === "canceled" || status === "cancelled") return "border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]";
  return "border-[var(--color-accent)]/35 bg-[var(--color-accent)]/10 text-[var(--color-accent)]";
}

function statusLabel(status: GitJobStatus) {
  return status === "cancelled" ? "canceled" : status;
}

function repoName(repoPath: string) {
  return repoPath.split(/[\\/]/).filter(Boolean).pop() ?? repoPath;
}

function timeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function durationLabel(start: number, end: number) {
  const totalSeconds = Math.max(0, Math.round((end - start) / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function commandLabel(job: GitJobLogEntry) {
  return [job.command, ...job.args].filter(Boolean).join(" ") || "not reported";
}
