import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileSearch,
  History,
  ListTree,
  Pickaxe,
  Search,
  ShieldQuestion,
  TextSearch,
} from "lucide-react";
import { useAppStore } from "../../stores/app-store";
import { gitQueries } from "../../lib/git-data";
import { cn } from "../../lib/cn";
import { ErrorCallout } from "../common/ErrorCallout";
import { EmptyState } from "../common/EmptyState";
import type {
  BlameFileRequest,
  BlameLine,
  CommitSearchRequest,
  CommitSearchResult,
  FileHistoryEntry,
  FileHistoryRequest,
  GitGrepMatch,
  GitGrepRequest,
  PickaxeSearchMode,
  PickaxeSearchRequest,
  PickaxeSearchResult,
  LostCommit,
  ReflogEntry,
} from "../../types/git";

const DEFAULT_LIMIT = 50;
const BLAME_LIMIT = 200;
const LIMIT_OPTIONS = [25, 50, 100, 200];

type ArchaeologyTool = "commits" | "files" | "blame" | "grep" | "pickaxe" | "reflog" | "lost";

type QueryState<T> = {
  data?: T[];
  error: Error | null;
  isFetching: boolean;
  hasRequest: boolean;
  emptyTitle: string;
  emptyDescription: string;
};

const tools: Array<{ id: ArchaeologyTool; label: string; description: string; icon: ReactNode }> = [
  { id: "commits", label: "Commit search", description: "Search commit messages", icon: <Search className="h-4 w-4" /> },
  { id: "files", label: "File history", description: "Follow a path through commits", icon: <FileSearch className="h-4 w-4" /> },
  { id: "blame", label: "Blame", description: "Line ownership for a file", icon: <ShieldQuestion className="h-4 w-4" /> },
  { id: "grep", label: "Grep", description: "Search tracked file content", icon: <TextSearch className="h-4 w-4" /> },
  { id: "pickaxe", label: "Pickaxe", description: "Find commits adding/removing text", icon: <Pickaxe className="h-4 w-4" /> },
  { id: "reflog", label: "Reflog", description: "Recent HEAD positions", icon: <ListTree className="h-4 w-4" /> },
  { id: "lost", label: "Lost commits", description: "Unreachable commits from fsck", icon: <Search className="h-4 w-4" /> },
];

