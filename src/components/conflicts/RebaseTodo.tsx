import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { gitApi } from "../../lib/tauri-api";
import { gitActionErrorMessage, invalidateGitState } from "../../lib/git-data";
import { todoEqual, useConflictStore } from "../../stores/conflict-store";
import type { RebaseTodoItem } from "../../types/git";
import { Button, Select } from "../ui";
import { appDialog } from "../common/AppDialogProvider";

const shortHash = (commit: string | null | undefined) =>
  commit ? commit.slice(0, 7) : "—";

const REBASE_ACTIONS = [
  "pick",
  "reword",
  "edit",
  "squash",
  "fixup",
  "exec",
  "break",
  "drop",
];

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

function updateTodoItem(
  items: RebaseTodoItem[],
  index: number,
  patch: Partial<Pick<RebaseTodoItem, "action" | "message">>,
) {
  return items.map((item, itemIndex) =>
    itemIndex === index ? { ...item, ...patch } : item,
  );
}

function moveTodoItem(
  items: RebaseTodoItem[],
  index: number,
  direction: -1 | 1,
) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }

  const next = [...items];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

function formatTodoDraftSummary(
  saved: RebaseTodoItem[],
  draft: RebaseTodoItem[],
) {
  const maxLength = Math.max(saved.length, draft.length);
  const allChangedLines = Array.from({ length: maxLength }, (_, index) => {
    const previous = saved[index] ?? null;
    const item = draft[index] ?? null;
    if (
      previous &&
      item &&
      previous.action === item.action &&
      previous.commit === item.commit &&
      previous.message === item.message
    ) {
      return null;
    }

    const before = previous
      ? `${index + 1}. ${previous.action} ${shortHash(previous.commit)} ${previous.message}`
      : `${index + 1}. <new>`;
    const after = item
      ? `${index + 1}. ${item.action} ${shortHash(item.commit)} ${item.message}`
      : `${index + 1}. <removed>`;
    return `${before}\n→ ${after}`;
  }).filter(Boolean);
  const changedLines = allChangedLines.slice(0, 8);

  if (changedLines.length === 0) {
    return "No todo changes detected.";
  }

  const overflow =
    allChangedLines.length > 8
      ? `\n…plus ${allChangedLines.length - 8} more row(s).`
      : "";
  return `${changedLines.join("\n\n")}${overflow}`;
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
    <div
      className={`border-t border-[var(--color-border-muted)] px-3 py-2 text-xs ${!item.completed ? "bg-[var(--color-bg-selected-muted)]" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className="w-6 shrink-0 text-right font-mono text-[var(--color-text-muted)]">
          {index + 1}
        </span>
        {item.completed ? (
          <span className="rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-[var(--color-text-muted)]">
            {item.action}
          </span>
        ) : (
          <Select
            value={item.action}
            disabled={disabled}
            onValueChange={(action) => onActionChange?.(action)}
            options={REBASE_ACTIONS.map((action) => ({
              value: action,
              label: action,
            }))}
            size="sm"
            className="w-[92px] shrink-0"
            ariaLabel={`Action for ${item.message}`}
          />
        )}
        <span className="ml-auto font-mono text-[var(--color-text-muted)]">
          {shortHash(item.commit)}
        </span>
        <span className="flex shrink-0 gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || !canMoveUp || item.completed}
            onClick={() => onMove?.(-1)}
            aria-label={`Move ${item.message} up`}
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || !canMoveDown || item.completed}
            onClick={() => onMove?.(1)}
            aria-label={`Move ${item.message} down`}
          >
            ↓
          </Button>
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

export function RebaseTodo({
  repoPath,
  disabled,
}: {
  repoPath: string;
  disabled: boolean;
}) {
  const session = useConflictStore((state) => state.sessions[repoPath]);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: async (items: RebaseTodoItem[]) => {
      const snapshot = await gitApi.getOperationSummary(repoPath);
      if (
        !session ||
        snapshot.id !== session.operationId ||
        !todoEqual(snapshot.rebase.todo, session.todoSaved)
      ) {
        throw new Error(
          "The rebase plan changed externally. Revert the draft to the latest plan before applying.",
        );
      }
      await gitApi.updateRebaseTodo(repoPath, items);
    },
    onMutate: () =>
      useConflictStore
        .getState()
        .updateSession(repoPath, (current) => ({ ...current, pending: true })),
    onSuccess: async (_result, items) => {
      useConflictStore
        .getState()
        .updateSession(repoPath, (current) => ({
          ...current,
          todoSaved: items,
        }));
      await invalidateGitState(queryClient, repoPath);
    },
    onError: (cause) => setError(gitActionErrorMessage(cause)),
    onSettled: () =>
      useConflictStore
        .getState()
        .updateSession(repoPath, (current) => ({ ...current, pending: false })),
  });
  if (!session || !session.snapshot.rebase.inProgress) return null;
  const draft = session.todoDraft;
  const done = session.snapshot.rebase.done;
  const dirty = !todoEqual(draft, session.todoSaved);
  const pending = disabled || update.isPending;
  const setDraft = (items: RebaseTodoItem[]) =>
    useConflictStore
      .getState()
      .updateSession(repoPath, (current) => ({ ...current, todoDraft: items }));
  const apply = async () => {
    if (pending || !dirty) return;
    if (
      !(await appDialog.confirm(
        `Apply rebase todo changes?\n\n${formatTodoDraftSummary(session.todoSaved, draft)}${draft.some((item) => item.action === "drop" || item.action === "exec") ? "\n\nWarning: drop removes commits; exec runs commands." : ""}`,
        "Apply rebase plan?",
        "danger",
      ))
    )
      return;
    setError(null);
    update.mutate(draft);
  };
  return (
    <details className="border-b border-[var(--color-border)]">
      <summary className="cursor-pointer p-3 font-semibold text-xs">
        Rebase plan · {done.length} done · {draft.length} remaining
        {dirty ? " · unsaved" : ""}
      </summary>
      <div className="flex flex-wrap gap-1 px-2 pb-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={
            pending || !draft.some((item) => autosquashDirective(item.message))
          }
          onClick={() => setDraft(autosquashTodo(draft))}
        >
          Autosquash
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending || !dirty}
          onClick={() => {
            setError(null);
            useConflictStore
              .getState()
              .updateSession(repoPath, (current) => ({
                ...current,
                todoDraft: current.snapshot.rebase.todo,
                todoSaved: current.snapshot.rebase.todo,
              }));
          }}
        >
          Revert draft
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={pending || !dirty}
          onClick={() => void apply()}
        >
          Apply plan
        </Button>
      </div>
      {error && (
        <p role="alert" className="p-2 text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}
      <div className="max-h-72 overflow-auto">
        {[...done, ...draft].map((item, index) => {
          const draftIndex = index - done.length;
          return (
            <TodoRow
              key={`${item.commit}:${index}`}
              item={item}
              index={index}
              disabled={pending || draftIndex < 0}
              canMoveUp={draftIndex > 0}
              canMoveDown={draftIndex >= 0 && draftIndex < draft.length - 1}
              onActionChange={(action) =>
                setDraft(updateTodoItem(draft, draftIndex, { action }))
              }
              onMove={(direction) =>
                setDraft(moveTodoItem(draft, draftIndex, direction))
              }
            />
          );
        })}
      </div>
    </details>
  );
}
