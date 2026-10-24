import { useMemo, useState } from "react";
import { formatAppError } from "../../lib/app-error";
import {
  captureDiagnosticSnapshot,
  createDiagnosticPreview,
  downloadDiagnosticPreview,
  type DiagnosticInput,
  type DiagnosticSelection,
  type DiagnosticSnapshot,
} from "../../lib/diagnostic-bundle";
import { getInvokeTraces } from "../../lib/invoke-trace";
import { useAppStore } from "../../stores/app-store";
import { useJobStore } from "../../stores/job-store";
import { useNoticeStore } from "../../stores/notice-store";
import { Button } from "../ui";

const EMPTY_SELECTION: DiagnosticSelection = { traceIds: [], jobIds: [], includeFailures: false };

export function DiagnosticBundle({ app, tools }: Pick<DiagnosticInput, "app" | "tools">) {
  const [snapshot, setSnapshot] = useState<DiagnosticSnapshot | null>(null);
  const [selection, setSelection] = useState<DiagnosticSelection>(EMPTY_SELECTION);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [downloadRequested, setDownloadRequested] = useState(false);
  const preview = useMemo(() => snapshot ? createDiagnosticPreview(snapshot, selection) : null, [snapshot, selection]);

  function capture() {
    const jobs = useJobStore.getState();
    setSnapshot(captureDiagnosticSnapshot({
      app,
      tools,
      settings: useAppStore.getState(),
      traces: getInvokeTraces(),
      jobs: jobs.jobOrder.map((id) => jobs.jobsById[id]).filter(Boolean),
      failures: useNoticeStore.getState().operationTranscript,
    }));
    setSelection(EMPTY_SELECTION);
    setSaveError(null);
    setDownloadRequested(false);
  }

  function selectRecord(group: "traceIds" | "jobIds", id: string, checked: boolean) {
    setSelection((current) => ({
      ...current,
      [group]: checked ? [...current[group], id] : current[group].filter((item) => item !== id),
    }));
    setDownloadRequested(false);
    setSaveError(null);
  }

  return <section aria-labelledby="diagnostic-bundle-title" className="space-y-4 border-t border-[var(--color-border-muted)] p-5">
    <div>
      <h4 id="diagnostic-bundle-title" className="text-sm font-semibold text-[var(--color-text-primary)]">Diagnostic bundle</h4>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">Create a local, privacy-filtered snapshot for a bug report. Nothing is uploaded or saved until you choose Save previewed JSON.</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={capture}>{snapshot ? "Refresh snapshot (clear selections)" : "Create diagnostic bundle"}</Button>
      {snapshot && <Button variant="ghost" size="sm" onClick={() => {
        setSnapshot(null);
        setSelection(EMPTY_SELECTION);
        setSaveError(null);
        setDownloadRequested(false);
      }}>Cancel</Button>}
    </div>
    {snapshot && preview !== null && <>
      <p className="text-xs text-[var(--color-text-secondary)]">This snapshot is frozen. Select individual records to regenerate the exact preview below. New activity is not included unless you refresh. Times are Unix milliseconds; null means unavailable or omitted.</p>
      <details className="text-xs text-[var(--color-text-muted)]" open>
        <summary className="cursor-pointer font-medium">Details deliberately omitted</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">{snapshot.omittedDetails.map((detail) => <li key={detail}>{detail}</li>)}</ul>
        <p className="mt-2">Commands and original identifiers are excluded even if they appear harmless. Failures use a generic OPERATION_FAILED code, never exception text. Up to 100 traces, 100 jobs, and 40 recent failures are available.</p>
      </details>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <fieldset className="min-w-0 rounded border border-[var(--color-border)] p-3">
          <legend className="px-1 text-xs font-medium">Trace metadata ({snapshot.traces.length})</legend>
          <div className="max-h-48 space-y-2 overflow-auto">
            {snapshot.traces.length === 0 && <p className="text-xs text-[var(--color-text-muted)]">No recorded traces in this snapshot.</p>}
            {snapshot.traces.map((record) => <label key={record.id} className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
              <input type="checkbox" checked={selection.traceIds.includes(record.id)} onChange={(event) => selectRecord("traceIds", record.id, event.target.checked)} />
              <span className="break-words">{record.id} · {record.category ?? "unknown category"} · {record.status ?? "unknown status"} · {record.durationMs === null ? "duration unavailable" : `${record.durationMs} ms`} · started {record.startedAt ?? "unavailable"}</span>
            </label>)}
          </div>
        </fieldset>
        <fieldset className="min-w-0 rounded border border-[var(--color-border)] p-3">
          <legend className="px-1 text-xs font-medium">Job metadata ({snapshot.jobs.length})</legend>
          <div className="max-h-48 space-y-2 overflow-auto">
            {snapshot.jobs.length === 0 && <p className="text-xs text-[var(--color-text-muted)]">No jobs in this snapshot.</p>}
            {snapshot.jobs.map((record) => <label key={record.id} className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
              <input type="checkbox" checked={selection.jobIds.includes(record.id)} onChange={(event) => selectRecord("jobIds", record.id, event.target.checked)} />
              <span className="break-words">{record.id} · {record.status ?? "unknown status"} · exit {record.exitCode ?? "unavailable"} · started {record.startedAt ?? "unavailable"}</span>
            </label>)}
          </div>
        </fieldset>
      </div>
      <label className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
        <input type="checkbox" checked={selection.includeFailures} onChange={(event) => {
          setSelection((current) => ({ ...current, includeFailures: event.target.checked }));
          setDownloadRequested(false);
          setSaveError(null);
        }} />
        <span>Include bounded recent failure summary ({snapshot.recentFailures.length}): generic code, git/system category, and timing only.</span>
      </label>
      <label className="block space-y-2 text-xs font-medium text-[var(--color-text-secondary)]">
        <span>Exact JSON to be saved</span>
        <textarea readOnly value={preview} spellCheck={false} rows={16} className="block w-full min-w-0 resize-y rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3 font-mono text-xs text-[var(--color-text-primary)]" />
      </label>
      <Button variant="secondary" size="sm" onClick={() => {
        try {
          downloadDiagnosticPreview(preview);
          setDownloadRequested(true);
          setSaveError(null);
        } catch (error) {
          setSaveError(error);
          setDownloadRequested(false);
        }
      }}>Save previewed JSON</Button>
      {downloadRequested && <p role="status" className="text-xs text-[var(--color-text-muted)]">Local download requested for giteye-diagnostics.json. Check your downloads; no data was uploaded.</p>}
      {saveError !== null && <p role="alert" className="text-xs text-[var(--color-danger)]">{formatAppError(saveError)}</p>}
    </>}
  </section>;
}
