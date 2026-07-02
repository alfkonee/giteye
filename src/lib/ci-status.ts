import type { CheckRunSummary } from "../types/git";

export type CheckBucket = "pass" | "fail" | "pending" | "skipping" | "cancel" | "unknown";

export interface NormalizedCheckRun extends CheckRunSummary {
  bucket: CheckBucket;
  bucketLabel: string;
  durationMs: number | null;
  workflowName: string;
  isBlocking: boolean;
  isComplete: boolean;
}

export interface CheckSummary {
  total: number;
  passing: number;
  failing: number;
  pending: number;
  skipped: number;
  cancelled: number;
  unknown: number;
  blocking: number;
  conclusion: "empty" | "passing" | "failing" | "pending" | "unknown";
  label: string;
}

export interface CheckWorkflowGroup {
  workflow: string;
  checks: NormalizedCheckRun[];
  summary: CheckSummary;
}

const BUCKET_LABELS: Record<CheckBucket, string> = {
  pass: "Passing",
  fail: "Failing",
  pending: "Pending",
  skipping: "Skipped",
  cancel: "Cancelled",
  unknown: "Unknown",
};

const BUCKET_ORDER: Record<CheckBucket, number> = {
  fail: 0,
  cancel: 1,
  pending: 2,
  unknown: 3,
  skipping: 4,
  pass: 5,
};

function normalizeToken(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function normalizeCheckBucket(check: CheckRunSummary): CheckBucket {
  const rawBucket = normalizeToken(check.bucket ?? check.conclusion ?? check.state);

  if (["pass", "passed", "success", "successful", "completed"].includes(rawBucket)) {
    return "pass";
  }
  if (["fail", "failed", "failure", "error", "timed_out", "action_required", "startup_failure"].includes(rawBucket)) {
    return "fail";
  }
  if (["pending", "queued", "in_progress", "waiting", "requested", "expected"].includes(rawBucket)) {
    return "pending";
  }
  if (["skipping", "skipped", "neutral", "stale"].includes(rawBucket)) {
    return "skipping";
  }
  if (["cancel", "cancelled", "canceled"].includes(rawBucket)) {
    return "cancel";
  }

  return "unknown";
}

export function normalizeCheckRun(check: CheckRunSummary): NormalizedCheckRun {
  const bucket = normalizeCheckBucket(check);
  const startedAt = Date.parse(check.startedAt ?? "");
  const completedAt = Date.parse(check.completedAt ?? "");
  const durationMs = Number.isFinite(startedAt) && Number.isFinite(completedAt)
    ? Math.max(0, completedAt - startedAt)
    : null;

  return {
    ...check,
    name: check.name || "Unnamed check",
    bucket,
    bucketLabel: BUCKET_LABELS[bucket],
    durationMs,
    workflowName: check.workflow?.trim() || "Checks",
    isBlocking: bucket === "fail" || bucket === "cancel" || bucket === "pending" || bucket === "unknown",
    isComplete: bucket === "pass" || bucket === "fail" || bucket === "cancel" || bucket === "skipping",
  };
}

export function summarizeChecks(checks: CheckRunSummary[]): CheckSummary {
  const rows = checks.map(normalizeCheckRun);
  const summary = rows.reduce(
    (acc, check) => {
      acc.total += 1;
      if (check.bucket === "pass") acc.passing += 1;
      else if (check.bucket === "fail") acc.failing += 1;
      else if (check.bucket === "pending") acc.pending += 1;
      else if (check.bucket === "skipping") acc.skipped += 1;
      else if (check.bucket === "cancel") acc.cancelled += 1;
      else acc.unknown += 1;
      if (check.isBlocking) acc.blocking += 1;
      return acc;
    },
    {
      total: 0,
      passing: 0,
      failing: 0,
      pending: 0,
      skipped: 0,
      cancelled: 0,
      unknown: 0,
      blocking: 0,
      conclusion: "empty" as CheckSummary["conclusion"],
      label: "No checks",
    },
  );

  if (summary.total === 0) {
    return summary;
  }
  if (summary.failing > 0 || summary.cancelled > 0) {
    return { ...summary, conclusion: "failing", label: `${summary.failing + summary.cancelled} blocking` };
  }
  if (summary.pending > 0) {
    return { ...summary, conclusion: "pending", label: `${summary.pending} pending` };
  }
  if (summary.unknown > 0) {
    return { ...summary, conclusion: "unknown", label: `${summary.unknown} unknown` };
  }
  return { ...summary, conclusion: "passing", label: `${summary.passing}/${summary.total} passing` };
}

export function groupChecksByWorkflow(checks: CheckRunSummary[]): CheckWorkflowGroup[] {
  const groups = new Map<string, NormalizedCheckRun[]>();
  for (const check of checks.map(normalizeCheckRun)) {
    const workflowChecks = groups.get(check.workflowName);
    if (workflowChecks) {
      workflowChecks.push(check);
    } else {
      groups.set(check.workflowName, [check]);
    }
  }

  return [...groups.entries()]
    .map(([workflow, workflowChecks]) => {
      const sortedChecks = [...workflowChecks].sort(compareChecks);
      return {
        workflow,
        checks: sortedChecks,
        summary: summarizeChecks(sortedChecks),
      };
    })
    .sort((left, right) => compareSummaries(left.summary, right.summary) || left.workflow.localeCompare(right.workflow));
}

export function filterChecks(
  checks: CheckRunSummary[],
  query: string,
  bucket: CheckBucket | "all" = "all",
) {
  const normalizedQuery = query.trim().toLowerCase();
  return checks
    .map(normalizeCheckRun)
    .filter((check) => bucket === "all" || check.bucket === bucket)
    .filter((check) => {
      if (!normalizedQuery) return true;
      return [
        check.name,
        check.workflowName,
        check.description,
        check.event,
        check.state,
        check.conclusion,
        check.bucket,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    })
    .sort(compareChecks);
}

export function formatCheckDuration(durationMs: number | null) {
  if (durationMs === null) return "—";
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function compareChecks(left: NormalizedCheckRun, right: NormalizedCheckRun) {
  return BUCKET_ORDER[left.bucket] - BUCKET_ORDER[right.bucket] || left.name.localeCompare(right.name);
}

function compareSummaries(left: CheckSummary, right: CheckSummary) {
  return summaryRank(left) - summaryRank(right);
}

function summaryRank(summary: CheckSummary) {
  if (summary.failing > 0 || summary.cancelled > 0) return 0;
  if (summary.pending > 0) return 1;
  if (summary.unknown > 0) return 2;
  if (summary.skipped > 0 && summary.passing === 0) return 3;
  return 4;
}
