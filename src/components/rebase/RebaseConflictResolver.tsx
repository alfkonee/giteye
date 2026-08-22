import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  FileText,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  Wand2,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { gitApi } from "../../lib/tauri-api";
import { useAppStore } from "../../stores/app-store";
import type { RebaseTodoItem } from "../../types/git";
import { appDialog } from "../common/AppDialogProvider";
import { Button } from "../ui";


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

function todoItemsEqual(left: RebaseTodoItem[], right: RebaseTodoItem[]) {
  if (left.length !== right.length) return false;

  return left.every((item, index) => {
    const other = right[index];
    return item.action === other.action && item.commit === other.commit && item.message === other.message;
  });
}

function formatTodoDraftSummary(saved: RebaseTodoItem[], draft: RebaseTodoItem[]) {
  const maxLength = Math.max(saved.length, draft.length);
  const allChangedLines = Array.from({ length: maxLength }, (_, index) => {
    const previous = saved[index] ?? null;
    const item = draft[index] ?? null;
    if (previous && item && previous.action === item.action && previous.commit === item.commit && previous.message === item.message) {
      return null;
    }

    const before = previous ? `${index + 1}. ${previous.action} ${shortHash(previous.commit)} ${previous.message}` : `${index + 1}. <new>`;
    const after = item ? `${index + 1}. ${item.action} ${shortHash(item.commit)} ${item.message}` : `${index + 1}. <removed>`;
    return `${before}\n→ ${after}`;
  })
    .filter(Boolean);
  const changedLines = allChangedLines.slice(0, 8);

  if (changedLines.length === 0) {
    return "No todo changes detected.";
  }

  const overflow = allChangedLines.length > 8 ? `\n…plus ${allChangedLines.length - 8} more row(s).` : "";
  return `${changedLines.join("\n\n")}${overflow}`;
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
    <div className={`border-t border-[var(--color-border-muted)] px-3 py-2 text-xs ${!item.completed ? "bg-[var(--color-bg-selected-muted)]" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="w-6 shrink-0 text-right font-mono text-[var(--color-text-muted)]">{index + 1}</span>
        {item.completed ? (
          <span className="rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-[var(--color-text-muted)]">{item.action}</span>
        ) : (
          <select
            value={item.action}
            disabled={disabled}
            onChange={(event) => onActionChange?.(event.target.value)}
            className="w-[92px] shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-1.5 py-1 text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {REBASE_ACTIONS.map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
        )}
        <span className="ml-auto font-mono text-[var(--color-text-muted)]">{shortHash(item.commit)}</span>
        <span className="flex shrink-0 gap-0.5">
          <Button variant="ghost" size="sm" disabled={disabled || !canMoveUp || item.completed} onClick={() => onMove?.(-1)} aria-label={`Move ${item.message} up`}>↑</Button>
          <Button variant="ghost" size="sm" disabled={disabled || !canMoveDown || item.completed} onClick={() => onMove?.(1)} aria-label={`Move ${item.message} down`}>↓</Button>
        </span>
      </div>
      <p
        className={`mt-1 truncate pl-8 ${item.completed ? "text-[var(--color-text-muted)] line-through" : "text-[var(--color-text-secondary)]"}`}
        title={item.message}
      >
        {item.message}
      </p>
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
          : "Start or resume a rebase to load todo items, conflicted files, and conflict content.";

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2">
        <h1 className="text-base font-semibold tracking-tight">Rebase &amp; Conflict Resolver</h1>
        <span className="rounded bg-[var(--color-bg-surface)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
          {loading ? "Checking…" : "No active rebase"}
        </span>
      </header>
      <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto p-6">
        <div className="max-w-md text-center">
          <RefreshCw className="mx-auto h-10 w-10 text-[var(--color-text-muted)]" />
          <h2 className="mt-4 text-lg font-semibold">No rebase in progress</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{message}</p>
        </div>
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
  const [lastSavedTodo, setLastSavedTodo] = useState<RebaseTodoItem[]>([]);

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
    const nextTodo = rebaseState?.todo ?? [];
    setTodoDraft(nextTodo);
    setLastSavedTodo(nextTodo);
  }, [rebaseState?.todo]);
  const displayedConflictPath = selectedConflictPath ?? firstConflictPath;
  const conflictContentQuery = useQuery(gitQueries.conflictContent(activeRepoPath, displayedConflictPath));
  const { data: aiConfig } = useQuery(gitQueries.aiConfig());
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
  const [aiResolution, setAiResolution] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const aiResolutionMutation = useMutation({
    mutationFn: () => {
      if (!conflictContent) throw new Error("No conflict content loaded");
      return gitApi.resolveConflictWithAi(
        conflictContent.base,
        conflictContent.ours,
        conflictContent.theirs,
      );
    },
    onSuccess: (result) => {
      setAiResolution(result);
      setAiError(null);
    },
    onError: (error) => {
      setAiError(String(error));
      setAiResolution(null);
    },
  });
  const displayedCurrent = splitLines(conflictContent?.ours, conflictContentQuery.isLoading ? "Loading current version…" : "No current conflict content available.");
  const displayedIncoming = splitLines(conflictContent?.theirs, conflictContentQuery.isLoading ? "Loading incoming version…" : "No incoming conflict content available.");
  const displayedResult = splitLines(conflictContent?.result, conflictContentQuery.isLoading ? "Loading result version…" : "No result conflict content available.");
  const aiProviderLabel = aiConfig?.providers.find((provider) => provider.id === aiConfig.provider)?.label ?? "OpenAI";
  const totalSteps = rebaseState?.totalSteps ?? liveTodo.length;
  const currentStep = rebaseState?.currentStep ?? rebaseState?.done.length ?? 0;
  const conflictCount = displayedConflicts.length;
  const isActionPending = actions.continueRebase.isPending || actions.abortRebase.isPending || actions.skipRebase.isPending || actions.markFileResolved.isPending || actions.checkoutConflictSide.isPending || actions.updateTodo.isPending;
  const canMutateRebase = Boolean(activeRepoPath && hasLiveRebase);
  const canMarkResolved = canMutateRebase && Boolean(displayedConflictPath);
  const progressWidth = `${Math.min(100, Math.max(0, (currentStep / Math.max(totalSteps, 1)) * 100))}%`;
  const canEditTodo = canMutateRebase && !isActionPending && todoDraft.length > 0;
  const hasAutosquashItems = todoDraft.some((item) => autosquashDirective(item.message));
  const hasTodoDraftChanges = !todoItemsEqual(todoDraft, lastSavedTodo);

  const persistTodo = (nextTodo: RebaseTodoItem[]) => {
    if (!canEditTodo) {
      return;
    }

    setTodoDraft(nextTodo);
  };

  const applyTodoDraft = async () => {
    if (!canEditTodo || !hasTodoDraftChanges) {
      return;
    }

    const destructiveWarning = todoDraft.some((item) => item.action === "drop" || item.action === "exec")
      ? "\n\nWarning: this draft contains drop or exec actions. Review the preview before applying."
      : "";
    const confirmed = await appDialog.confirm(
      `Apply interactive rebase todo changes to Git?\n\n${formatTodoDraftSummary(lastSavedTodo, todoDraft)}${destructiveWarning}`,
      "Apply rebase plan?",
      "danger",
    );
    if (!confirmed) {
      return;
    }

    actions.updateTodo.mutate(todoDraft, {
      onSuccess: () => setLastSavedTodo(todoDraft),
    });
  };

  const revertTodoDraft = () => {
    if (!hasTodoDraftChanges || isActionPending) {
      return;
    }

    setTodoDraft(lastSavedTodo);
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

  const handleCheckoutConflictSide = async (side: "ours" | "theirs") => {
    if (!canMarkResolved || !displayedConflictPath) {
      return;
    }
    const sideLabel = side === "ours" ? "current" : "incoming";
    const confirmed = await appDialog.confirm(
      `Use the ${sideLabel} version for ${displayedConflictPath}?\n\nThis overwrites the result file with that side of the conflict and stages the file as resolved. Any manual edits currently in the result file will be lost.`,
      `Use ${sideLabel} version?`,
      "danger",
    );
    if (!confirmed) {
      return;
    }

    actions.checkoutConflictSide.mutate({ filePath: displayedConflictPath, side });
  };

  const confirmAndAbort = async () => {
    if (await appDialog.confirm(
      "Abort the active rebase?\n\nThis returns the repository to its pre-rebase state.",
      "Abort rebase?",
      "danger",
    )) {
      actions.abortRebase.mutate();
    }
  };

  const confirmAndSkip = async () => {
    if (await appDialog.confirm(
      "Skip this commit during the active rebase?\n\nThe commit changes will not be applied. Recovery: use the reflog/ORIG_HEAD if you need to inspect or recover the skipped state later.",
      "Skip commit?",
      "danger",
    )) {
      actions.skipRebase.mutate();
    }
  };

  const confirmAndContinue = async () => {
    if (conflictCount > 0) {
      return;
    }
    if (await appDialog.confirm(
      "Continue the active rebase now that no conflicts are reported?\n\nRecovery: if the result is wrong after completion, use ORIG_HEAD/reflog to create a recovery branch or reset back.",
      "Continue rebase?",
    )) {
      actions.continueRebase.mutate();
    }
  };

  if (!hasLiveRebase) {
    return <EmptyRebaseState activeRepoPath={activeRepoPath} loading={rebaseStateQuery.isLoading} error={rebaseStateQuery.error} />;
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="shrink-0 text-base font-semibold tracking-tight">Rebase &amp; Conflict Resolver</h1>
          <span className="shrink-0 rounded bg-[color:rgba(137,87,229,0.18)] px-2 py-0.5 text-xs text-[var(--color-purple)]">Rebasing</span>
          <span className="truncate text-xs text-[var(--color-text-secondary)]">
            {totalSteps} commit{totalSteps === 1 ? "" : "s"} onto{" "}
            <span className="font-mono">{rebaseState?.onto ?? "upstream"}</span> · step {currentStep}/{totalSteps} ·{" "}
            {conflictCount} conflict{conflictCount === 1 ? "" : "s"}
          </span>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-[var(--color-text-muted)]">{rebaseState?.headName ?? "current branch"}</span>
      </header>

      <div className="h-1 shrink-0 bg-[var(--color-bg-surface)]">
        <div className="h-1 bg-[var(--color-success)] transition-[width] duration-300" style={{ width: progressWidth }} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 xl:grid-cols-[minmax(320px,2fr)_minmax(0,3fr)] xl:overflow-hidden">
        <aside className="flex min-h-0 flex-col gap-3 xl:overflow-hidden">
          <section className="flex min-h-[220px] flex-1 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border-muted)] px-3 py-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <ListChecks className="h-4 w-4 text-[var(--color-text-muted)]" />
                Rebase plan
              </h2>
              <span className="flex items-center gap-1">
                <Button variant="ghost" size="sm" disabled={!canEditTodo || !hasAutosquashItems} onClick={applyAutosquash}>
                  Autosquash
                </Button>
                <Button variant="ghost" size="sm" disabled={!hasTodoDraftChanges || actions.updateTodo.isPending} onClick={revertTodoDraft}>
                  Revert
                </Button>
                <Button variant="primary" size="sm" disabled={!canEditTodo || !hasTodoDraftChanges || actions.updateTodo.isPending} onClick={applyTodoDraft}>
                  {actions.updateTodo.isPending ? "Applying…" : "Apply"}
                </Button>
              </span>
            </div>
            <div className="shrink-0 border-b border-[var(--color-border-muted)] px-3 py-1.5 text-[11px] text-[var(--color-text-muted)]">
              {completedTodo.length} completed · {todoDraft.length} to replay
              {hasTodoDraftChanges ? " · unsaved draft" : ""}
            </div>
            {hasTodoDraftChanges ? (
              <div className="shrink-0 border-b border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-1.5 text-[11px] text-[var(--color-warning)]">
                Draft changes stay local until you click Apply.
              </div>
            ) : null}
            {actions.updateTodo.error ? (
              <div className="shrink-0 border-b border-[var(--color-border-muted)] px-3 py-1.5 text-[11px] text-[var(--color-danger)]">
                {actions.updateTodo.error instanceof Error ? actions.updateTodo.error.message : String(actions.updateTodo.error)}
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {liveTodo.length > 0 ? (
                liveTodo.map((item, index) => {
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
                })
              ) : (
                <div className="p-4 text-sm text-[var(--color-text-muted)]">No rebase todo items returned.</div>
              )}
            </div>
            <div className="shrink-0 border-t border-[var(--color-border-muted)] px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
              Next: <span className="font-mono">{todoDraft[0]?.message ?? "waiting for next rebase step"}</span>
            </div>
          </section>

          <section className="shrink-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border-muted)] px-3 py-2">
              <h2 className="text-sm font-semibold">Conflicted files</h2>
              <span className="rounded bg-[var(--color-bg-surface)] px-1.5 text-xs text-[var(--color-text-muted)]">{conflictCount}</span>
            </div>
            <div className="max-h-44 overflow-y-auto p-2">
              {displayedConflicts.map((file) => (
                <button
                  key={file}
                  type="button"
                  onClick={() => setSelectedConflictPath(file)}
                  className={`mb-1 flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs last:mb-0 ${
                    file === displayedConflictPath
                      ? "border-[var(--color-border-accent)] bg-[var(--color-bg-selected-muted)] text-[var(--color-text-primary)]"
                      : "border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate font-mono">{file}</span>
                </button>
              ))}
              {displayedConflicts.length === 0 ? (
                <p className="px-2 py-3 text-center text-[11px] text-[var(--color-text-muted)]">
                  No conflicted files — continue the rebase when ready.
                </p>
              ) : null}
            </div>
          </section>
        </aside>

        <main className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
              <span className="truncate font-mono text-xs">{displayedConflictPath ?? "No conflicted file selected"}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" disabled={!canMarkResolved || isActionPending} onClick={() => handleCheckoutConflictSide("ours")}>
                Use current
              </Button>
              <Button variant="ghost" size="sm" disabled={!canMarkResolved || isActionPending} onClick={() => handleCheckoutConflictSide("theirs")}>
                Use incoming
              </Button>
              <Button variant="primary" size="sm" disabled={!canMarkResolved || isActionPending} onClick={handleMarkResolved}>
                {actions.markFileResolved.isPending ? "Marking…" : "Mark resolved"}
              </Button>
            </span>
          </div>

          {displayedConflictPath ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="grid grid-cols-1 lg:grid-cols-3">
                <DiffPane title="Current (HEAD)" rev={shortHash(rebaseState?.origHead)} lines={displayedCurrent} tone="deleted" />
                <DiffPane title={`Incoming (${rebaseState?.headName ?? "rebased commit"})`} rev={shortHash(rebaseState?.onto)} lines={displayedIncoming} tone="added" />
                <DiffPane title="Result (edited)" rev="" lines={displayedResult} tone="result" />
              </div>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 place-items-center p-8 text-center text-sm text-[var(--color-text-muted)]">
              Select a conflicted file to compare both sides.
            </div>
          )}

          <details className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
            <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm font-semibold hover:text-[var(--color-text-primary)]">
              <Bot className="h-4 w-4" />
              AI assistant
              <span className="rounded bg-[var(--color-bg-surface)] px-1.5 py-0.5 text-[11px] font-normal text-[var(--color-text-muted)]">
                {aiProviderLabel} · {aiConfig?.model ?? "gpt-4o-mini"}
              </span>
            </summary>
            <div className="border-t border-[var(--color-border-muted)] p-3 text-sm text-[var(--color-text-secondary)]">
              {aiError ? (
                <p className="text-[var(--color-danger)]">{aiError}</p>
              ) : aiResolution ? (
                <div>
                  <p className="text-[11px] text-[var(--color-success)]">AI generated resolution:</p>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-[var(--color-bg-surface)] p-3 font-mono text-xs text-[var(--color-text-primary)]">{aiResolution}</pre>
                </div>
              ) : (
                <>
                  <p>AI can help resolve this merge conflict.</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {aiConfig?.apiKeyConfigured ? `Using ${aiProviderLabel} · ${aiConfig.model}` : "Configure provider and API key in Settings."}
                  </p>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAiResolution(null);
                  setAiError(null);
                  aiResolutionMutation.mutate();
                }}
                disabled={!conflictContent || aiResolutionMutation.isPending}
                icon={<Wand2 className="h-4 w-4" />}
                className="mt-3"
              >
                {aiResolutionMutation.isPending ? "Generating…" : "Generate resolution"}
              </Button>
            </div>
          </details>
        </main>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2">
        <span className={`flex items-center gap-1.5 text-xs font-medium ${conflictCount > 0 ? "text-[var(--color-warning)]" : "text-[var(--color-success)]"}`}>
          <ShieldAlert className="h-4 w-4" />
          {conflictCount > 0
            ? `Resolve ${conflictCount} conflict${conflictCount === 1 ? "" : "s"} to continue`
            : "No conflicts — ready to continue"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="danger" disabled={!canMutateRebase || isActionPending} onClick={confirmAndAbort}>
            {actions.abortRebase.isPending ? "Aborting…" : "Abort rebase"}
          </Button>
          <Button variant="secondary" disabled={!canMutateRebase || isActionPending} onClick={confirmAndSkip}>
            {actions.skipRebase.isPending ? "Skipping…" : "Skip commit"}
          </Button>
          <Button variant="primary" disabled={!canMutateRebase || isActionPending || conflictCount > 0} onClick={confirmAndContinue}>
            {actions.continueRebase.isPending ? "Continuing…" : "Continue rebase"}
          </Button>
        </div>
      </footer>
    </section>
  );
}
