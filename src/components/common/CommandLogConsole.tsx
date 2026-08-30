import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock3,
  Loader2,
  TerminalSquare,
  Trash2,
  XCircle,
} from "lucide-react";
import { gitApi } from "../../lib/tauri-api";
import { cn } from "../../lib/cn";
import { isTerminalStatus, useJobStore, type GitJobLogEntry } from "../../stores/job-store";
import type { GitJobStatus } from "../../types/git";
import { Button, Select } from "../ui";

const HEIGHT_STORAGE_KEY = "giteye.command-log.height";
const MIN_HEIGHT = 180;
const DEFAULT_HEIGHT_RATIO = 0.45;
const CLOSE_ANIMATION_MS = 180;

function maxHeight() {
  return Math.max(MIN_HEIGHT, Math.round(window.innerHeight * 0.9));
}

function readStoredHeight() {
  const stored = Number(window.localStorage.getItem(HEIGHT_STORAGE_KEY));
  if (!Number.isFinite(stored) || stored <= 0) {
    return Math.round(window.innerHeight * DEFAULT_HEIGHT_RATIO);
  }
  return Math.min(Math.max(stored, MIN_HEIGHT), maxHeight());
}

/**
 * Quake-style drop-down console for GitEye background jobs. It slides out of
 * the top edge over the whole window, toggles with the backquote key, and
 * keeps its dragged height across sessions. There is no floating launcher —
 * the status bar owns discoverability.
 */
