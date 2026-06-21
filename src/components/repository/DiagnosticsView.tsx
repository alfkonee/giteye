import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  GitCommitHorizontal,
  Play,
  RotateCcw,
  SearchCheck,
  ShieldCheck,
  ShieldQuestion,
  SkipForward,
  Wrench,
  XCircle,
} from "lucide-react";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { useAppStore } from "../../stores/app-store";
import type {
  BisectState,
  GitFsckSummary,
  GitMaintenanceMode,
  GitMaintenanceSummary,
  GitSignatureSummary,
} from "../../types/git";

function errorMessage(error: unknown) {
  if (!error) return null;
  return error instanceof Error ? error.message : String(error);
}

function splitInput(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionalInput(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function DiagnosticsView() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const queryClient = useQueryClient();
  const bisectQuery = useQuery(gitQueries.bisectState(activeRepoPath));
  const [badRevision, setBadRevision] = useState("HEAD");
  const [goodRevisions, setGoodRevisions] = useState("");
  const [pathspecs, setPathspecs] = useState("");
  const [markRevision, setMarkRevision] = useState("");
  const [resetRevision, setResetRevision] = useState("");
  const [fsckFull, setFsckFull] = useState(true);
  const [fsckStrict, setFsckStrict] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState<GitMaintenanceMode>("maintenance");
  const [signatureTarget, setSignatureTarget] = useState("HEAD");

  const bisectStart = useMutation(gitMutations.bisectStart(queryClient, activeRepoPath));
  const bisectGood = useMutation(gitMutations.bisectGood(queryClient, activeRepoPath));
  const bisectBad = useMutation(gitMutations.bisectBad(queryClient, activeRepoPath));
  const bisectSkip = useMutation(gitMutations.bisectSkip(queryClient, activeRepoPath));
  const bisectReset = useMutation(gitMutations.bisectReset(queryClient, activeRepoPath));
  const fsckMutation = useMutation(gitMutations.runGitFsck(queryClient, activeRepoPath));
  const maintenanceMutation = useMutation(gitMutations.runGitMaintenance(queryClient, activeRepoPath));
  const signatureMutation = useMutation(gitMutations.verifyGitSignature(queryClient, activeRepoPath));

  const bisectState = bisectQuery.data;
  const isBisectPending =
    bisectStart.isPending ||
    bisectGood.isPending ||
    bisectBad.isPending ||
    bisectSkip.isPending ||
    bisectReset.isPending;
  const bisectError = errorMessage(
    bisectQuery.error ??
      bisectStart.error ??
      bisectGood.error ??
      bisectBad.error ??
      bisectSkip.error ??
      bisectReset.error,
  );
  const latestBisectState =
    bisectReset.data?.state ?? bisectSkip.data?.state ?? bisectBad.data?.state ?? bisectGood.data?.state ?? bisectStart.data?.state ?? bisectState;

  const diagnosticsError = errorMessage(
    fsckMutation.error ?? maintenanceMutation.error ?? signatureMutation.error,
  );

  const startBisect = () => {
    if (!activeRepoPath || isBisectPending) return;
    const good = splitInput(goodRevisions);
    const bad = optionalInput(badRevision);
    const paths = splitInput(pathspecs);
    const warning = [
      "Start guided git bisect?",
      "Git will check out commits while you mark revisions good, bad, or skipped.",
      "Save or stash local work before continuing.",
    ].join("\n\n");
    if (!window.confirm(warning)) return;
    bisectStart.mutate({ badRevision: bad, goodRevisions: good, paths });
  };

  const markCurrent = (kind: "good" | "bad" | "skip") => {
    if (!activeRepoPath || isBisectPending) return;
    const revision = optionalInput(markRevision);
    const request = { revision };
    if (kind === "good") bisectGood.mutate(request);
    if (kind === "bad") bisectBad.mutate(request);
    if (kind === "skip") bisectSkip.mutate(request);
  };

  const resetBisect = () => {
    if (!activeRepoPath || isBisectPending) return;
    const revision = optionalInput(resetRevision);
    const target = revision || "the original branch";
    if (!window.confirm(`Reset git bisect and return to ${target}?`)) return;
    bisectReset.mutate({ revision });
  };

  const runFsck = () => {
    if (!activeRepoPath || fsckMutation.isPending) return;
    fsckMutation.mutate({ full: fsckFull, strict: fsckStrict });
  };

  const runMaintenance = () => {
    if (!activeRepoPath || maintenanceMutation.isPending) return;
    const label = maintenanceMode === "gc" ? "git gc" : "git maintenance run";
    if (
      !window.confirm(
        `Run ${label}?\n\nThis can take a while and rewrites Git's internal object storage/pack files. Do not close the app while it is running.\n\nRecovery: rely on current refs/reflog promptly; unreachable objects may expire after cleanup.`,
      )
    ) {
      return;
    }
    maintenanceMutation.mutate({ mode: maintenanceMode });
  };

  const verifySignature = () => {
    const target = signatureTarget.trim();
    if (!activeRepoPath || !target || signatureMutation.isPending) return;
    signatureMutation.mutate({ target });
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Header
        icon={<SearchCheck className="h-5 w-5" />}
        title="Diagnostics & Bisect"
        detail="Inspect repository health, run maintenance deliberately, verify signatures, and guide git bisect sessions."
      />
      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <BisectPanel
            state={latestBisectState}
            isLoading={bisectQuery.isLoading}
            isPending={isBisectPending}
            error={bisectError}
            badRevision={badRevision}
            goodRevisions={goodRevisions}
            pathspecs={pathspecs}
            markRevision={markRevision}
            resetRevision={resetRevision}
            onBadRevisionChange={setBadRevision}
            onGoodRevisionsChange={setGoodRevisions}
            onPathspecsChange={setPathspecs}
            onMarkRevisionChange={setMarkRevision}
            onResetRevisionChange={setResetRevision}
            onStart={startBisect}
            onGood={() => markCurrent("good")}
            onBad={() => markCurrent("bad")}
            onSkip={() => markCurrent("skip")}
            onReset={resetBisect}
          />
          <div className="grid gap-4">
            <DiagnosticsPanel
              fsckFull={fsckFull}
              fsckStrict={fsckStrict}
              maintenanceMode={maintenanceMode}
              signatureTarget={signatureTarget}
              isFsckPending={fsckMutation.isPending}
              isMaintenancePending={maintenanceMutation.isPending}
              isSignaturePending={signatureMutation.isPending}
              onFsckFullChange={setFsckFull}
              onFsckStrictChange={setFsckStrict}
              onMaintenanceModeChange={setMaintenanceMode}
              onSignatureTargetChange={setSignatureTarget}
              onRunFsck={runFsck}
              onRunMaintenance={runMaintenance}
              onVerifySignature={verifySignature}
            />
            {diagnosticsError ? <ErrorBanner message={diagnosticsError} /> : null}
            <ResultPanel
              title="fsck result"
              result={fsckMutation.data}
              isPending={fsckMutation.isPending}
              pendingText="Checking repository objects…"
            />
            <ResultPanel
              title="maintenance result"
              result={maintenanceMutation.data}
              isPending={maintenanceMutation.isPending}
              pendingText="Running repository maintenance…"
            />
            <ResultPanel
              title="signature result"
              result={signatureMutation.data}
              isPending={signatureMutation.isPending}
              pendingText="Verifying signature…"
            />
          </div>
        </div>
      </main>
    </section>
  );
}

function Header({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] text-[var(--color-accent)]">
          {icon}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-[var(--color-text-primary)]">{title}</h1>
          <p className="truncate text-sm text-[var(--color-text-secondary)]">{detail}</p>
        </div>
      </div>
    </header>
  );
}