export function ArchaeologyView() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const [tool, setTool] = useState<ArchaeologyTool>("commits");
  const [commitForm, setCommitForm] = useState({ query: "", limit: DEFAULT_LIMIT });
  const [fileForm, setFileForm] = useState({ filePath: "", limit: DEFAULT_LIMIT });
  const [blameForm, setBlameForm] = useState({ filePath: "", revision: "HEAD", limit: BLAME_LIMIT });
  const [grepForm, setGrepForm] = useState({ query: "", pathspec: "", caseSensitive: true, limit: DEFAULT_LIMIT });
  const [pickaxeForm, setPickaxeForm] = useState<{ query: string; mode: PickaxeSearchMode; limit: number }>({
    query: "",
    mode: "literal",
    limit: DEFAULT_LIMIT,
  });
  const [lostLimit, setLostLimit] = useState(DEFAULT_LIMIT);
  const [commitRequest, setCommitRequest] = useState<CommitSearchRequest | null>(null);
  const [fileRequest, setFileRequest] = useState<FileHistoryRequest | null>(null);
  const [blameRequest, setBlameRequest] = useState<BlameFileRequest | null>(null);
  const [grepRequest, setGrepRequest] = useState<GitGrepRequest | null>(null);
  const [pickaxeRequest, setPickaxeRequest] = useState<PickaxeSearchRequest | null>(null);

  const commitQuery = useQuery(gitQueries.commitSearch(activeRepoPath, commitRequest, tool === "commits"));
  const fileHistoryQuery = useQuery(gitQueries.fileHistory(activeRepoPath, fileRequest, tool === "files"));
  const blameQuery = useQuery(gitQueries.blameFile(activeRepoPath, blameRequest, tool === "blame"));
  const grepQuery = useQuery(gitQueries.gitGrep(activeRepoPath, grepRequest, tool === "grep"));
  const pickaxeQuery = useQuery(gitQueries.pickaxeSearch(activeRepoPath, pickaxeRequest, tool === "pickaxe"));
  const reflogQuery = useQuery(gitQueries.reflog(activeRepoPath, 20, tool === "reflog"));
  const lostCommitsQuery = useQuery(gitQueries.lostCommits(activeRepoPath, lostLimit, tool === "lost"));

  const runCommitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCommitRequest({
      query: commitForm.query.trim(),
      limit: boundedLimit(commitForm.limit),
    });
  };

  const runFileHistory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFileRequest({
      filePath: fileForm.filePath.trim(),
      limit: boundedLimit(fileForm.limit),
    });
  };

  const runBlame = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBlameRequest({
      filePath: blameForm.filePath.trim(),
      revision: nullableText(blameForm.revision),
      limit: boundedLimit(blameForm.limit),
    });
  };

  const runGrep = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setGrepRequest({
      query: grepForm.query.trim(),
      pathspec: nullableText(grepForm.pathspec),
      caseSensitive: grepForm.caseSensitive,
      limit: boundedLimit(grepForm.limit),
    });
  };

  const runPickaxe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPickaxeRequest({
      query: pickaxeForm.query.trim(),
      mode: pickaxeForm.mode,
      limit: boundedLimit(pickaxeForm.limit),
    });
  };

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-primary)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] text-[var(--color-accent)]">
            <History className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[14px] font-semibold text-[var(--color-text-primary)]">Search & archaeology</h1>
            <p className="text-[12px] text-[var(--color-text-muted)]">
              Read-only native Git searches with bounded result sets for commit archaeology.
            </p>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav className="w-64 shrink-0 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]/60 p-3">
          <div className="space-y-1">
            {tools.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTool(item.id)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                  tool === item.id
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-text-primary)]"
                    : "border-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-border-muted)] hover:bg-[var(--color-bg-hover)]",
                )}
              >
                <span className="flex items-center gap-2 text-[12px] font-semibold">
                  {item.icon}
                  {item.label}
                </span>
                <span className="mt-1 block text-[11px] text-[var(--color-text-muted)]">{item.description}</span>
              </button>
            ))}
          </div>
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto p-4">
          {tool === "commits" && (
            <ToolPanel title="Commit search" detail="Search commit subject/body with a bounded result limit.">
              <form onSubmit={runCommitSearch} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_auto]">
                <TextField label="Query" value={commitForm.query} required placeholder="fix parser" onChange={(query) => setCommitForm((form) => ({ ...form, query }))} />
                <LimitField value={commitForm.limit} onChange={(limit) => setCommitForm((form) => ({ ...form, limit }))} />
                <RunButton disabled={!activeRepoPath || !commitForm.query.trim()} running={commitQuery.isFetching} />
              </form>
              <CommitResults state={queryState(commitQuery, Boolean(commitRequest), "No commits matched", "Try a broader commit message query.")} />
            </ToolPanel>
          )}

          {tool === "files" && (
            <ToolPanel title="File history" detail="Follow a tracked path through recent commits.">
              <form onSubmit={runFileHistory} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_auto]">
                <TextField label="File path" value={fileForm.filePath} required placeholder="src/lib/git-data.ts" onChange={(filePath) => setFileForm((form) => ({ ...form, filePath }))} />
                <LimitField value={fileForm.limit} onChange={(limit) => setFileForm((form) => ({ ...form, limit }))} />
                <RunButton disabled={!activeRepoPath || !fileForm.filePath.trim()} running={fileHistoryQuery.isFetching} />
              </form>
              <FileHistoryResults state={queryState(fileHistoryQuery, Boolean(fileRequest), "No history returned", "Check that the path is tracked in this repository.")} />
            </ToolPanel>
          )}

          {tool === "blame" && (
            <ToolPanel title="Blame" detail="Inspect recent line ownership at a revision with a bounded line count.">
              <form onSubmit={runBlame} className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_160px_auto]">
                <TextField label="File path" value={blameForm.filePath} required placeholder="src/app/App.tsx" onChange={(filePath) => setBlameForm((form) => ({ ...form, filePath }))} />
                <TextField label="Revision" value={blameForm.revision} placeholder="HEAD" onChange={(revision) => setBlameForm((form) => ({ ...form, revision }))} />
                <LimitField value={blameForm.limit} onChange={(limit) => setBlameForm((form) => ({ ...form, limit }))} />
                <RunButton disabled={!activeRepoPath || !blameForm.filePath.trim()} running={blameQuery.isFetching} />
              </form>
              <BlameResults state={queryState(blameQuery, Boolean(blameRequest), "No blame lines returned", "Try another revision or a smaller result limit.")} />
            </ToolPanel>
          )}

          {tool === "grep" && (
            <ToolPanel title="Grep" detail="Search tracked file contents with optional path filtering.">
              <form onSubmit={runGrep} className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_120px_auto_auto]">
                <TextField label="Query" value={grepForm.query} required placeholder="useQuery" onChange={(query) => setGrepForm((form) => ({ ...form, query }))} />
                <TextField label="Path" value={grepForm.pathspec} placeholder="src/" onChange={(pathspec) => setGrepForm((form) => ({ ...form, pathspec }))} />
                <LimitField value={grepForm.limit} onChange={(limit) => setGrepForm((form) => ({ ...form, limit }))} />
                <label className="flex items-end gap-2 pb-2 text-[12px] text-[var(--color-text-secondary)]">
                  <input type="checkbox" checked={grepForm.caseSensitive} onChange={(event) => setGrepForm((form) => ({ ...form, caseSensitive: event.target.checked }))} />
                  Case sensitive
                </label>
                <RunButton disabled={!activeRepoPath || !grepForm.query.trim()} running={grepQuery.isFetching} />
              </form>
              <GrepResults state={queryState(grepQuery, Boolean(grepRequest), "No content matches", "Try a simpler query or remove the path filter.")} />
            </ToolPanel>
          )}

          {tool === "pickaxe" && (
            <ToolPanel title="Pickaxe" detail="Use git log -S for literal text or -G for regex changes.">
              <form onSubmit={runPickaxe} className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_150px_160px_auto]">
                <TextField label="Needle" value={pickaxeForm.query} required placeholder="functionName" onChange={(query) => setPickaxeForm((form) => ({ ...form, query }))} />
                <SelectField label="Mode" value={pickaxeForm.mode} onChange={(mode) => setPickaxeForm((form) => ({ ...form, mode: mode as PickaxeSearchMode }))} options={[{ value: "literal", label: "-S literal" }, { value: "regex", label: "-G regex" }]} />
                <LimitField value={pickaxeForm.limit} onChange={(limit) => setPickaxeForm((form) => ({ ...form, limit }))} />
                <RunButton disabled={!activeRepoPath || !pickaxeForm.query.trim()} running={pickaxeQuery.isFetching} />
              </form>
              <PickaxeResults state={queryState(pickaxeQuery, Boolean(pickaxeRequest), "No pickaxe hits", "Try the alternate -S/-G mode.")} />
            </ToolPanel>
          )}

          {tool === "reflog" && (
            <ToolPanel title="Reflog discovery" detail="Read recent HEAD positions for lost commits before deciding whether to recover them elsewhere.">
              <ReflogResults state={queryState(reflogQuery, true, "No reflog entries", "This repository did not report recent HEAD positions.")} />
            </ToolPanel>
          )}

          {tool === "lost" && (
            <ToolPanel title="Lost commit discovery" detail="Run bounded git fsck discovery for unreachable commits not present in the reflog.">
              <div className="mb-4 max-w-40">
                <LimitField value={lostLimit} onChange={setLostLimit} />
              </div>
              <LostCommitResults state={queryState(lostCommitsQuery, true, "No lost commits found", "Git did not report unreachable commits outside the reflog.")} />
            </ToolPanel>
          )}
        </main>
      </div>
    </div>
  );
}

