import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileText,
  GitCommitVertical,
  ListChecks,
  MoreHorizontal,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { useAppStore } from "../../stores/app-store";
import type { RebaseTodoItem } from "../../types/git";

const splitLines = (content: string | null | undefined, emptyMessage: string) => {
  if (!content) {
    return [emptyMessage];
  }

  return content.split(/\r?\n/);
};

const shortHash = (commit: string | null | undefined) => (commit ? commit.slice(0, 7) : "—");

const REBASE_ACTIONS = ["pick", "reword", "edit", "squash", "fixup", "exec", "break", "drop"];

const normalizeSubject = (message: string) =>
  message
    .replace(/^(fixup|squash|amend)!\s+/i, "")
    .replace(/^\[[^\]]+\]\s*/, "")
    .trim()
    .toLowerCase();

const autosquashDirective = (message: string) => {
  const match = /^(fixup|squash|amend)!\s+(.+)$/i.exec(message.trim());
  if (!match) return null;

  return {
    action: match[1].toLowerCase() === "squash" ? "squash" : "fixup",
    target: normalizeSubject(match[2]),
  };
};

function autosquashTodo(items: RebaseTodoItem[]) {
  const decorated = items.map((item, index) => {
    const directive = autosquashDirective(item.message);
    return {
      item: directive ? { ...item, action: directive.action } : item,
      index,
      directive,
      placed: false,
    };
  });

  const result: RebaseTodoItem[] = [];
  for (const entry of decorated) {
    if (entry.directive) continue;

    entry.placed = true;
    result.push(entry.item);

    const subject = normalizeSubject(entry.item.message);
    for (const candidate of decorated) {
      if (!candidate.placed && candidate.directive?.target === subject) {
        candidate.placed = true;
        result.push(candidate.item);
      }
    }
  }

  for (const entry of decorated) {
    if (!entry.placed) {
      entry.placed = true;
      result.push(entry.item);
    }
  }

  return result;
}

function updateTodoItem(items: RebaseTodoItem[], index: number, patch: Partial<Pick<RebaseTodoItem, "action" | "message">>) {
  return items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
}

function moveTodoItem(items: RebaseTodoItem[], index: number, direction: -1 | 1) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }

  const next = [...items];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

function DiffPane({ title, rev, lines, tone }: { title: string; rev: string; lines: string[]; tone: "deleted" | "added" | "result" }) {
  const color = tone === "deleted" ? "var(--color-deleted-bg)" : tone === "added" ? "rgba(88,166,255,0.12)" : "var(--color-added-bg)";
  return (
    <div className="min-w-0 overflow-hidden border-r border-[var(--color-border-muted)] last:border-r-0">
      <div className="flex items-center justify-between border-b border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs"><b>{title}</b><span className="font-mono text-[var(--color-text-muted)]">{rev}</span></div>
      <div className="font-mono text-[12px] leading-6">
        {lines.map((line, index) => {
          const conflict = line.startsWith("<<<<<<<") || line.startsWith("=======") || line.startsWith(">>>>>>>");
          return <div key={`${title}-${index}`} className="grid grid-cols-[38px_1fr]" style={{ background: conflict ? color : undefined }}><span className="border-r border-[var(--color-border-muted)] pr-2 text-right text-[var(--color-text-muted)]">{index + 1}</span><span className="overflow-hidden whitespace-pre px-3 text-[var(--color-text-secondary)]">{line}</span></div>;
        })}
      </div>
    </div>
  );
}

function ActionPill({ label, active }: { label: string; active?: boolean }) {
  return <button className={`rounded-md border px-2 py-1 text-xs ${active ? "border-[var(--color-accent)] bg-[var(--color-bg-selected)]/20 text-[var(--color-accent)]" : "border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"}`}>{label}</button>;
}