function BisectPanel({
  state,
  isLoading,
  isPending,
  error,
  badRevision,
  goodRevisions,
  pathspecs,
  markRevision,
  resetRevision,
  onBadRevisionChange,
  onGoodRevisionsChange,
  onPathspecsChange,
  onMarkRevisionChange,
  onResetRevisionChange,
  onStart,
  onGood,
  onBad,
  onSkip,
  onReset,
}: {
  state?: BisectState;
  isLoading: boolean;
  isPending: boolean;
  error: string | null;
  badRevision: string;
  goodRevisions: string;
  pathspecs: string;
  markRevision: string;
  resetRevision: string;
  onBadRevisionChange: (value: string) => void;
  onGoodRevisionsChange: (value: string) => void;
  onPathspecsChange: (value: string) => void;
  onMarkRevisionChange: (value: string) => void;
  onResetRevisionChange: (value: string) => void;
  onStart: () => void;
  onGood: () => void;
  onBad: () => void;
  onSkip: () => void;
  onReset: () => void;
}) {
  const isActive = Boolean(state?.inProgress);

  return (
    <Card
      title="Guided bisect"
      icon={<GitCommitHorizontal className="h-4 w-4" />}
      detail="Use native git bisect to narrow a regression without leaving the app."
      aside={<StatusPill tone={isActive ? "warning" : "neutral"}>{isActive ? "Bisect active" : "No bisect"}</StatusPill>}
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3 text-sm">
        {isLoading ? (
          <p className="text-[var(--color-text-muted)]">Loading bisect state…</p>
        ) : (
          <BisectStateSummary state={state} />
        )}
      </div>

      <div className="mt-4 grid gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Start a bisect</h3>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Starting checks out commits. Keep local work saved or stashed before continuing.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Known bad revision">
            <TextInput value={badRevision} onChange={onBadRevisionChange} placeholder="HEAD" disabled={isPending || isActive} />
          </Field>
          <Field label="Known good revisions">
            <TextArea value={goodRevisions} onChange={onGoodRevisionsChange} placeholder="v1.2.0, main~20" disabled={isPending || isActive} rows={2} />
          </Field>
        </div>
        <Field label="Optional pathspecs">
          <TextInput value={pathspecs} onChange={onPathspecsChange} placeholder="src/ tests/" disabled={isPending || isActive} />
        </Field>
        <div>
          <ActionButton disabled={isPending || isActive} onClick={onStart} tone="primary">
            <Play className="h-3.5 w-3.5" /> Start bisect
          </ActionButton>
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Mark current revision</h3>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Leave the revision blank to mark the currently checked-out commit.
          </p>
        </div>
        <Field label="Revision override">
          <TextInput value={markRevision} onChange={onMarkRevisionChange} placeholder="Blank means current checkout" disabled={isPending || !isActive} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <ActionButton disabled={isPending || !isActive} onClick={onGood} tone="success">
            <CheckCircle2 className="h-3.5 w-3.5" /> Good
          </ActionButton>
          <ActionButton disabled={isPending || !isActive} onClick={onBad} tone="danger">
            <XCircle className="h-3.5 w-3.5" /> Bad
          </ActionButton>
          <ActionButton disabled={isPending || !isActive} onClick={onSkip}>
            <SkipForward className="h-3.5 w-3.5" /> Skip
          </ActionButton>
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-lg border border-[color:rgba(248,81,73,0.35)] bg-[color:rgba(248,81,73,0.06)] p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Reset bisect</h3>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Ends the bisect and checks out the original branch, or a revision you provide.
            </p>
          </div>
        </div>
        <Field label="Optional reset target">
          <TextInput value={resetRevision} onChange={onResetRevisionChange} placeholder="Blank returns to original branch" disabled={isPending || !isActive} />
        </Field>
        <div>
          <ActionButton disabled={isPending || !isActive} onClick={onReset} tone="danger">
            <RotateCcw className="h-3.5 w-3.5" /> Reset bisect
          </ActionButton>
        </div>
      </div>
    </Card>
  );
}