function ToolPanel({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[13px] font-semibold text-[var(--color-text-primary)]">{title}</h2>
        <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">{detail}</p>
      </div>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 shadow-[var(--shadow-panel)]">
        {children}
      </div>
    </section>
  );
}

function TextField({ label, value, onChange, placeholder, required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean }) {
  return (
    <label className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
      {label}
      <input
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] px-3 text-[12px] normal-case tracking-normal text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-subtle)] focus:border-[var(--color-accent)]"
      />
    </label>
  );
}


function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] px-3 text-[12px] normal-case tracking-normal text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-accent)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function LimitField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <SelectField
      label="Limit"
      value={String(value)}
      onChange={(nextValue) => onChange(Number(nextValue))}
      options={LIMIT_OPTIONS.map((limit) => ({ value: String(limit), label: String(limit) }))}
    />
  );
}

function RunButton({ disabled, running }: { disabled: boolean; running: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled || running}
      className="self-end rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-2 text-[12px] font-semibold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
    >
      {running ? "Running…" : "Run"}
    </button>
  );
}

function CommitResults({ state }: { state: QueryState<CommitSearchResult> }) {
  return <ResultFrame state={state} render={(results) => <CommitList commits={results} />} />;
}

function FileHistoryResults({ state }: { state: QueryState<FileHistoryEntry> }) {
  return <ResultFrame state={state} render={(results) => <CommitList commits={results} showFileStats />} />;
}

