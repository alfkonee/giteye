import { invoke, type InvokeArgs } from "@tauri-apps/api/core";

export type InvokeTraceStatus = "running" | "succeeded" | "failed" | "interrupted";
export type TraceKind = "rust" | "navigation" | "frontend";
export type TraceLevel = "rust" | "navigation" | "verbose";

export interface InvokeTraceRecord {
  id: string;
  kind: TraceKind;
  command: string;
  args: unknown;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  status: InvokeTraceStatus;
  error: string | null;
}

const STORAGE_KEY = "giteye:invoke-traces:v2";
const LEVEL_STORAGE_KEY = "giteye:trace-level:v1";
const MAX_RECORDS = 1_000;
const SECRET_KEY = /api.?key|token|password|secret|credential|authorization/i;
const CREDENTIAL_URL = /([a-z][a-z\d+.-]*:\/\/)([^\s/@:]+)(?::[^\s/@]*)?@/gi;
const SENSITIVE_ASSIGNMENT = /((?:api.?key|token|password|secret|credential)\s*[=:]\s*)([^\s,;}&]+)/gi;
const AUTHORIZATION_HEADER = /(authorization\s*:\s*)(?:[a-z]+\s+)?[^\s,;]+/gi;
const BEARER_CREDENTIAL = /(bearer\s+)([^\s,;]+)/gi;
const listeners = new Set<() => void>();
let recording = true;
let traceLevel = restoreTraceLevel();
let records = restoreRecords();
let persistTimer: number | null = null;

export function tracedInvoke<T>(command: string, args?: InvokeArgs): Promise<T> {
  if (!recording) return invoke<T>(command, args);

  const startedAt = new Date();
  const record: InvokeTraceRecord = {
    id: `${startedAt.getTime()}-${crypto.randomUUID()}`,
    kind: "rust",
    command,
    args: redact(args ?? null),
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    durationMs: null,
    status: "running",
    error: null,
  };
  records = [record, ...records].slice(0, MAX_RECORDS);
  publish();

  return invoke<T>(command, args).then(
    (result) => {
      finishTrace(record.id, "succeeded", null);
      return result;
    },
    (error) => {
      finishTrace(record.id, "failed", redactErrorMessage(error));
      throw error;
    },
  );
}

export function subscribeInvokeTraces(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInvokeTraces() {
  return records;
}

export function clearInvokeTraces() {
  records = [];
  publish();
}

export function recordTrace(kind: Exclude<TraceKind, "rust">, command: string, args: unknown) {
  if (!recording || !isTraceKindEnabled(kind)) return;
  const occurredAt = new Date().toISOString();
  const record: InvokeTraceRecord = {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    kind,
    command,
    args: redact(args),
    startedAt: occurredAt,
    finishedAt: occurredAt,
    durationMs: 0,
    status: "succeeded",
    error: null,
  };
  records = [record, ...records].slice(0, MAX_RECORDS);
  publish();
}

export function getTraceLevel() {
  return traceLevel;
}

export function setTraceLevel(level: TraceLevel) {
  traceLevel = level;
  try {
    localStorage.setItem(LEVEL_STORAGE_KEY, level);
  } catch {
    // Tracing configuration must never interfere with the application.
  }
  publish(false);
}

export function isInvokeTraceRecording() {
  return recording;
}

export function setInvokeTraceRecording(enabled: boolean) {
  recording = enabled;
  publish(false);
}

function finishTrace(id: string, status: Extract<InvokeTraceStatus, "succeeded" | "failed">, error: string | null) {
  const finishedAt = new Date();
  records = records.map((record) =>
    record.id === id
      ? {
          ...record,
          status,
          error,
          finishedAt: finishedAt.toISOString(),
          durationMs: Math.max(0, finishedAt.getTime() - Date.parse(record.startedAt)),
        }
      : record,
  );
  publish();
}

function publish(persist = true) {
  if (persist) {
    schedulePersist();
  }
  listeners.forEach((listener) => listener());
}

function schedulePersist() {
  if (persistTimer !== null) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      // Tracing must never interfere with the command being observed.
    }
  }, 250);
}

function restoreRecords(): InvokeTraceRecord[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("giteye:invoke-traces:v1") ?? "[]";
    const parsed = JSON.parse(stored) as InvokeTraceRecord[];
    const restoredAt = new Date();
    return parsed.slice(0, MAX_RECORDS).map((record) => {
      const normalized = { ...record, kind: record.kind ?? "rust" };
      return normalized.status === "running"
        ? {
            ...normalized,
            status: "interrupted",
            finishedAt: restoredAt.toISOString(),
            durationMs: Math.max(0, restoredAt.getTime() - Date.parse(normalized.startedAt)),
            error: "The application exited before this call completed.",
          }
        : normalized;
    });
  } catch {
    return [];
  }
}

function restoreTraceLevel(): TraceLevel {
  try {
    const stored = localStorage.getItem(LEVEL_STORAGE_KEY);
    if (stored === "rust" || stored === "navigation" || stored === "verbose") return stored;
  } catch {
    // Use the safe default when storage is unavailable.
  }
  return "navigation";
}

function isTraceKindEnabled(kind: TraceKind) {
  if (kind === "rust") return true;
  if (kind === "navigation") return traceLevel !== "rust";
  return traceLevel === "verbose";
}

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactTraceText(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redact(item, seen));

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) && item !== null && item !== undefined && item !== ""
        ? "[REDACTED]"
        : redact(item, seen),
    ]),
  );
}

function redactErrorMessage(error: unknown) {
  if (error instanceof Error) return redactTraceText(error.message);
  if (typeof error === "string") return redactTraceText(error);
  try {
    return redactTraceText(JSON.stringify(redact(error)));
  } catch {
    return redactTraceText(String(error));
  }
}

export function redactTraceText(value: string) {
  return value
    .replace(CREDENTIAL_URL, "$1[REDACTED]@")
    .replace(AUTHORIZATION_HEADER, "$1[REDACTED]")
    .replace(BEARER_CREDENTIAL, "$1[REDACTED]")
    .replace(SENSITIVE_ASSIGNMENT, "$1[REDACTED]");
}