function BisectStateSummary({ state }: { state?: BisectState }) {
  if (!state) {
    return <p className="text-[var(--color-text-muted)]">Bisect state unavailable.</p>;
  }

  if (!state.inProgress) {
    return <p className="text-[var(--color-text-muted)]">No bisect session is active for this repository.</p>;
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 md:grid-cols-2">
        <KeyValue label="Current" value={state.currentCommit ? `${state.currentCommit.name} · ${state.currentCommit.summary}` : "Unknown"} />
        <KeyValue label={`Known ${state.terms.bad}`} value={state.knownBad.length > 0 ? state.knownBad.map((revision) => revision.name).join(", ") : "Not recorded"} />
        <KeyValue label={`Known ${state.terms.good}`} value={state.knownGood.length > 0 ? state.knownGood.map((revision) => revision.name).join(", ") : "Not recorded"} />
        <KeyValue label="Pathspecs" value={state.paths.length > 0 ? state.paths.join(", ") : "Whole repository"} />
      </div>
      {state.startRevision ? <p className="text-sm text-[var(--color-text-secondary)]">Started from {state.startRevision}</p> : null}
      {state.skipped.length > 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">Skipped: {state.skipped.map((revision) => revision.name).join(", ")}</p>
      ) : null}
      {state.log.length > 0 ? (
        <details className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Bisect log</summary>
          <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap font-mono text-xs text-[var(--color-text-secondary)]">
            {state.log.map((entry) => entry.raw).join("\n")}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function DiagnosticsPanel({
  fsckFull,
  fsckStrict,
  maintenanceMode,
  signatureTarget,
  isFsckPending,
  isMaintenancePending,
  isSignaturePending,
  onFsckFullChange,
  onFsckStrictChange,
  onMaintenanceModeChange,
  onSignatureTargetChange,
  onRunFsck,
  onRunMaintenance,
  onVerifySignature,
}: {
  fsckFull: boolean;
  fsckStrict: boolean;
  maintenanceMode: GitMaintenanceMode;
  signatureTarget: string;
  isFsckPending: boolean;
  isMaintenancePending: boolean;
  isSignaturePending: boolean;
  onFsckFullChange: (value: boolean) => void;
  onFsckStrictChange: (value: boolean) => void;
  onMaintenanceModeChange: (value: GitMaintenanceMode) => void;
  onSignatureTargetChange: (value: string) => void;
  onRunFsck: () => void;
  onRunMaintenance: () => void;
  onVerifySignature: () => void;
}) {
  return (
    <Card
      title="Repository diagnostics"
      icon={<Wrench className="h-4 w-4" />}
      detail="Run read-only checks, explicit maintenance, and signature verification."
    >
      <div className="grid gap-4">
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4">
          <div className="mb-3 flex items-start gap-2">
            <SearchCheck className="mt-0.5 h-4 w-4 text-[var(--color-accent)]" />
            <div>
              <h3 className="text-sm font-semibold">Object database check</h3>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">Runs git fsck and reports unreachable or corrupt objects.</p>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-3 text-sm text-[var(--color-text-secondary)]">
            <Checkbox checked={fsckFull} onChange={onFsckFullChange} label="Full object check" />
            <Checkbox checked={fsckStrict} onChange={onFsckStrictChange} label="Strict mode" />
          </div>
          <ActionButton disabled={isFsckPending} onClick={onRunFsck} tone="primary">
            <SearchCheck className="h-3.5 w-3.5" /> Run fsck
          </ActionButton>
        </section>

        <section className="rounded-lg border border-[color:rgba(210,153,34,0.35)] bg-[color:rgba(210,153,34,0.07)] p-4">
          <div className="mb-3 flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-[var(--color-warning)]" />
            <div>
              <h3 className="text-sm font-semibold">Maintenance / GC</h3>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Long-running action. It rewrites Git object packs; confirmation is required before execution.
              </p>
            </div>
          </div>
          <div className="mb-3 grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]" htmlFor="maintenance-mode">Mode</label>
            <select
              id="maintenance-mode"
              value={maintenanceMode}
              onChange={(event) => onMaintenanceModeChange(event.target.value as GitMaintenanceMode)}
              disabled={isMaintenancePending}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            >
              <option value="maintenance">git maintenance run</option>
              <option value="gc">git gc</option>
            </select>
          </div>
          <ActionButton disabled={isMaintenancePending} onClick={onRunMaintenance} tone="danger">
            <Wrench className="h-3.5 w-3.5" /> Run selected maintenance
          </ActionButton>
        </section>

        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4">
          <div className="mb-3 flex items-start gap-2">
            <ShieldQuestion className="mt-0.5 h-4 w-4 text-[var(--color-accent)]" />
            <div>
              <h3 className="text-sm font-semibold">Signature verification</h3>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">Verify a signed commit or tag using native Git signature checks.</p>
            </div>
          </div>
          <div className="mb-3">
            <TextInput value={signatureTarget} onChange={onSignatureTargetChange} placeholder="HEAD, tag name, or commit hash" disabled={isSignaturePending} />
          </div>
          <ActionButton disabled={isSignaturePending || !signatureTarget.trim()} onClick={onVerifySignature} tone="primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Verify signature
          </ActionButton>
        </section>
      </div>
    </Card>
  );
}

type DiagnosticResult = GitFsckSummary | GitMaintenanceSummary | GitSignatureSummary;

function ResultPanel({
  title,
  result,
  isPending,
  pendingText,
}: {
  title: string;
  result?: DiagnosticResult;
  isPending: boolean;
  pendingText: string;
}) {
  const commandText = useMemo(() => (result ? result.command.join(" ") : ""), [result]);

  if (!isPending && !result) return null;

  const isSignature = Boolean(result && "status" in result);
  const isFsck = Boolean(result && "ok" in result);
  const succeeded = result ? ("ok" in result ? result.ok : "status" in result ? result.status === "valid" : result.exitCode === 0) : false;
  const detail = isPending
    ? pendingText
    : result && "issueCount" in result
      ? `${result.issueCount} issue${result.issueCount === 1 ? "" : "s"} found.`
      : result && "status" in result
        ? `Signature status: ${result.status}.`
        : result && "mode" in result
          ? `${result.mode} completed with exit ${result.exitCode}.`
          : "Command completed.";
  const output = result
    ? "rawOutput" in result
      ? result.rawOutput
      : result.output
    : "";

  return (
    <Card title={title} icon={succeeded ? <CheckCircle2 className="h-4 w-4" /> : <ShieldQuestion className="h-4 w-4" />} detail={detail}>
      {isPending ? (
        <p className="text-sm text-[var(--color-text-muted)]">{pendingText}</p>
      ) : result ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={succeeded ? "success" : "warning"}>{succeeded ? "Success" : "Needs attention"}</StatusPill>
            <StatusPill tone="neutral">exit {result.exitCode}</StatusPill>
          </div>
          {isSignature && "status" in result ? <SignatureSummary result={result} /> : null}
          {isFsck && "issues" in result && result.issues.length > 0 ? <FsckIssues issues={result.issues} /> : null}
          <pre className="overflow-auto rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3 font-mono text-xs text-[var(--color-text-secondary)]">{commandText}</pre>
          {output ? <OutputBlock label="output" value={output} tone={succeeded ? "default" : "warning"} /> : <p className="text-sm text-[var(--color-text-muted)]">No command output.</p>}
        </div>
      ) : null}
    </Card>
  );
}

function SignatureSummary({ result }: { result: GitSignatureSummary }) {
  return (
    <div className="grid gap-2 text-sm">
      <KeyValue label="Target" value={`${result.target} (${result.objectType})`} />
      <KeyValue label="Signer" value={result.signer ?? "Unavailable"} />
      <KeyValue label="Key" value={result.keyId ?? result.fingerprint ?? "Unavailable"} />
      <KeyValue label="Trust" value={result.trust ?? "Unavailable"} />
    </div>
  );
}

function FsckIssues({ issues }: { issues: GitFsckSummary["issues"] }) {
  return (
    <div className="grid gap-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Issues</div>
      <div className="max-h-44 overflow-auto rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)]">
        {issues.map((issue, index) => (
          <div key={`${issue.severity}-${issue.objectId ?? index}`} className="border-b border-[var(--color-border-muted)] px-3 py-2 last:border-b-0">
            <div className="flex items-center gap-2 text-xs">
              <StatusPill tone={issue.severity === "error" ? "warning" : "neutral"}>{issue.severity}</StatusPill>
              {issue.objectType ? <span className="font-mono text-[var(--color-text-muted)]">{issue.objectType}</span> : null}
              {issue.objectId ? <span className="truncate font-mono text-[var(--color-text-muted)]">{issue.objectId}</span> : null}
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{issue.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutputBlock({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</div>
      <pre className={tone === "warning" ? "max-h-64 overflow-auto rounded-md border border-[color:rgba(210,153,34,0.35)] bg-[color:rgba(210,153,34,0.07)] p-3 whitespace-pre-wrap font-mono text-xs text-[var(--color-text-secondary)]" : "max-h-64 overflow-auto rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3 whitespace-pre-wrap font-mono text-xs text-[var(--color-text-secondary)]"}>{value}</pre>
    </div>
  );
}

function Card({ title, detail, icon, aside, children }: { title: string; detail: string; icon: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] text-[var(--color-accent)]">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{detail}</p>
          </div>
        </div>
        {aside}
      </div>
      {children}
    </article>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</span>
      {children}
    </label>
  );
}

function TextInput({ value, onChange, placeholder, disabled }: { value: string; onChange: (value: string) => void; placeholder: string; disabled?: boolean }) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

function TextArea({ value, onChange, placeholder, disabled, rows }: { value: string; onChange: (value: string) => void; placeholder: string; disabled?: boolean; rows: number }) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
      className="w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="inline-flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function ActionButton({ children, disabled, onClick, tone = "default" }: { children: ReactNode; disabled?: boolean; onClick: () => void; tone?: "default" | "danger" | "primary" | "success" }) {
  const toneClass =
    tone === "primary"
      ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white hover:opacity-90"
      : tone === "danger"
        ? "border-[color:rgba(248,81,73,0.45)] text-[var(--color-danger)] hover:bg-[color:rgba(248,81,73,0.08)]"
        : tone === "success"
          ? "border-[color:rgba(63,185,80,0.45)] text-[var(--color-success)] hover:bg-[color:rgba(63,185,80,0.08)]"
          : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      {children}
    </button>
  );
}

function StatusPill({ children, tone }: { children: ReactNode; tone: "neutral" | "success" | "warning" }) {
  const className =
    tone === "success"
      ? "border-[color:rgba(63,185,80,0.35)] bg-[color:rgba(63,185,80,0.1)] text-[var(--color-success)]"
      : tone === "warning"
        ? "border-[color:rgba(210,153,34,0.35)] bg-[color:rgba(210,153,34,0.1)] text-[var(--color-warning)]"
        : "border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]";
  return <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-1 truncate font-mono text-xs text-[var(--color-text-secondary)]" title={value}>{value}</div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-3 rounded-md border border-[color:rgba(248,81,73,0.45)] bg-[color:rgba(248,81,73,0.08)] px-3 py-2 text-sm text-[var(--color-danger)]">
      {message}
    </div>
  );
}