function PickaxeResults({ state }: { state: QueryState<PickaxeSearchResult> }) {
  return <ResultFrame state={state} render={(results) => <CommitList commits={results} showFileStats />} />;
}

function BlameResults({ state }: { state: QueryState<BlameLine> }) {
  return (
    <ResultFrame
      state={state}
      render={(lines) => (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)]">
          {lines.map((line, index) => (
            <div key={`${line.hash}-${line.lineNumber}-${index}`} className="grid grid-cols-[92px_150px_1fr] gap-3 border-b border-[var(--color-border-muted)] px-3 py-1.5 text-[12px] last:border-b-0">
              <span className="font-mono text-[var(--color-accent)]">{line.hash.slice(0, 8)}</span>
              <span className="truncate text-[var(--color-text-muted)]">L{line.lineNumber} · {line.authorName}</span>
              <code className="min-w-0 whitespace-pre-wrap break-words text-[var(--color-text-primary)]">{line.content}</code>
            </div>
          ))}
        </div>
      )}
    />
  );
}

function GrepResults({ state }: { state: QueryState<GitGrepMatch> }) {
  return (
    <ResultFrame
      state={state}
      render={(matches) => (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)]">
          {matches.map((match, index) => (
            <div key={`${match.path}-${match.lineNumber}-${index}`} className="border-b border-[var(--color-border-muted)] px-3 py-2 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                <span className="font-mono text-[var(--color-accent)]">{match.path}:{match.lineNumber}</span>
              </div>
              <code className="mt-1 block whitespace-pre-wrap break-words text-[12px] text-[var(--color-text-primary)]">{match.content}</code>
            </div>
          ))}
        </div>
      )}
    />
  );
}

