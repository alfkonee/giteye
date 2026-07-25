import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Circle, Download, Pause, Play, TerminalSquare, Trash2, X } from "lucide-react";
import { cn } from "../../lib/cn";
import {
  clearInvokeTraces,
  getInvokeTraces,
  getTraceLevel,
  isInvokeTraceRecording,
  setInvokeTraceRecording,
  setTraceLevel,
  subscribeInvokeTraces,
  type InvokeTraceRecord,
  type InvokeTraceStatus,
  type TraceKind,
  type TraceLevel,
} from "../../lib/invoke-trace";

const TRACE_ROW_HEIGHT = 30;

export function RustCallTracePanel() {
  const traces = useSyncExternalStore(subscribeInvokeTraces, getInvokeTraces, getInvokeTraces);
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(isInvokeTraceRecording);
  const [level, setLevel] = useState(getTraceLevel);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "`") {
        event.preventDefault();
        setOpen((current) => !current);
      } else if (event.key === "Escape" && open) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open || !traces.some((trace) => trace.status === "running")) return;
    const timer = window.setInterval(() => setClock(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [open, traces]);

  const normalizedFilter = filter.trim().toLowerCase();
  const visibleTraces = useMemo(
    () =>
      traces.filter(
        (trace) =>
          !normalizedFilter ||
          trace.command.toLowerCase().includes(normalizedFilter) ||
          trace.kind.includes(normalizedFilter),
      ),
    [normalizedFilter, traces],
  );
  const selected = visibleTraces.find((trace) => trace.id === selectedId) ?? visibleTraces[0] ?? null;
  const runningCount = traces.filter((trace) => trace.status === "running").length;
  const slowCount = traces.filter((trace) => traceDuration(trace, clock) >= 1_000).length;
  const virtualizer = useVirtualizer({
    count: visibleTraces.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TRACE_ROW_HEIGHT,
    overscan: 12,
  });

  if (!open) return null;

  return (
    <section
      className="fixed inset-x-0 top-0 z-[120] flex h-[min(52vh,520px)] flex-col border-b-2 border-[var(--color-accent)]/50 bg-[var(--color-bg-secondary)]/98 shadow-[var(--shadow-elevated)] backdrop-blur-md"
      aria-label="Application trace"
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--color-border-muted)] px-3">
        <TerminalSquare className="h-4 w-4 text-[var(--color-accent)]" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Application trace</h2>
          <p className="text-[10px] text-[var(--color-text-muted)]">Rust IPC, navigation, and frontend events · persisted across restarts</p>
        </div>
        <span className="giteye-chip ml-1" data-tone={runningCount > 0 ? "warning" : "default"}>{runningCount} active</span>
        <span className="giteye-chip" data-tone={slowCount > 0 ? "warning" : "default"}>{slowCount} slow</span>
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter traces…"
          className="giteye-input ml-auto h-7 w-44 text-xs"
        />
        <select
          value={level}
          onChange={(event) => {
            const nextLevel = event.target.value as TraceLevel;
            setLevel(nextLevel);
            setTraceLevel(nextLevel);
          }}
          className="giteye-input h-7 w-32 text-xs"
          title="Rust: IPC only · Navigation: IPC and route changes · Verbose: IPC, routes, clicks, and keys"
          aria-label="Tracing level"
        >
          <option value="rust">Rust only</option>
          <option value="navigation">Navigation</option>
          <option value="verbose">Verbose UI</option>
        </select>
        <button
          type="button"
          onClick={() => {
            const enabled = !recording;
            setRecording(enabled);
            setInvokeTraceRecording(enabled);
          }}
          className="giteye-btn giteye-btn-secondary giteye-btn-sm h-7"
          title={recording ? "Pause recording" : "Resume recording"}
        >
          {recording ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {recording ? "Pause" : "Resume"}
        </button>
        <button
          type="button"
          onClick={() => {
            const payload = JSON.stringify(
              { schemaVersion: 1, exportedAt: new Date().toISOString(), traceLevel: level, traces },
              null,
              2,
            );
            const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `giteye-trace-${new Date().toISOString().replace(/:/g, "-")}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
          }}
          className="giteye-btn giteye-btn-ghost giteye-btn-sm giteye-btn-icon h-7"
          title="Export traces as JSON"
          aria-label="Export traces as JSON"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            clearInvokeTraces();
            setSelectedId(null);
          }}
          className="giteye-btn giteye-btn-ghost giteye-btn-sm giteye-btn-icon h-7"
          title="Clear traces"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <kbd className="giteye-kbd">Ctrl+`</kbd>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="giteye-btn giteye-btn-ghost giteye-btn-sm giteye-btn-icon h-7"
          aria-label="Close application trace"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(560px,1fr)_minmax(320px,0.72fr)]">
        <div className="flex min-h-0 flex-col border-r border-[var(--color-border-muted)]">
          <div className="grid shrink-0 grid-cols-[82px_minmax(190px,1fr)_92px_92px_110px] border-b border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">
            <span>Kind</span><span>Command</span><span>Status</span><span>Duration</span><span>Started</span>
          </div>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
            {visibleTraces.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-xs text-[var(--color-text-muted)]">No application traces recorded.</div>
            ) : (
              <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const trace = visibleTraces[virtualItem.index];
                  return (
                    <button
                      key={trace.id}
                      type="button"
                      onClick={() => setSelectedId(trace.id)}
                      className={cn(
                        "absolute left-0 top-0 grid w-full grid-cols-[82px_minmax(190px,1fr)_92px_92px_110px] items-center border-b border-[var(--color-border-muted)]/70 px-3 text-left font-mono text-[11px] hover:bg-[var(--color-bg-hover)]",
                        selected?.id === trace.id && "giteye-selected-row",
                      )}
                      style={{
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <span className={kindClass(trace.kind)}>{trace.kind}</span>
                      <span className="truncate text-[var(--color-text-primary)]" title={trace.command}>{trace.command}</span>
                      <span className={statusClass(trace.status)}>{trace.status}</span>
                      <span className={cn("tabular-nums", traceDuration(trace, clock) >= 1_000 ? "text-[var(--color-warning)]" : "text-[var(--color-text-secondary)]")}>{formatDuration(traceDuration(trace, clock))}</span>
                      <span className="text-[var(--color-text-muted)]">{new Date(trace.startedAt).toLocaleTimeString()}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <TraceDetails trace={selected} clock={clock} />
      </div>
    </section>
  );
}

function TraceDetails({ trace, clock }: { trace: InvokeTraceRecord | null; clock: number }) {
  if (!trace) {
    return <div className="flex items-center justify-center text-xs text-[var(--color-text-muted)]">Select a trace to inspect its metadata.</div>;
  }

  return (
    <div className="min-h-0 overflow-auto p-3">
      <div className="flex items-center gap-2">
        <Circle className={cn("h-2.5 w-2.5 fill-current", statusDotClass(trace.status))} />
        <h3 className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-[var(--color-text-primary)]">{trace.command}</h3>
        <span className="font-mono text-xs tabular-nums text-[var(--color-text-secondary)]">{formatDuration(traceDuration(trace, clock))}</span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <TraceMetadata label="Kind" value={trace.kind} />
        <TraceMetadata label="Status" value={trace.status} />
        <TraceMetadata label="Started" value={new Date(trace.startedAt).toLocaleString()} />
      </dl>
      <TraceBlock label="Metadata" value={JSON.stringify(trace.args, null, 2)} />
      {trace.error && <TraceBlock label="Error" value={trace.error} error />}
    </div>
  );
}

function TraceMetadata({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-2">
      <dt className="text-[9px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-1 truncate font-mono text-[var(--color-text-secondary)]" title={value}>{value}</dd>
    </div>
  );
}

function TraceBlock({ label, value, error = false }: { label: string; value: string; error?: boolean }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</div>
      <pre className={cn("max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--color-border-muted)] bg-[#05070b] p-2 font-mono text-[11px] leading-5 text-slate-300", error && "text-rose-300")}>{value}</pre>
    </div>
  );
}

function traceDuration(trace: InvokeTraceRecord, clock: number) {
  return trace.durationMs ?? Math.max(0, clock - Date.parse(trace.startedAt));
}

function formatDuration(milliseconds: number) {
  return milliseconds < 1_000 ? `${milliseconds} ms` : `${(milliseconds / 1_000).toFixed(2)} s`;
}

function kindClass(kind: TraceKind) {
  if (kind === "rust") return "text-[var(--color-accent)]";
  if (kind === "navigation") return "text-[var(--color-success)]";
  return "text-[var(--color-text-secondary)]";
}

function statusClass(status: InvokeTraceStatus) {
  if (status === "running") return "text-[var(--color-warning)]";
  if (status === "succeeded") return "text-[var(--color-success)]";
  if (status === "failed") return "text-[var(--color-danger)]";
  return "text-[var(--color-text-muted)]";
}

function statusDotClass(status: InvokeTraceStatus) {
  if (status === "running") return "text-[var(--color-warning)]";
  if (status === "succeeded") return "text-[var(--color-success)]";
  if (status === "failed") return "text-[var(--color-danger)]";
  return "text-[var(--color-text-muted)]";
}
