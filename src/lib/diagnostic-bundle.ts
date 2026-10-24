// Diagnostic exports are projections, never redacted copies of application state.
// Keep every exported string either a constant or a value from a closed vocabulary.
export interface DiagnosticInput {
  app?: { name?: unknown; version?: unknown; tauriVersion?: unknown; commit?: unknown };
  tools?: { platform?: unknown; architecture?: unknown; osVersion?: unknown; git?: { version?: unknown }; lfs?: { version?: unknown } };
  settings?: { theme?: unknown; diffMode?: unknown; backgroundPullRequestLoading?: unknown };
  traces: readonly unknown[];
  jobs: readonly unknown[];
  failures: readonly unknown[];
}

export interface DiagnosticSelection {
  traceIds: readonly string[];
  jobIds: readonly string[];
  includeFailures: boolean;
}

export interface DiagnosticTrace {
  readonly id: string;
  readonly category: string | null;
  readonly status: string | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly durationMs: number | null;
}

export interface DiagnosticJob {
  readonly id: string;
  readonly category: string;
  readonly status: string | null;
  readonly createdAt: number | null;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly exitCode: number | null;
}

export interface DiagnosticFailure {
  readonly id: string;
  readonly code: string;
  readonly category: string | null;
  readonly createdAt: number | null;
  readonly finishedAt: number | null;
}

export interface DiagnosticSnapshot {
  readonly schemaVersion: number;
  readonly capturedAt: number | null;
  readonly app: Readonly<{
    name: string;
    version: string | null;
    buildCommit: string | null;
    tauriVersion: string | null;
    platform: string | null;
    architecture: string | null;
    osVersion: string | null;
    gitVersion: string | null;
    lfsVersion: string | null;
  }>;
  readonly settings: Readonly<{
    theme: string | null;
    diffMode: string | null;
    backgroundPullRequestLoading: boolean | null;
  }>;
  readonly traces: readonly DiagnosticTrace[];
  readonly jobs: readonly DiagnosticJob[];
  readonly recentFailures: readonly DiagnosticFailure[];
  readonly omittedDetails: readonly string[];
}

const MAX_RECORDS = 100;
const MAX_FAILURES = 40;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const OMITTED = [
  "Raw arguments, commands, output, exception messages, and logs",
  "Repository and file paths, URLs, titles, diffs, prompts, and context",
  "Account/provider identity, credentials, keys, keychain, and environment",
  "All settings except theme, diff mode, and background pull request loading",
  "Original record identifiers (replaced with snapshot-local identifiers)",
] as const;

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function choice<const T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  return typeof value === "string" && values.includes(value) ? value : null;
}

function finite(value: unknown, max = MAX_TIMESTAMP): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
}

function timestamp(value: unknown): number | null {
  if (typeof value === "number") return finite(value);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  return finite(Date.parse(value));
}

function version(value: unknown, prefix = ""): string | null {
  if (typeof value !== "string" || value.length > 256) return null;
  const text = prefix && value.startsWith(prefix) ? value.slice(prefix.length) : value;
  // Tool versions can contain host/path details after the numeric version: omit them.
  const match = /^(\d{1,6}\.\d{1,6}\.\d{1,6})(?=$|[ .(-])/.exec(text);
  return match?.[1] ?? null;
}


function freeze<T extends object>(value: T): Readonly<T> {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object") freeze(child);
  }
  return Object.freeze(value);
}

export function captureDiagnosticSnapshot(input: DiagnosticInput, capturedAt = Date.now()): DiagnosticSnapshot {
  const app = input.app;
  const tools = input.tools;
  const settings = input.settings;
  return freeze({
    schemaVersion: 1,
    capturedAt: finite(capturedAt),
    app: {
      name: "GitEye",
      version: typeof app?.version === "string" && /^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-(?:alpha|beta|rc)(?:\.\d{1,6})?)?$/.test(app.version) ? app.version : null,
      buildCommit: typeof app?.commit === "string" && /^[a-f0-9]{7,40}$/i.test(app.commit) ? app.commit.toLowerCase() : null,
      tauriVersion: version(app?.tauriVersion),
      platform: choice(tools?.platform, ["linux", "macos", "windows", "android", "ios"]),
      architecture: choice(tools?.architecture, ["x86", "x86_64", "aarch64", "arm", "riscv64", "s390x", "powerpc64"]),
      osVersion: tools?.osVersion === "Rolling Release" ? "rolling"
        : typeof tools?.osVersion === "string" && /^(?:\d{1,6}(?:[._-]\d{1,6}){0,5}|rolling)$/.test(tools.osVersion) ? tools.osVersion : null,
      gitVersion: version(tools?.git?.version, "git version "),
      lfsVersion: version(tools?.lfs?.version, "git-lfs/"),
    },
    settings: {
      theme: choice(settings?.theme, ["dark", "light", "system"]),
      diffMode: choice(settings?.diffMode, ["unified", "split"]),
      backgroundPullRequestLoading: typeof settings?.backgroundPullRequestLoading === "boolean" ? settings.backgroundPullRequestLoading : null,
    },
    traces: input.traces.slice(0, MAX_RECORDS).map((value, index) => {
      const record = object(value);
      return {
        id: `trace-${index + 1}`,
        category: choice(record.kind, ["rust", "navigation", "frontend"]),
        status: choice(record.status, ["running", "succeeded", "failed", "interrupted"]),
        startedAt: timestamp(record.startedAt),
        finishedAt: timestamp(record.finishedAt),
        durationMs: finite(record.durationMs, 7 * 24 * 60 * 60 * 1_000),
      };
    }),
    jobs: input.jobs.slice(0, MAX_RECORDS).map((value, index) => {
      const record = object(value);
      return {
        id: `job-${index + 1}`,
        category: "git-job",
        status: choice(record.status, ["queued", "running", "interrupted", "attentionRequired", "succeeded", "failed", "canceled", "cancelled"]),
        createdAt: timestamp(record.createdAt),
        startedAt: timestamp(record.startedAt),
        finishedAt: timestamp(record.finishedAt),
        exitCode: typeof record.exitCode === "number" && Number.isInteger(record.exitCode) && Math.abs(record.exitCode) <= 65535 ? record.exitCode : null,
      };
    }),
    recentFailures: input.failures.filter((value) => object(value).status === "error").slice(0, MAX_FAILURES).map((value, index) => {
      const record = object(value);
      return {
        id: `failure-${index + 1}`,
        code: "OPERATION_FAILED",
        category: choice(record.category, ["git", "system"]),
        createdAt: timestamp(record.createdAt),
        finishedAt: timestamp(record.finishedAt),
      };
    }),
    omittedDetails: [...OMITTED],
  });
}


export function createDiagnosticPreview(snapshot: DiagnosticSnapshot, selection: DiagnosticSelection): string {
  const traceIds = new Set(selection.traceIds);
  const jobIds = new Set(selection.jobIds);
  return JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    capturedAt: snapshot.capturedAt,
    app: snapshot.app,
    settings: snapshot.settings,
    traces: snapshot.traces.filter((record) => traceIds.has(record.id)),
    jobs: snapshot.jobs.filter((record) => jobIds.has(record.id)),
    recentFailures: selection.includeFailures ? snapshot.recentFailures : [],
    omittedDetails: snapshot.omittedDetails,
  }, null, 2);
}

// A webview/browser download: no native filesystem permission or network request.
// Keep the URL alive while the webview starts the asynchronous download.
export function downloadDiagnosticPreview(preview: string): void {
  const blob = new Blob([preview], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "giteye-diagnostics.json";
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
