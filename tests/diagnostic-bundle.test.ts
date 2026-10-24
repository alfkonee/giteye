import { expect, test } from "bun:test";
import {
  captureDiagnosticSnapshot,
  createDiagnosticPreview,
  downloadDiagnosticPreview,
  type DiagnosticInput,
} from "../src/lib/diagnostic-bundle";

const CANARY = "PRIVATE_CANARY_8abf";
const SECRET_PATH = "/home/private/customer-payroll.txt";
const FILE_CONTENT = "salary=982374 secret-private-key";
const CREATED = 1_750_000_000_000;

function fixture(): DiagnosticInput {
  const privateFields = {
    id: CANARY,
    title: CANARY,
    repoPath: SECRET_PATH,
    command: `git show ${SECRET_PATH}`,
    args: { token: CANARY, nested: { privateKey: FILE_CONTENT } },
    error: { code: CANARY, message: FILE_CONTENT, recoveryHint: SECRET_PATH },
    output: FILE_CONTENT,
    lines: [{ line: FILE_CONTENT }],
    url: `https://user:${CANARY}@private.example/repo`,
    env: { HOME: SECRET_PATH, API_KEY: CANARY },
    context: FILE_CONTENT,
  };
  return {
    app: { name: CANARY, version: "1.2.3-beta.2", tauriVersion: "2.12.1", commit: "a".repeat(40) },
    tools: {
      platform: "linux", architecture: "x86_64", osVersion: "6.12.4",
      git: { version: `git version 2.49.0 ${SECRET_PATH}` },
      lfs: { version: `git-lfs/3.7.1 (${CANARY})` },
    },
    settings: {
      theme: "dark", diffMode: "split", backgroundPullRequestLoading: true,
      ...privateFields,
      provider: { identity: CANARY },
    } as DiagnosticInput["settings"],
    traces: [
      { ...privateFields, kind: "rust", status: "failed", startedAt: new Date(CREATED).toISOString(), finishedAt: new Date(CREATED + 30).toISOString(), durationMs: 30 },
      { ...privateFields, kind: "frontend", status: "succeeded", startedAt: new Date(CREATED + 40).toISOString(), durationMs: 1 },
    ],
    jobs: [
      { ...privateFields, status: "failed", createdAt: CREATED, startedAt: CREATED + 1, finishedAt: CREATED + 50, exitCode: 128 },
      { ...privateFields, status: "running", createdAt: CREATED + 60, startedAt: CREATED + 61 },
    ],
    failures: [{ ...privateFields, status: "error", category: "git", createdAt: CREATED, finishedAt: CREATED + 50 }],
  };
}

test("projects only safe metadata even when secrets occur in nested errors, records and configuration", () => {
  const snapshot = captureDiagnosticSnapshot(fixture(), CREATED);
  const preview = createDiagnosticPreview(snapshot, {
    traceIds: snapshot.traces.map((record) => record.id),
    jobIds: snapshot.jobs.map((record) => record.id),
    includeFailures: true,
  });
  for (const secret of [CANARY, SECRET_PATH, FILE_CONTENT, "private.example", "API_KEY", "repoPath", "recoveryHint"]) {
    expect(preview).not.toContain(secret);
  }
  const result = JSON.parse(preview);
  expect(result.app).toMatchObject({ name: "GitEye", gitVersion: "2.49.0", lfsVersion: "3.7.1", architecture: "x86_64", osVersion: "6.12.4" });
  expect(result.settings).toEqual({ theme: "dark", diffMode: "split", backgroundPullRequestLoading: true });
  expect(result.traces[0]).toMatchObject({ durationMs: 30, startedAt: CREATED, status: "failed" });
  expect(result.jobs[0]).toMatchObject({ exitCode: 128, finishedAt: CREATED + 50 });
  expect(result.recentFailures[0]).toMatchObject({ code: "OPERATION_FAILED", category: "git" });
});

test("validates strings, enums and finite numbers rather than trusting metadata-shaped fields", () => {
  const input: DiagnosticInput = {
    app: { name: CANARY, version: CANARY, tauriVersion: CANARY, commit: CANARY },
    tools: { platform: CANARY, architecture: SECRET_PATH, osVersion: FILE_CONTENT, git: { version: CANARY }, lfs: { version: SECRET_PATH } },
    settings: { theme: CANARY, diffMode: SECRET_PATH, backgroundPullRequestLoading: CANARY },
    traces: [{ id: CANARY, kind: CANARY, status: CANARY, durationMs: Infinity, startedAt: SECRET_PATH, finishedAt: "9".repeat(500) }],
    jobs: [{ status: CANARY, createdAt: NaN, startedAt: -1, finishedAt: Infinity, exitCode: 1.5, command: CANARY }],
    failures: [{ status: "error", category: CANARY, code: CANARY, createdAt: FILE_CONTENT, finishedAt: -1 }],
  };
  const snapshot = captureDiagnosticSnapshot(input, Infinity);
  const preview = createDiagnosticPreview(snapshot, { traceIds: ["trace-1"], jobIds: ["job-1"], includeFailures: true });
  expect(preview).not.toContain(CANARY);
  expect(preview).not.toContain(SECRET_PATH);
  expect(preview).not.toContain(FILE_CONTENT);
  expect(JSON.parse(preview).capturedAt).toBeNull();
  expect(snapshot.traces[0]).toMatchObject({ category: null, status: null, durationMs: null, startedAt: null, finishedAt: null });
  expect(snapshot.jobs[0]).toMatchObject({ status: null, createdAt: null, startedAt: null, finishedAt: null, exitCode: null });
  expect(snapshot.recentFailures[0]?.category).toBeNull();
});