function TodoRow({
  item,
  index,
  disabled,
  canMoveUp,
  canMoveDown,
  onActionChange,
  onMove,
}: {
  item: RebaseTodoItem;
  index: number;
  disabled?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onActionChange?: (action: string) => void;
  onMove?: (direction: -1 | 1) => void;
}) {
  return (
    <div className={`grid grid-cols-[28px_84px_minmax(0,1fr)_54px_72px] items-center gap-2 border-t border-[var(--color-border-muted)] px-4 py-3 text-xs ${!item.completed ? "bg-[var(--color-bg-selected)]/15" : ""}`}>
      <span className="font-mono text-[var(--color-text-muted)]">{index + 1}</span>
      {item.completed ? (
        <span className="rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-[var(--color-text-muted)]">{item.action}</span>
      ) : (
        <select
          value={item.action}
          disabled={disabled}
          onChange={(event) => onActionChange?.(event.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {REBASE_ACTIONS.map((action) => <option key={action} value={action}>{action}</option>)}
        </select>
      )}
      <span className={`truncate px-2 ${item.completed ? "text-[var(--color-text-muted)] line-through" : "text-[var(--color-text-secondary)]"}`}>{item.message}</span>
      <span className="font-mono text-[var(--color-text-muted)]">{shortHash(item.commit)}</span>
      <span className="flex justify-end gap-1">
        <button type="button" disabled={disabled || !canMoveUp || item.completed} onClick={() => onMove?.(-1)} className="rounded border border-[var(--color-border)] px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40">↑</button>
        <button type="button" disabled={disabled || !canMoveDown || item.completed} onClick={() => onMove?.(1)} className="rounded border border-[var(--color-border)] px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40">↓</button>
      </span>
    </div>
  );
}

function EmptyRebaseState({ activeRepoPath, loading, error }: { activeRepoPath: string | null; loading: boolean; error: unknown }) {
  const message = !activeRepoPath
    ? "Open a repository to inspect rebase state."
    : loading
      ? "Checking repository rebase state…"
      : error instanceof Error
        ? error.message
        : error
          ? String(error)
          : "No active rebase detected.";

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
        <div><div className="flex items-center gap-2"><h1 className="text-xl font-semibold tracking-tight">Rebase &amp; Conflict Resolver</h1><span className="rounded bg-[var(--color-bg-surface)] px-2 py-1 text-xs text-[var(--color-text-muted)]">No active rebase detected</span></div><p className="text-sm text-[var(--color-text-secondary)]">{message}</p></div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(700px,1fr)_300px] gap-3 p-3">
        <main className="grid place-items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 shadow-[var(--shadow-panel)]">
          <div className="max-w-md text-center"><RefreshCw className="mx-auto h-10 w-10 text-[var(--color-text-muted)]" /><h2 className="mt-4 text-lg font-semibold">No rebase in progress</h2><p className="mt-2 text-sm text-[var(--color-text-muted)]">Start or resume a rebase in this repository to load todo items, conflicted files, and conflict content.</p></div>
        </main>
        <aside className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]"><div className="mb-3 flex items-center gap-2 font-semibold"><Bot className="h-5 w-5" /> AI Assistant <span className="rounded bg-[var(--color-bg-surface)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">Beta</span></div><div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4 text-sm text-[var(--color-text-secondary)]"><p>AI conflict assistance shell is available here.</p><p className="mt-3">No assistant analysis, recommendations, or apply actions are wired in this view.</p><button disabled className="mt-4 inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-xs text-[var(--color-text-muted)]"><Wand2 className="h-4 w-4" /> Generate resolution</button></div></aside>
      </div>
    </section>
  );
}