function ReflogResults({ state }: { state: QueryState<ReflogEntry> }) {
  return (
    <ResultFrame
      state={state}
      render={(entries) => (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)]">
          {entries.map((entry) => (
            <div key={`${entry.selector}-${entry.hash}`} className="grid grid-cols-[84px_92px_minmax(0,1fr)_190px] gap-3 border-b border-[var(--color-border-muted)] px-3 py-2 text-[12px] last:border-b-0">
              <span className="font-mono text-[var(--color-accent)]">{entry.selector}</span>
              <span className="font-mono text-[var(--color-text-secondary)]">{entry.shortHash || entry.hash.slice(0, 8)}</span>
              <span className="truncate text-[var(--color-text-primary)]">{entry.message}</span>
              <span className="truncate text-right text-[var(--color-text-muted)]">{formatTime(entry.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    />
  );
}

function LostCommitResults({ state }: { state: QueryState<LostCommit> }) {
  return (
    <ResultFrame
      state={state}
      render={(commits) => (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)]">
          {commits.map((commit) => (
            <article key={`${commit.source}-${commit.hash}`} className="border-b border-[var(--color-border-muted)] px-3 py-2.5 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[12px] text-[var(--color-accent)]">{commit.shortHash}</span>
                <h3 className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-text-primary)]">{commit.message}</h3>
                <span className="rounded-full border border-[var(--color-border-muted)] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-muted)]">{commit.source}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                <span>{commit.authorName}</span>
                <span>·</span>
                <span>{formatTime(commit.timestamp)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    />
  );
}

function ResultFrame<T>({ state, render }: { state: QueryState<T>; render: (results: T[]) => ReactNode }) {
  if (!state.hasRequest) {
    return (
      <EmptyState
        icon={<Search className="h-6 w-6" />}
        title="Choose filters and run a search"
        description="Results are capped by the selected limit and Git commands are read-only."
        className="mt-4"
      />
    );
  }

  if (state.error) {
    return <ErrorCallout className="mt-4" message={state.error.message} />;
  }

  if (state.isFetching && !state.data) {
    return <p className="mt-4 rounded-lg border border-[var(--color-border-muted)] px-3 py-4 text-center text-[12px] text-[var(--color-text-muted)]">Running native Git search…</p>;
  }

  const results = state.data ?? [];
  if (results.length === 0) {
    return <EmptyState title={state.emptyTitle} description={state.emptyDescription} className="mt-4" />;
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
        <span>{results.length} bounded result{results.length === 1 ? "" : "s"}</span>
        {state.isFetching ? <span>Refreshing…</span> : null}
      </div>
      {render(results)}
    </div>
  );
}

function CommitList<T extends CommitSearchResult | FileHistoryEntry | PickaxeSearchResult>({ commits, showFileStats = false }: { commits: T[]; showFileStats?: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)]">
      {commits.map((commit, index) => (
        <article key={`${commit.hash}-${index}`} className="border-b border-[var(--color-border-muted)] px-3 py-2.5 last:border-b-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px] text-[var(--color-accent)]">{commit.shortHash}</span>
            <h3 className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-text-primary)]">{commit.message}</h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
            <span>{commit.authorName}</span>
            <span>·</span>
            <span>{formatTime(commit.timestamp)}</span>
            {showFileStats && "changes" in commit && fileSummary(commit) ? <><span>·</span><span>{fileSummary(commit)}</span></> : null}
            {"refs" in commit && commit.refs?.length ? <><span>·</span><span>{commit.refs.join(", ")}</span></> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function queryState<T>(query: { data?: T[]; error: unknown; isFetching: boolean }, hasRequest: boolean, emptyTitle: string, emptyDescription: string): QueryState<T> {
  return {
    data: query.data,
    error: query.error instanceof Error ? query.error : query.error ? new Error(String(query.error)) : null,
    isFetching: query.isFetching,
    hasRequest,
    emptyTitle,
    emptyDescription,
  };
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function boundedLimit(value: number) {
  return Math.min(Math.max(value, 1), 200);
}


function formatTime(value: string | null | undefined) {
  if (!value) return "unknown time";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function fileSummary(value: { changes?: Array<{ status: string; path: string; previousPath?: string | null }> }) {
  const changes = value.changes ?? [];
  if (changes.length === 0) return "";
  return changes
    .slice(0, 3)
    .map((change) => [change.status, change.path, change.previousPath ? `from ${change.previousPath}` : null].filter(Boolean).join(" "))
    .join(" · ");
}