test("selection is opt-in, excludes unchosen records, and stays deterministic against live source changes", () => {
  const input = fixture();
  const snapshot = captureDiagnosticSnapshot(input, CREATED);
  const empty = JSON.parse(createDiagnosticPreview(snapshot, { traceIds: [], jobIds: [], includeFailures: false }));
  expect(empty.traces).toEqual([]);
  expect(empty.jobs).toEqual([]);
  expect(empty.recentFailures).toEqual([]);
  const selection = { traceIds: ["trace-2", "trace-2", CANARY], jobIds: ["job-1"], includeFailures: true };
  const preview = createDiagnosticPreview(snapshot, selection);
  (input.traces[1] as Record<string, unknown>).status = "failed";
  (input.jobs[0] as Record<string, unknown>).exitCode = 0;
  input.settings!.theme = "light";
  expect(createDiagnosticPreview(snapshot, selection)).toBe(preview);
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot.traces[0])).toBe(true);
  const selected = JSON.parse(preview);
  expect(selected.traces.map((record: { id: string }) => record.id)).toEqual(["trace-2"]);
  expect(selected.jobs.map((record: { id: string }) => record.id)).toEqual(["job-1"]);
  expect(selected.traces[0].status).toBe("succeeded");
  expect(selected.jobs[0].exitCode).toBe(128);
  const deselected = JSON.parse(createDiagnosticPreview(snapshot, { ...selection, traceIds: [], includeFailures: false }));
  expect(deselected.traces).toEqual([]);
  expect(deselected.recentFailures).toEqual([]);
});

test("bounds available metadata and excludes non-error operation history", () => {
  const input = fixture();
  input.traces = Array.from({ length: 150 }, () => input.traces[0]);
  input.jobs = Array.from({ length: 150 }, () => input.jobs[0]);
  input.failures = [{ status: "success", detail: CANARY }, ...Array.from({ length: 60 }, () => ({ status: "error", category: "system" }))];
  const snapshot = captureDiagnosticSnapshot(input, CREATED);
  expect(snapshot.traces).toHaveLength(100);
  expect(snapshot.jobs).toHaveLength(100);
  expect(snapshot.recentFailures).toHaveLength(40);
});

test("only explicit save creates a download and its Blob bytes equal the exact preview", async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const originalTimeout = globalThis.setTimeout;
  let blob: Blob | null = null;
  let clicks = 0;
  let removed = false;
  let cleanup: (() => void) | null = null;
  let revoked = false;
  const anchor = { href: "", download: "", hidden: false, click() { clicks++; }, remove() { removed = true; } };
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => anchor, body: { appendChild() {} } } });
  URL.createObjectURL = (value) => { blob = value as Blob; return "blob:local-diagnostic"; };
  URL.revokeObjectURL = () => { revoked = true; };
  globalThis.setTimeout = ((callback: () => void) => { cleanup = callback; return 1; }) as unknown as typeof setTimeout;
  try {
    const snapshot = captureDiagnosticSnapshot(fixture(), CREATED);
    const preview = createDiagnosticPreview(snapshot, { traceIds: ["trace-1"], jobIds: [], includeFailures: false });
    // Capturing, selecting, and abandoning a preview must have no download side effect.
    createDiagnosticPreview(snapshot, { traceIds: [], jobIds: [], includeFailures: false });
    expect(clicks).toBe(0);
    expect(blob).toBeNull();
    downloadDiagnosticPreview(preview);
    expect(clicks).toBe(1);
    expect(anchor.download).toBe("giteye-diagnostics.json");
    expect(removed).toBe(true);
    expect(revoked).toBe(false);
    const saved = blob as Blob | null;
    expect(saved).not.toBeNull();
    expect(await saved!.text()).toBe(preview);
    expect(JSON.parse(await saved!.text()).traces).toHaveLength(1);
    const release = cleanup as (() => void) | null;
    release!();
    expect(revoked).toBe(true);
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    globalThis.setTimeout = originalTimeout;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("retains numeric OS releases and canonicalizes the native rolling release marker without accepting free text", () => {
  for (const [osVersion, expected] of [
    ["Rolling Release", "rolling"],
    ["rolling", "rolling"],
    ["6.12.4", "6.12.4"],
    ["24.04", "24.04"],
    ["10.0.26100", "10.0.26100"],
    ["Unknown", null],
    [`Rolling Release ${CANARY}`, null],
    [`6.12.4 ${SECRET_PATH}`, null],
    [CANARY, null],
  ]) {
    const input = fixture();
    input.tools = { ...input.tools, osVersion };
    const snapshot = captureDiagnosticSnapshot(input, CREATED);
    expect(snapshot.app.osVersion).toBe(expected);
    const preview = createDiagnosticPreview(snapshot, { traceIds: [], jobIds: [], includeFailures: false });
    expect(JSON.parse(preview).app.osVersion).toBe(expected);
    expect(preview).not.toContain(CANARY);
    expect(preview).not.toContain(SECRET_PATH);
  }
});