export function RebaseConflictResolver() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const queryClient = useQueryClient();
  const rebaseStateQuery = useQuery(gitQueries.rebaseState(activeRepoPath));
  const rebaseState = rebaseStateQuery.data;
  const hasLiveRebase = Boolean(rebaseState?.inProgress);
  const liveConflictFiles = rebaseState?.conflicts ?? [];
  const selectedConflictPath = useAppStore((s) => s.selectedConflictPath);
  const setSelectedConflictPath = useAppStore((s) => s.setSelectedConflictPath);
  const firstConflictPath = liveConflictFiles[0]?.path ?? null;
  const [todoDraft, setTodoDraft] = useState<RebaseTodoItem[]>([]);

  useEffect(() => {
    if (!hasLiveRebase) {
      setSelectedConflictPath(null);
      return;
    }

    if (!selectedConflictPath || !liveConflictFiles.some((file) => file.path === selectedConflictPath)) {
      setSelectedConflictPath(firstConflictPath);
    }
  }, [firstConflictPath, hasLiveRebase, liveConflictFiles, selectedConflictPath, setSelectedConflictPath]);

  useEffect(() => {
    setTodoDraft(rebaseState?.todo ?? []);
  }, [rebaseState?.todo]);
  const displayedConflictPath = selectedConflictPath ?? firstConflictPath;
  const conflictContentQuery = useQuery(gitQueries.conflictContent(activeRepoPath, displayedConflictPath));
  const actions = {
    continueRebase: useMutation(gitMutations.continueRebase(queryClient, activeRepoPath)),
    abortRebase: useMutation(gitMutations.abortRebase(queryClient, activeRepoPath)),
    skipRebase: useMutation(gitMutations.skipRebase(queryClient, activeRepoPath)),
    markFileResolved: useMutation(gitMutations.markFileResolved(queryClient, activeRepoPath)),
    checkoutConflictSide: useMutation(gitMutations.checkoutConflictSide(queryClient, activeRepoPath)),
    updateTodo: useMutation(gitMutations.updateRebaseTodo(queryClient, activeRepoPath)),
  };
  const completedTodo = rebaseState?.done ?? [];
  const liveTodo = useMemo(() => [...completedTodo, ...todoDraft], [completedTodo, todoDraft]);
  const displayedConflicts = liveConflictFiles.map((file) => file.path);
  const conflictContent = conflictContentQuery.data;
  const displayedCurrent = splitLines(conflictContent?.ours, conflictContentQuery.isLoading ? "Loading current version…" : "No current conflict content available.");
  const displayedIncoming = splitLines(conflictContent?.theirs, conflictContentQuery.isLoading ? "Loading incoming version…" : "No incoming conflict content available.");
  const displayedResult = splitLines(conflictContent?.result, conflictContentQuery.isLoading ? "Loading result version…" : "No result conflict content available.");
  const totalSteps = rebaseState?.totalSteps ?? liveTodo.length;
  const currentStep = rebaseState?.currentStep ?? rebaseState?.done.length ?? 0;
  const conflictCount = displayedConflicts.length;
  const isActionPending = actions.continueRebase.isPending || actions.abortRebase.isPending || actions.skipRebase.isPending || actions.markFileResolved.isPending || actions.checkoutConflictSide.isPending || actions.updateTodo.isPending;
  const canMutateRebase = Boolean(activeRepoPath && hasLiveRebase);
  const canMarkResolved = canMutateRebase && Boolean(displayedConflictPath);
  const progressWidth = `${Math.min(100, Math.max(0, (currentStep / Math.max(totalSteps, 1)) * 100))}%`;
  const canEditTodo = canMutateRebase && !isActionPending && todoDraft.length > 0;
  const hasAutosquashItems = todoDraft.some((item) => autosquashDirective(item.message));

  const persistTodo = (nextTodo: RebaseTodoItem[]) => {
    if (!canMutateRebase || actions.updateTodo.isPending) {
      return;
    }

    setTodoDraft(nextTodo);
    actions.updateTodo.mutate(nextTodo);
  };

  const changeTodoAction = (index: number, action: string) => {
    persistTodo(updateTodoItem(todoDraft, index, { action }));
  };

  const moveTodo = (index: number, direction: -1 | 1) => {
    persistTodo(moveTodoItem(todoDraft, index, direction));
  };

  const applyAutosquash = () => {
    persistTodo(autosquashTodo(todoDraft));
  };

  const handleMarkResolved = () => {
    if (!canMarkResolved || !displayedConflictPath) {
      return;
    }

    actions.markFileResolved.mutate(displayedConflictPath);
  };

  const handleCheckoutConflictSide = (side: "ours" | "theirs") => {
    if (!canMarkResolved || !displayedConflictPath) {
      return;
    }

    actions.checkoutConflictSide.mutate({ filePath: displayedConflictPath, side });
  };

  const confirmAndAbort = () => {
    if (window.confirm("Abort the active rebase? This returns the repository to its pre-rebase state.")) {
      actions.abortRebase.mutate();
    }
  };

  const confirmAndSkip = () => {
    if (window.confirm("Skip this commit during the active rebase? The commit changes will not be applied.")) {
      actions.skipRebase.mutate();
    }
  };

  const confirmAndContinue = () => {
    if (conflictCount > 0) {
      return;
    }
    if (window.confirm("Continue the active rebase now that no conflicts are reported?")) {
      actions.continueRebase.mutate();
    }
  };

  if (!hasLiveRebase) {
    return <EmptyRebaseState activeRepoPath={activeRepoPath} loading={rebaseStateQuery.isLoading} error={rebaseStateQuery.error} />;
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
        <div><div className="flex items-center gap-2"><h1 className="text-xl font-semibold tracking-tight">Rebase &amp; Conflict Resolver</h1><span className="rounded bg-[color:rgba(137,87,229,0.18)] px-2 py-1 text-xs text-purple-400">Rebasing</span></div><p className="text-sm text-[var(--color-text-secondary)]">You&apos;re rebasing {totalSteps} commits onto <span className="font-mono">{rebaseState?.onto ?? "upstream"}</span></p></div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-2 text-xs"><span className="text-[var(--color-text-muted)]">Branch:</span><ActionPill label={rebaseState?.headName ?? "current branch"} active /><span className="text-[var(--color-text-muted)]">Onto: {rebaseState?.onto ?? "upstream"}</span></div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[350px_minmax(700px,1fr)_300px] gap-3 p-3">
        <aside className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border-muted)] px-4 py-3"><h2 className="font-semibold">Interactive rebase todo</h2><ListChecks className="h-4 w-4 text-[var(--color-text-muted)]" /></div>
            <div className="flex items-center justify-between px-4 py-3 text-xs text-[var(--color-text-secondary)]">
              <span>{completedTodo.length} completed · {todoDraft.length} remaining</span>
              <button
                type="button"
                disabled={!canEditTodo || !hasAutosquashItems}
                onClick={applyAutosquash}
                className="rounded bg-[var(--color-bg-surface)] px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actions.updateTodo.isPending ? "Saving…" : "Autosquash"}
              </button>
            </div>
            {actions.updateTodo.error ? <div className="border-t border-[var(--color-border-muted)] px-4 py-2 text-xs text-[var(--color-danger)]">{actions.updateTodo.error instanceof Error ? actions.updateTodo.error.message : String(actions.updateTodo.error)}</div> : null}
            {liveTodo.length > 0 ? liveTodo.map((item, index) => {
              const draftIndex = index - completedTodo.length;
              const isDraftItem = draftIndex >= 0;
              return (
                <TodoRow
                  key={item.raw || `${item.commit}-${index}`}
                  item={item}
                  index={index}
                  disabled={!canEditTodo || !isDraftItem}
                  canMoveUp={isDraftItem && draftIndex > 0}
                  canMoveDown={isDraftItem && draftIndex < todoDraft.length - 1}
                  onActionChange={(action) => changeTodoAction(draftIndex, action)}
                  onMove={(direction) => moveTodo(draftIndex, direction)}
                />
              );
            }) : <div className="border-t border-[var(--color-border-muted)] p-4 text-sm text-[var(--color-text-muted)]">No rebase todo items returned.</div>}
            <div className="border-t border-[var(--color-border-muted)] p-4"><div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-3"><div className="text-xs text-[var(--color-text-muted)]">Next commit</div><p className="mt-2 font-mono text-sm">{todoDraft[0]?.message ?? "Waiting for next rebase step"}</p></div><p className="mt-3 text-xs text-[var(--color-text-muted)]">Action changes, reorders, drops, and autosquash write the live git-rebase-todo file.</p></div>
          </section>

          <section className="min-h-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border-muted)] px-4 py-3"><h2 className="font-semibold">Conflicted files <span className="rounded bg-[var(--color-bg-surface)] px-2 text-xs">{conflictCount}</span></h2><MoreHorizontal className="h-4 w-4" /></div>
            <div className="p-3">{displayedConflicts.map((file) => <button key={file} type="button" onClick={() => setSelectedConflictPath(file)} className={`mb-2 flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm ${file === displayedConflictPath ? "border-[var(--color-accent)] bg-[var(--color-bg-selected)]/15 text-[var(--color-accent)]" : "border-transparent text-[var(--color-text-secondary)]"}`}><FileText className="h-4 w-4" /><span className="flex-1 truncate">{file}</span><span className="rounded bg-[var(--color-accent)] px-1.5 text-xs text-white">1</span></button>)}{displayedConflicts.length === 0 && <div className="rounded-md border border-[var(--color-border-muted)] p-4 text-sm text-[var(--color-text-muted)]">No conflicted files reported.</div>}</div>
          </section>
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4"><div className="text-sm font-semibold">Rebasing onto {rebaseState?.onto ?? "upstream"}</div><div className="mt-1 text-sm text-[var(--color-text-secondary)]">Step {currentStep} of {totalSteps} ({conflictCount} conflict{conflictCount === 1 ? "" : "s"})</div><div className="mt-3 h-2 rounded-full bg-[var(--color-bg-surface)]"><div className="h-2 rounded-full bg-[var(--color-success)]" style={{ width: progressWidth }} /></div></section>
        </aside>

        <main className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3"><div className="flex items-center gap-2"><FileText className="h-4 w-4" /><span className="font-semibold">{displayedConflictPath ?? "No conflicted file selected"}</span><span className="rounded bg-[color:rgba(210,153,34,0.18)] px-2 py-1 text-xs text-[var(--color-warning)]">{conflictCount} conflict{conflictCount === 1 ? "" : "s"}</span></div><div className="flex items-center gap-2"><button disabled={!canMarkResolved || isActionPending} onClick={() => handleCheckoutConflictSide("ours")} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50">Use current</button><button disabled={!canMarkResolved || isActionPending} onClick={() => handleCheckoutConflictSide("theirs")} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50">Use incoming</button><button disabled={!canMarkResolved || isActionPending} onClick={handleMarkResolved} className="rounded-md bg-[var(--color-accent)] px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Mark resolved</button></div></div>
          {displayedConflictPath ? <div className="grid min-h-0 flex-1 grid-cols-3 overflow-auto"><DiffPane title="Current (HEAD)" rev={shortHash(rebaseState?.origHead)} lines={displayedCurrent} tone="deleted" /><DiffPane title={`Incoming (${rebaseState?.headName ?? "rebased commit"})`} rev={shortHash(rebaseState?.onto)} lines={displayedIncoming} tone="added" /><DiffPane title="Result (edited)" rev="" lines={displayedResult} tone="result" /></div> : <div className="grid min-h-0 flex-1 place-items-center p-6 text-sm text-[var(--color-text-muted)]">No conflict content to display.</div>}
          <section className="grid border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] md:grid-cols-[1.1fr_0.9fr]">
            <div className="border-r border-[var(--color-border)] p-3"><div className="mb-3 flex gap-4 text-sm"><b>Conflict workflow</b><span className="text-[var(--color-text-secondary)]">Commit Message</span></div><div className="mb-3 flex items-center gap-2 text-sm text-[var(--color-warning)]"><AlertTriangle className="h-4 w-4" /> Review the result pane, mark resolved, then continue.</div>{[["Inspect current changes", "Compare the HEAD side of the conflict", true], ["Inspect incoming changes", "Compare the rebased commit side", false], ["Edit result in your editor", "Save the resolved file before continuing", false]].map(([title, body, active]) => <div key={title as string} className={`mb-2 flex items-center gap-3 rounded-lg border p-3 text-sm ${active ? "border-[var(--color-accent)] bg-[var(--color-bg-selected)]/15" : "border-[var(--color-border-muted)]"}`}><CheckCircle2 className={active ? "h-4 w-4 text-[var(--color-accent)]" : "h-4 w-4 text-[var(--color-text-muted)]"} /><div><div>{title}</div><div className="text-xs text-[var(--color-text-muted)]">{body}</div></div></div>)}</div>
            <div className="p-3"><div className="mb-3 flex items-center gap-2 font-semibold"><Bot className="h-5 w-5" /> AI Assistant <span className="rounded bg-[var(--color-bg-surface)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">Beta</span></div><div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4 text-sm text-[var(--color-text-secondary)]"><p>AI conflict assistance shell is available here.</p><p className="mt-3">No assistant analysis, recommendations, or apply actions are wired in this view.</p><button disabled className="mt-4 inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-xs text-[var(--color-text-muted)]"><Wand2 className="h-4 w-4" /> Generate resolution</button></div></div>
          </section>
        </main>

        <aside className="min-h-0 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
          <h2 className="mb-4 font-semibold">Rebase preview</h2>
          <div className="border-l border-[var(--color-accent)]/60 pl-4"><div className="mb-4 text-xs text-[var(--color-text-muted)]">Before rebase ({rebaseState?.headName ?? "current branch"})</div>{liveTodo.length > 0 ? liveTodo.map((item, index) => <div key={`before-${item.commit}-${index}`} className="mb-4 flex items-center gap-3 text-xs"><GitCommitVertical className="h-4 w-4 text-[var(--color-accent)]" /><span className="flex-1 truncate">{item.message}</span><span className="font-mono text-[var(--color-text-muted)]">{shortHash(item.commit)}</span></div>) : <p className="mb-4 text-xs text-[var(--color-text-muted)]">No commits returned.</p>}</div>
          <div className="border-l border-[var(--color-success)]/70 pl-4"><div className="mb-4 text-xs text-[var(--color-text-muted)]">After rebase (onto {rebaseState?.onto ?? "upstream"})</div>{liveTodo.length > 0 ? liveTodo.map((item, index) => <div key={`after-${item.message}-${index}`} className={`mb-4 flex items-center gap-3 text-xs ${item.action === "drop" ? "text-[var(--color-deleted)]" : ""}`}><GitCommitVertical className={`h-4 w-4 ${item.action === "drop" ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`} /><span className="flex-1 truncate">{item.message}</span><span className="font-mono text-[var(--color-text-muted)]">{item.action}</span></div>) : <p className="mb-4 text-xs text-[var(--color-text-muted)]">No commits returned.</p>}</div>
          <div className="mt-6 space-y-3 border-t border-[var(--color-border)] pt-4 text-sm"><p className="text-[var(--color-warning)]"><Sparkles className="mr-2 inline h-4 w-4" />{conflictCount} conflicted file{conflictCount === 1 ? "" : "s"}</p><p className="text-[var(--color-danger)]"><XCircle className="mr-2 inline h-4 w-4" />Resolve or skip the current commit</p><p><RefreshCw className="mr-2 inline h-4 w-4" />{liveTodo.length} commits will be rebased</p></div>
        </aside>
      </div>

      <footer className="grid grid-cols-[220px_1fr_auto] items-center gap-4 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
        <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-3"><RefreshCw className="h-6 w-6 text-[var(--color-accent)]" /><div><div className="font-semibold">Rebase in progress</div><div className="text-xs text-[var(--color-text-muted)]">On commit {currentStep} of {totalSteps}</div></div></div>
        <div className="flex items-center justify-center gap-2 text-sm font-semibold text-[var(--color-warning)]"><ShieldAlert className="h-5 w-5" /> {conflictCount > 0 ? "Resolve all conflicts to continue" : "No conflicts reported; ready to continue"}</div>
        <div className="flex items-center gap-3"><button disabled={!canMutateRebase || isActionPending} onClick={confirmAndAbort} className="rounded-md border border-[var(--color-danger)]/60 px-5 py-2.5 text-sm font-semibold text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-50">{actions.abortRebase.isPending ? "Aborting…" : "Abort Rebase"}</button><button disabled={!canMutateRebase || isActionPending} onClick={confirmAndSkip} className="rounded-md border border-[var(--color-border)] px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50">{actions.skipRebase.isPending ? "Skipping…" : "Skip Commit"}</button><button disabled={!canMarkResolved || isActionPending} onClick={handleMarkResolved} className="rounded-md border border-[var(--color-border)] px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50">{actions.markFileResolved.isPending ? "Marking…" : "Mark Resolved"}</button><button disabled={!canMutateRebase || isActionPending || conflictCount > 0} onClick={confirmAndContinue} className="rounded-md bg-[var(--color-success)] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{actions.continueRebase.isPending ? "Continuing…" : "Continue Rebase"}</button></div>
      </footer>
    </section>
  );
}