export function CommandLogConsole() {
  const jobsById = useJobStore((state) => state.jobsById);
  const jobOrder = useJobStore((state) => state.jobOrder);
  const open = useJobStore((state) => state.commandLogOpen);
  const selectedJobId = useJobStore((state) => state.selectedJobId);
  const repoFilter = useJobStore((state) => state.repoFilter);
  const setOpen = useJobStore((state) => state.setCommandLogOpen);
  const toggleOpen = useJobStore((state) => state.toggleCommandLog);
  const selectJob = useJobStore((state) => state.selectJob);
  const setRepoFilter = useJobStore((state) => state.setRepoFilter);
  const clearJobOutput = useJobStore((state) => state.clearJobOutput);
  const hydrateJobs = useJobStore((state) => state.hydrateJobs);

  const [height, setHeight] = useState(readStoredHeight);
  const [mounted, setMounted] = useState(open);
  const dragOrigin = useRef<{ y: number; height: number } | null>(null);

  const jobs = useMemo(() => jobOrder.map((jobId) => jobsById[jobId]).filter(Boolean), [jobOrder, jobsById]);
  const repos = useMemo(() => Array.from(new Set(jobs.map((job) => job.repoPath))), [jobs]);
  const filteredJobs = useMemo(
    () => jobs.filter((job) => !repoFilter || job.repoPath === repoFilter),
    [jobs, repoFilter],
  );
  const selectedJob = (selectedJobId ? jobsById[selectedJobId] : null) ?? filteredJobs[0] ?? null;
  const runningCount = jobs.filter((job) => !isTerminalStatus(job.status)).length;

  // Keep the panel mounted through the slide-out so the exit animation runs.
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), CLOSE_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || !selectedJob?.jobId) return;
    void gitApi
      .getGitJob(selectedJob.jobId)
      .then((job) => {
        if (job) hydrateJobs([job]);
      })
      .catch(() => undefined);
  }, [hydrateJobs, open, selectedJob?.jobId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        return;
      }
      // Bare backquote is the Quake binding; Ctrl/Cmd+` belongs to the trace panel.
      if (event.code !== "Backquote" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      toggleOpen();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen, toggleOpen]);

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragOrigin.current = { y: event.clientY, height };
      const onMove = (moveEvent: PointerEvent) => {
        const origin = dragOrigin.current;
        if (!origin) return;
        const next = Math.min(
          Math.max(origin.height + (moveEvent.clientY - origin.y), MIN_HEIGHT),
          maxHeight(),
        );
        setHeight(next);
      };
      const onUp = () => {
        dragOrigin.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setHeight((current) => {
          window.localStorage.setItem(HEIGHT_STORAGE_KEY, String(current));
          return current;
        });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [height],
  );

  if (!mounted && !open) return null;

  return (
    <section
      className="giteye-quake-console fixed inset-x-0 top-0 z-[95] flex flex-col border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-elevated)]"
      data-state={open ? "open" : "closed"}
      style={{ height }}
      aria-hidden={!open}
      aria-label="Command log console"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2 py-1">
        <TerminalSquare className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
        <span className="text-[12px] font-semibold text-[var(--color-text-primary)]">Command log</span>
        <span className="giteye-chip tabular-nums" data-tone={runningCount > 0 ? "accent" : undefined}>
          {runningCount > 0 ? `${runningCount} running` : `${jobs.length} jobs`}
        </span>

        <Select
          size="sm"
          className="max-w-[220px]"
          ariaLabel="Filter command log by repository"
          value={repoFilter ?? ""}
          onValueChange={(value) => setRepoFilter(value || null)}
          placeholder="All repositories"
          options={[{ value: "", label: "All repositories" }, ...repos.map((repoPath) => ({ value: repoPath, label: repoName(repoPath) }))]}
        />

        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={<Trash2 className="h-3.5 w-3.5" />}
          onClick={() => {
            clearJobOutput(repoFilter);
            void gitApi.clearGitJobLog(repoFilter).catch(() => undefined);
          }}
          disabled={filteredJobs.length === 0}
          title={repoFilter ? "Clear filtered command output" : "Clear command output"}
        >
          Clear command output
        </Button>

        <span className="ml-auto hidden items-center gap-1 text-[10.5px] text-[var(--color-text-muted)] md:flex">
          <kbd className="giteye-kbd">`</kbd>
          toggle
          <kbd className="giteye-kbd ml-1">Esc</kbd>
          close
        </span>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={<ChevronDown className="h-3.5 w-3.5 rotate-180" />}
          onClick={() => setOpen(false)}
          title="Close command log"
        >
          Close command log
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[260px] shrink-0 flex-col border-r border-[var(--color-border-muted)]">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredJobs.length === 0 ? (
              <div className="px-3 py-6 text-center text-[11px] text-[var(--color-text-muted)]">
                Background Git commands appear here when they run.
              </div>
            ) : (
              filteredJobs.map((job) => (
                <button
                  type="button"
                  key={job.jobId}
                  onClick={() => selectJob(job.jobId)}
                  title={`${job.title} · ${repoName(job.repoPath)} · ${statusLabel(job.status)}`}
                  className={cn(
                    "flex w-full items-center gap-2 border-b border-[var(--color-border-muted)]/60 px-2 py-1 text-left transition-colors hover:bg-[var(--color-bg-hover)]",
                    selectedJob?.jobId === job.jobId && "giteye-selected-row",
                  )}
                >
                  <JobStatusIcon status={job.status} />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-[var(--color-text-primary)]">
                    {job.title}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-[var(--color-text-muted)]">
                    {timeLabel(job.createdAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {selectedJob ? <JobDetails job={selectedJob} /> : <EmptyJobDetails />}
        </main>
      </div>

      <div
        onPointerDown={startResize}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize command log"
        className="h-1 shrink-0 cursor-row-resize bg-[var(--color-border-muted)] transition-colors hover:bg-[var(--color-accent)]"
      />
    </section>
  );
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function JobDetails({ job }: { job: GitJobLogEntry }) {
  const canCancel = !isTerminalStatus(job.status);

  return (
    <>
      <header className="shrink-0 border-b border-[var(--color-border-muted)] px-3 py-1.5">
        <div className="flex items-center gap-2">
          <JobStatusIcon status={job.status} />
          <h3 className="truncate text-[12px] font-semibold text-[var(--color-text-primary)]">{job.title}</h3>
          <span
            className={cn(
              "shrink-0 rounded-full border px-1.5 text-[9.5px] uppercase tracking-[0.1em]",
              statusPillClass(job.status),
            )}
          >
            {statusLabel(job.status)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[10.5px] text-[var(--color-text-muted)]" title={job.repoPath}>
            {repoName(job.repoPath)}
          </span>
          {canCancel && (
            <Button
              variant="danger"
              size="sm"
              className="shrink-0"
              onClick={() => void gitApi.cancelGitJob(job.jobId)}
            >
              Cancel
            </Button>
          )}
        </div>

        <dl className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-[var(--color-text-muted)]">
          <MetadataItem label="cmd" value={commandLabel(job)} />
          <MetadataItem label="kind" value={job.kind} />
          <MetadataItem
            label="took"
            value={durationLabel(job.startedAt ?? job.createdAt, job.finishedAt ?? Date.now())}
          />
          <MetadataItem label="job" value={job.jobId} />
          {job.invalidationReasons.length > 0 ? (
            <MetadataItem label="invalidates" value={job.invalidationReasons.join(", ")} />
          ) : null}
          {job.exitCode !== null || job.error ? (
            <span className={job.error ? "text-[var(--color-danger)]" : "text-[var(--color-text-secondary)]"}>
              {job.error ?? `exit ${job.exitCode}`}
            </span>
          ) : null}
        </dl>
      </header>

      <div className="min-h-0 flex-1 overflow-auto bg-[var(--color-bg-console)] px-3 py-1.5 font-mono text-[11px] leading-[1.45] text-[var(--color-text-primary)]">
        {job.lines.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-[11px] text-[var(--color-text-subtle)]">
            No stdout or stderr has been emitted for this job yet.
          </div>
        ) : (
          <ol>
            {job.lines.map((line) => (
              <li key={line.id} className="grid grid-cols-[3.2rem_1fr] gap-2">
                <span className={line.channel === "stderr" ? "text-[var(--color-danger)]" : "text-sky-300"}>{line.channel}</span>
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
    <div className="flex h-full items-center justify-center p-6 text-center text-[11px] text-[var(--color-text-muted)]">
      Select a command to inspect its metadata, stdout, stderr, and final result.
    </div>
  );
}

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-w-0 max-w-[420px] items-baseline gap-1" title={`${label}: ${value}`}>
      <dt className="shrink-0 uppercase tracking-[0.1em] text-[var(--color-text-subtle)]">{label}</dt>
      <dd className="min-w-0 truncate font-mono text-[var(--color-text-secondary)]">{value}</dd>
    </span>
  );
}

function JobStatusIcon({ status }: { status: GitJobStatus }) {
  const className = cn("h-3.5 w-3.5 shrink-0", statusIconClass(status));

  if (status === "queued") return <Clock3 className={className} />;
  if (status === "running") return <Loader2 className={cn(className, "animate-spin")} />;
  if (status === "interrupted") return <AlertTriangle className={className} />;
  if (status === "succeeded") return <CheckCircle2 className={className} />;
  if (status === "failed") return <XCircle className={className} />;
  if (status === "canceled" || status === "cancelled") return <Ban className={className} />;
  return <CircleDashed className={className} />;
}

function statusIconClass(status: GitJobStatus) {
  if (status === "succeeded") return "text-[var(--color-success)]";
  if (status === "failed") return "text-[var(--color-danger)]";
  if (status === "interrupted") return "text-amber-400";
  if (status === "canceled" || status === "cancelled") return "text-[var(--color-text-muted)]";
  return "text-[var(--color-accent)]";
}

function statusPillClass(status: GitJobStatus) {
  if (status === "succeeded") return "border-[var(--color-success)]/35 bg-[var(--color-success)]/10 text-[var(--color-success)]";
  if (status === "failed") return "border-[var(--color-danger)]/35 bg-[var(--color-danger)]/10 text-[var(--color-danger)]";
  if (status === "interrupted") return "border-amber-500/35 bg-amber-500/10 text-amber-300";
  if (status === "canceled" || status === "cancelled")
    return "border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]";
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
