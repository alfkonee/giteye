import { create } from "zustand";
import type { GitJobEvent, GitJobLogChannel, GitJobRecord, GitJobStatus, GitJobStreamLine } from "../types/git";

export interface GitJobLogLine {
  id: string;
  jobId: string;
  channel: GitJobLogChannel;
  line: string;
  receivedAt: number;
}

export interface GitJobLogEntry {
  jobId: string;
  repoPath: string;
  kind: string;
  title: string;
  status: GitJobStatus;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  command: string | null;
  args: string[];
  exitCode: number | null;
  error: string | null;
  invalidationReasons: string[];
  lines: GitJobLogLine[];
  updatedAt: number;
}

interface JobStore {
  jobsById: Record<string, GitJobLogEntry>;
  jobOrder: string[];
  commandLogOpen: boolean;
  selectedJobId: string | null;
  repoFilter: string | null;
  ingestEvent: (event: GitJobEvent) => void;
  hydrateJobs: (jobs: GitJobRecord[]) => void;
  setCommandLogOpen: (open: boolean, jobId?: string | null) => void;
  selectJob: (jobId: string | null) => void;
  setRepoFilter: (repoPath: string | null) => void;
  clearJobOutput: (repoPath?: string | null) => void;
}

export const useJobStore = create<JobStore>((set) => ({
  jobsById: {},
  jobOrder: [],
  commandLogOpen: false,
  selectedJobId: null,
  repoFilter: null,

  ingestEvent: (event) => {
    set((state) => upsertJobEvent(state, event));
  },

  hydrateJobs: (jobs) => {
    set((state) => {
      let nextState: Pick<JobStore, "jobsById" | "jobOrder" | "selectedJobId"> = state;
      for (const job of jobs) {
        nextState = upsertJobEvent(nextState, job, job.logs ?? job.output ?? []);
      }
      return nextState;
    });
  },

  setCommandLogOpen: (open, jobId = null) => {
    set((state) => ({
      commandLogOpen: open,
      selectedJobId: jobId ?? state.selectedJobId,
    }));
  },

  selectJob: (jobId) => {
    set({ selectedJobId: jobId });
  },

  setRepoFilter: (repoPath) => {
    set({ repoFilter: repoPath });
  },

  clearJobOutput: (repoPath = null) => {
    set((state) => ({
      jobsById: Object.fromEntries(
        Object.entries(state.jobsById).map(([jobId, job]) => [
          jobId,
          repoPath && job.repoPath !== repoPath ? job : { ...job, lines: [] },
        ]),
      ),
    }));
  },
}));

function upsertJobEvent(
  state: Pick<JobStore, "jobsById" | "jobOrder" | "selectedJobId">,
  event: GitJobEvent,
  output: GitJobStreamLine[] = [],
) {
  const now = Date.now();
  const existing = state.jobsById[event.jobId];
  const createdAt = parseEventTime(event.createdAt) ?? existing?.createdAt ?? now;
  const startedAt = parseEventTime(event.startedAt) ?? existing?.startedAt ?? null;
  const finishedAt = parseEventTime(event.finishedAt) ?? existing?.finishedAt ?? finishedAtFromStatus(event.status, now);
  const eventLines = [
    ...output.map((stream) => toLogLine(event.jobId, stream, now)),
    ...(event.stream ? [toLogLine(event.jobId, event.stream, now)] : []),
  ];
  const job: GitJobLogEntry = {
    jobId: event.jobId,
    repoPath: event.repoPath,
    kind: event.kind,
    title: event.title,
    status: canonicalStatus(event.status),
    createdAt,
    startedAt,
    finishedAt,
    command: event.command ?? existing?.command ?? null,
    args: event.args ?? existing?.args ?? [],
    exitCode: event.exitCode ?? existing?.exitCode ?? null,
    error: event.error ?? existing?.error ?? null,
    invalidationReasons: event.invalidationReasons ?? existing?.invalidationReasons ?? [],
    lines: [...(existing?.lines ?? []), ...eventLines],
    updatedAt: now,
  };

  const jobOrder = state.jobOrder.includes(event.jobId)
    ? state.jobOrder
    : [event.jobId, ...state.jobOrder];

  return {
    jobsById: {
      ...state.jobsById,
      [event.jobId]: job,
    },
    jobOrder,
    selectedJobId: state.selectedJobId ?? event.jobId,
  };
}

function toLogLine(jobId: string, stream: GitJobStreamLine, receivedAt: number): GitJobLogLine {
  return {
    id: `${jobId}-${receivedAt}-${Math.random().toString(36).slice(2)}`,
    jobId,
    channel: stream.channel,
    line: stream.line,
    receivedAt,
  };
}

function parseEventTime(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function finishedAtFromStatus(status: GitJobStatus, now: number) {
  return isTerminalStatus(status) ? now : null;
}

function canonicalStatus(status: GitJobStatus): GitJobStatus {
  return status === "cancelled" ? "canceled" : status;
}

export function isTerminalStatus(status: GitJobStatus) {
  return status === "succeeded" || status === "failed" || status === "canceled" || status === "cancelled";
}
