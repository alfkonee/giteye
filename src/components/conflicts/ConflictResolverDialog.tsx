import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openPath } from "@tauri-apps/plugin-opener";
import { X, RefreshCw, ExternalLink } from "lucide-react";
import { gitApi } from "../../lib/tauri-api";
import {
  gitActionErrorMessage,
  gitKeys,
  gitMutations,
  gitQueries,
  invalidateGitState,
} from "../../lib/git-data";
import { useAppStore } from "../../stores/app-store";
import { WORKING_TREE_COMMIT_HASH } from "../../lib/working-tree-node";
import {
  sessionHasDrafts,
  useConflictStore,
} from "../../stores/conflict-store";
import { isTerminalStatus, useJobStore } from "../../stores/job-store";
import type {
  ConflictResolution,
  ConflictStage,
  OperationAction,
  OperationSnapshot,
} from "../../types/git";
import { Button } from "../ui";
import { appDialog } from "../common/AppDialogProvider";
import { DiffViewer } from "../diff-viewer/DiffViewer";
import { ConflictEditor } from "./ConflictEditor";
import { ConflictAiReview } from "./ConflictAiReview";
import { RebaseTodo } from "./RebaseTodo";
import {
  applyRegion,
  conflictRegions,
  resultPatch,
  type RegionChoice,
} from "./conflict-text";

export function ConflictResolverDialog({
  repoPath,
  snapshot,
}: {
  repoPath: string;
  snapshot: OperationSnapshot | undefined;
}) {
  const open = useConflictStore((state) =>
    Boolean(state.openRepositories[repoPath]),
  );
  useEffect(() => {
    if (!snapshot) return;
    const store = useConflictStore.getState();
    if (store.sessions[repoPath]?.operationId !== snapshot.id)
      store.cancelQueue(repoPath);
    store.sync(repoPath, snapshot);
    if (snapshot.id && store.autoOpened[repoPath] !== snapshot.id) {
      useConflictStore.setState((state) => ({
        autoOpened: { ...state.autoOpened, [repoPath]: snapshot.id! },
      }));
      store.open(repoPath);
    }
  }, [repoPath, snapshot]);
  if (!open) return null;
  return (
    <ResolverContents key={repoPath} repoPath={repoPath} snapshot={snapshot} />
  );
}

function ResolverContents({
  repoPath,
  snapshot,
}: {
  repoPath: string;
  snapshot: OperationSnapshot | undefined;
}) {
  const session = useConflictStore((state) => state.sessions[repoPath]);
  const jobPending = useJobStore((state) =>
    Object.values(state.jobsById).some(
      (job) => job.repoPath === repoPath && !isTerminalStatus(job.status),
    ),
  );
  const queryClient = useQueryClient();
  const setActiveRepoPath = useAppStore((state) => state.setActiveRepoPath);
  const section = useRef<HTMLElement>(null);
  const mutationLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBase, setShowBase] = useState(false);
  const [review, setReview] = useState<"saved" | "external" | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [navigationRequest, setNavigationRequest] = useState(0);
  const operationAction = useMutation(
    gitMutations.operationAction(queryClient, repoPath),
  );
  const openRepository = useMutation(
    gitMutations.openRepository(queryClient, setActiveRepoPath),
  );
  const { data: repository } = useQuery(
    gitQueries.repositorySnapshot(repoPath),
  );
  const selectedPath = session?.selectedPath ?? null;
  const file = selectedPath ? session?.files[selectedPath] : undefined;
  const content = file?.content;
  const pending =
    busy ||
    jobPending ||
    Boolean(session?.pending) ||
    operationAction.isPending ||
    openRepository.isPending;
  const staleOperation = Boolean(
    session && snapshot && session.operationId !== snapshot.id,
  );
  const canEdit = !pending && !staleOperation;
  const text = file?.resolution?.kind === "text" ? file.resolution.content : "";
  const regions = useMemo(() => conflictRegions(text), [text]);
  const activeRegion = Math.min(
    file?.activeRegion ?? 0,
    Math.max(0, regions.length - 1),
  );
  const navigateRegion = (index: number) => {
    if (!selectedPath || !regions.length) return;
    const next = (index + regions.length) % regions.length;
    useConflictStore.getState().updateFile(repoPath, selectedPath, (draft) => ({
      ...draft,
      activeRegion: next,
    }));
    setNavigationRequest((value) => value + 1);
  };
  const resolveRegion = (index: number, choice: RegionChoice) => {
    if (!selectedPath) return;
    const result = applyRegion(text, regions[index], choice);
    useConflictStore.getState().updateFile(repoPath, selectedPath, (draft) => ({
      ...draft,
      activeRegion: index,
    }));
    change({ kind: "text", content: result });
    setNavigationRequest((value) => value + 1);
  };
  const patch = useMemo(
    () =>
      review
        ? resultPatch(
            selectedPath ?? "result",
            review === "external"
              ? (file?.external?.result ?? "")
              : (content?.result ?? ""),
            text,
          )
        : "",
    [selectedPath, review, file?.external?.result, content?.result, text],
  );
  const operation = session?.snapshot;
  const navigateFile = (direction: -1 | 1) => {
    const conflicts = operation?.conflicts ?? [];
    if (!conflicts.length) return;
    const current = conflicts.findIndex((item) => item.path === selectedPath);
    const index =
      current < 0
        ? direction === 1
          ? 0
          : conflicts.length - 1
        : (current + direction + conflicts.length) % conflicts.length;
    useConflictStore.getState().select(repoPath, conflicts[index].path);
  };

  const close = useCallback(
    () => useConflictStore.getState().close(repoPath),
    [repoPath],
  );
  useEffect(() => {
    if (jobPending) useConflictStore.getState().cancelQueue(repoPath);
  }, [jobPending, repoPath]);

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    section.current?.focus();
    const isTopDialog = () => {
      const dialogs = document.querySelectorAll(
        '[role="dialog"][aria-modal="true"]',
      );
      return dialogs[dialogs.length - 1] === section.current;
    };
    const focusables = () =>
      Array.from(
        section.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
    const keyboard = (event: KeyboardEvent) => {
      if (!isTopDialog()) return;
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        close();
      }
      if (event.key !== "Tab") return;
      const nodes = focusables();
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first) {
        event.preventDefault();
        section.current?.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === section.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === section.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    const focus = (event: FocusEvent) => {
      if (
        isTopDialog() &&
        event.target instanceof Node &&
        !section.current?.contains(event.target)
      )
        (focusables()[0] ?? section.current)?.focus();
    };
    window.addEventListener("keydown", keyboard);
    document.addEventListener("focusin", focus);
    return () => {
      window.removeEventListener("keydown", keyboard);
      document.removeEventListener("focusin", focus);
      previous?.isConnected && previous.focus();
    };
  }, [close]);

  const refresh = useCallback(async () => {
    const current = useConflictStore.getState().sessions[repoPath];
    const fresh = await gitApi.getOperationSummary(repoPath);
    queryClient.setQueryData(gitKeys.operationSummary(repoPath), fresh);
    useConflictStore.getState().sync(repoPath, fresh);
    await invalidateGitState(queryClient, repoPath);
    if (!current || fresh.id !== current.operationId) return;
    // Parent watchers do not recurse through a child repository; read every loaded pointer on return.
    const paths = new Set([
      ...Object.keys(current.files),
      ...(current.selectedPath ? [current.selectedPath] : []),
    ]);
    await Promise.all(
      Array.from(paths, async (path) => {
        const before = useConflictStore.getState().sessions[repoPath];
        const version = before?.files[path]?.version;
        const value = await gitApi.getConflictContent(repoPath, path);
        const after = useConflictStore.getState().sessions[repoPath];
        if (
          after?.operationId === before?.operationId &&
          after?.files[path]?.version === version &&
          after?.snapshot.current?.hash === before?.snapshot.current?.hash &&
          after?.snapshot.rebase.currentStep ===
            before?.snapshot.rebase.currentStep
        )
          useConflictStore.getState().receive(repoPath, value);
      }),
    );
  }, [repoPath, queryClient]);

  useEffect(() => {
    const onFocus = () => {
      if (!mutationLock.current)
        void refresh().catch((cause) => setError(gitActionErrorMessage(cause)));
    };
    window.addEventListener("focus", onFocus);
    void refresh().catch((cause) => setError(gitActionErrorMessage(cause)));
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useEffect(() => {
    if (!selectedPath || !session || staleOperation) return;
    let cancelled = false;
    const operationId = session.operationId;
    setLoading(true);
    setLoadError(null);
    setReview(null);
    const requestedVersion = session.files[selectedPath]?.version;
    gitApi
      .getConflictContent(repoPath, selectedPath)
      .then((value) => {
        const current = useConflictStore.getState().sessions[repoPath];
        if (
          !cancelled &&
          value.operationId === operationId &&
          current?.files[selectedPath]?.version === requestedVersion
        )
          useConflictStore.getState().receive(repoPath, value);
      })
      .catch((cause) => {
        if (!cancelled) setLoadError(gitActionErrorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    repoPath,
    selectedPath,
    session?.operationId,
    operation?.current?.hash,
    operation?.rebase.currentStep,
    staleOperation,
  ]);

  const change = (resolution: ConflictResolution) => {
    if (selectedPath && canEdit)
      useConflictStore
        .getState()
        .setResolution(repoPath, selectedPath, resolution);
  };

  const chooseSide = (side: "ours" | "theirs") => {
    if (!file) return;
    const stage = file.content[side];
    change(
      !stage.present
        ? { kind: "delete" }
        : stage.content !== null && file.content.kind === "text"
          ? {
              kind: "text",
              content: stage.content,
              mode: stage.mode === "100755" ? "100755" : "100644",
            }
          : { kind: "side", side },
    );
  };

  const save = async (mark: boolean) => {
    const current = useConflictStore.getState().sessions[repoPath];
    const draft = selectedPath ? current?.files[selectedPath] : undefined;
    if (
      !current ||
      current.pending ||
      pending ||
      !selectedPath ||
      !draft?.resolution ||
      draft.external ||
      mutationLock.current ||
      staleOperation
    )
      return;
    if (
      mark &&
      draft.resolution.kind === "text" &&
      /^([<>=|])\1{6,}(?:\s|$)/m.test(draft.resolution.content)
    ) {
      setError(
        "Conflict markers remain in the result. Resolve every region before marking the file resolved.",
      );
      return;
    }
    if (
      mark &&
      draft.content.kind === "submodule" &&
      draft.resolution.kind === "submoduleHead" &&
      draft.content.submodule?.dirty
    ) {
      if (
        !(await appDialog.confirm(
          "The child worktree is dirty. Only its committed HEAD will be recorded in the parent; uncommitted child changes are not included.",
          "Use dirty submodule HEAD?",
        ))
      )
        return;
    }
    mutationLock.current = true;
    useConflictStore
      .getState()
      .updateSession(repoPath, (value) => ({ ...value, pending: true }));
    setBusy(true);
    setError(null);
    try {
      const request = {
        operationId: current.operationId,
        filePath: selectedPath,
        expectedRevision: draft.content.revision,
        resolution: draft.resolution,
      };
      if (mark) await gitApi.markConflictResolved(repoPath, request);
      else await gitApi.saveConflictResult(repoPath, request);
      const freshOperation = await gitApi.getOperationSummary(repoPath);
      if (freshOperation.id === current.operationId) {
        const value = await gitApi.getConflictContent(repoPath, selectedPath);
        useConflictStore
          .getState()
          .receive(repoPath, value, draft.version, mark ? true : undefined);
      } else {
        // The final generic/squash conflict may complete without an operation marker.
        useConflictStore
          .getState()
          .updateFile(repoPath, selectedPath, (value) =>
            value.version === draft.version
              ? { ...value, dirty: false, resolved: mark || value.resolved }
              : value,
          );
      }
      queryClient.setQueryData(
        gitKeys.operationSummary(repoPath),
        freshOperation,
      );
      useConflictStore.getState().sync(repoPath, freshOperation);
      await invalidateGitState(queryClient, repoPath);
    } catch (cause) {
      setError(gitActionErrorMessage(cause));
      try {
        const fresh = await gitApi.getConflictContent(repoPath, selectedPath);
        useConflictStore.getState().receive(repoPath, fresh);
      } catch {
        /* Keep the original draft if an external abort removed the conflict. */
      }
    } finally {
      mutationLock.current = false;
      setBusy(false);
      useConflictStore
        .getState()
        .updateSession(repoPath, (value) => ({ ...value, pending: false }));
    }
  };

  const recover = async (action: OperationAction) => {
    const current = useConflictStore.getState().sessions[repoPath];
    if (!current || mutationLock.current || pending || staleOperation) return;
    if (action !== "continue") {
      const message =
        action === "abort"
          ? "Abort this operation? Git restores its pre-operation state and discards resolved edits. Unsaved resolver drafts and todo changes will also be discarded."
          : "Skip this replayed commit? Its changes will not be applied. Saved resolutions and unsaved drafts for this step will be discarded. Recovery is available through ORIG_HEAD/reflog.";
      if (
        !(await appDialog.confirm(
          message,
          action === "abort" ? "Abort operation?" : "Skip commit?",
          "danger",
        ))
      )
        return;
    }
    mutationLock.current = true;
    useConflictStore
      .getState()
      .updateSession(repoPath, (value) => ({ ...value, pending: true }));
    setBusy(true);
    setError(null);
    try {
      const fresh = await gitApi.getOperationSummary(repoPath);
      queryClient.setQueryData(gitKeys.operationSummary(repoPath), fresh);
      if (
        fresh.id !== current.operationId ||
        !fresh.allowedActions.includes(action)
      )
        throw new Error("The operation changed. Refresh before trying again.");
      if (
        action === "continue" &&
        (fresh.conflicts.length > 0 ||
          sessionHasDrafts(useConflictStore.getState().sessions[repoPath]))
      )
        throw new Error(
          "Save or discard every draft and mark every conflict resolved before continuing.",
        );
      if (action === "continue") {
        const status = await gitApi.getStatus(repoPath);
        const unstaged = status.filter(
          (item) =>
            item.unstaged &&
            current.files[item.path]?.content.kind !== "submodule",
        );
        if (unstaged.length)
          throw new Error(
            `Unstaged changes remain: ${unstaged.map((item) => item.path).join(", ")}. Mark edited results resolved or handle these changes before continuing.`,
          );
      }
      useConflictStore.getState().cancelQueue(repoPath);
      await operationAction.mutateAsync({
        action,
        operationId: current.operationId,
      });
      if (action !== "continue")
        useConflictStore.getState().updateSession(repoPath, (value) => ({
          ...value,
          files: {},
          todoDraft: value.todoSaved,
        }));
      await refresh();
    } catch (cause) {
      setError(gitActionErrorMessage(cause));
    } finally {
      mutationLock.current = false;
      setBusy(false);
      useConflictStore
        .getState()
        .updateSession(repoPath, (value) => ({ ...value, pending: false }));
    }
  };

  const openChild = async () => {
    if (!selectedPath || pending) return;
    setError(null);
    setBusy(true);
    try {
      const child = await gitApi.openSubmodule(repoPath, selectedPath);
      await openRepository.mutateAsync(child);
      const childOperation = await gitApi.getOperationSummary(child);
      queryClient.setQueryData(gitKeys.operationSummary(child), childOperation);
      if (childOperation.id) useConflictStore.getState().open(child);
    } catch (cause) {
      setError(gitActionErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const openExternal = async () => {
    if (
      !content ||
      content.kind === "symlink" ||
      content.kind === "submodule" ||
      content.kind === "unsupported"
    )
      return;
    try {
      const settings = await gitApi.getAppSettings();
      await openPath(
        content.absolutePath,
        settings.externalEditorPath ?? undefined,
      );
    } catch (cause) {
      setError(gitActionErrorMessage(cause));
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/65 p-0 sm:p-3"
      role="presentation"
    >
      <section
        ref={section}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-dialog-title"
        aria-describedby="conflict-dialog-description"
        className="flex h-full max-h-[1100px] w-full max-w-[1900px] min-w-0 flex-col overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] shadow-[var(--shadow-elevated)] outline-none sm:rounded-xl"
      >
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="conflict-dialog-title" className="text-sm font-semibold">
              {operation?.operation === "cherryPick"
                ? "Cherry-pick"
                : (operation?.operation ?? "Conflict")}{" "}
              resolver
              {operation?.rebase.inProgress
                ? ` · Step ${operation.rebase.currentStep ?? 0}/${operation.rebase.totalSteps ?? "?"}`
                : ""}
            </h2>
            <p
              className="truncate text-xs text-[var(--color-text-secondary)]"
              title={repoPath}
            >
              {repoPath}
            </p>
            {operation?.source && (
              <p className="truncate text-xs text-[var(--color-text-secondary)]">
                {operation.source.label} →{" "}
                {operation.target?.label ?? operation.currentLabel}
                {operation.current ? ` · ${operation.current.subject}` : ""}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            disabled={pending}
            onClick={() =>
              void refresh().catch((cause) =>
                setError(gitActionErrorMessage(cause)),
              )
            }
          >
            Refresh / reload
          </Button>
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon={<X className="h-4 w-4" />}
            onClick={close}
          >
            Dismiss resolver; preserve drafts
          </Button>
          <p
            id="conflict-dialog-description"
            className="w-full text-[11px] text-[var(--color-text-muted)]"
          >
            Side choices and AI acceptance edit in-memory drafts only. Save
            Draft writes without staging. Mark resolved saves and stages exactly
            this result. Dismissal keeps unsaved drafts until app exit.
          </p>
          {repository?.repositoryInfo.submoduleParent && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const parent = repository.repositoryInfo.submoduleParent!;
                useConflictStore.getState().open(parent.path);
                openRepository.mutate(parent.path, {
                  onSuccess: () => {
                    void invalidateGitState(queryClient, parent.path);
                  },
                  onError: (cause) => setError(gitActionErrorMessage(cause)),
                });
              }}
            >
              Return to parent: {repository.repositoryInfo.submoduleParent.name}
            </Button>
          )}
        </header>
        {operation?.rebase.inProgress && (
          <progress
            className="h-1 w-full shrink-0 accent-[var(--color-accent)]"
            aria-label="Rebase progress"
            value={operation.rebase.currentStep ?? 0}
            max={Math.max(1, operation.rebase.totalSteps ?? 1)}
          />
        )}
        {(error || loadError) && (
          <p
            role="alert"
            className="shrink-0 whitespace-pre-wrap break-words border-b border-[var(--color-danger)] px-4 py-2 text-xs text-[var(--color-danger)]"
          >
            {error ?? loadError}
          </p>
        )}
        {staleOperation && (
          <div
            role="alert"
            className="space-y-2 border-b border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] p-3 text-xs"
          >
            <p>
              The operation completed or was replaced outside this dialog. Your
              unsaved drafts are retained below for copying; writes and AI are
              disabled.
            </p>
            <Button
              size="sm"
              variant="danger"
              onClick={async () => {
                if (
                  snapshot &&
                  (await appDialog.confirm(
                    "Discard the retained drafts and load the current operation?",
                    "Discard previous operation drafts?",
                    "danger",
                  ))
                )
                  useConflictStore.getState().sync(repoPath, snapshot, true);
              }}
            >
              Discard old drafts and load current state
            </Button>
          </div>
        )}
        {!session ? (
          <div className="flex-1 space-y-3 overflow-auto p-8 text-center text-sm text-[var(--color-text-muted)]">
            <p>
              No operation needs resolution. For a squash merge, review staged
              changes and create the ordinary commit in Uncommitted Changes.
            </p>
            <Button
              onClick={() => {
                close();
                useAppStore
                  .getState()
                  .setSelectedCommitHash(WORKING_TREE_COMMIT_HASH);
              }}
            >
              Review staged changes
            </Button>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto md:grid-cols-[230px_minmax(0,1fr)] md:overflow-hidden">
            <aside className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] md:overflow-auto md:border-b-0 md:border-r">
              <RebaseTodo repoPath={repoPath} disabled={!canEdit} />
              <div className="flex flex-wrap gap-1 border-b border-[var(--color-border)] p-2">
                <Button
                  size="sm"
                  disabled={!operation?.conflicts.length}
                  onClick={() => navigateFile(-1)}
                >
                  Previous file
                </Button>
                <Button
                  size="sm"
                  disabled={!operation?.conflicts.length}
                  onClick={() => navigateFile(1)}
                >
                  Next file
                </Button>
              </div>
              <nav
                aria-label="Conflict files"
                className="max-h-44 space-y-3 overflow-auto p-2 md:max-h-none"
              >
                <div>
                  <h3 className="px-2 py-1 text-xs font-semibold">
                    Unresolved · {operation!.conflicts.length}
                  </h3>
                  {operation!.conflicts.map((item) => (
                    <button
                      type="button"
                      key={item.path}
                      onClick={() =>
                        useConflictStore.getState().select(repoPath, item.path)
                      }
                      aria-current={
                        selectedPath === item.path ? "true" : undefined
                      }
                      className={`mb-1 block w-full break-all rounded px-2 py-2 text-left text-xs ${selectedPath === item.path ? "bg-[var(--color-bg-selected-muted)] text-[var(--color-accent)]" : "hover:bg-[var(--color-bg-hover)]"}`}
                    >
                      {item.path}
                      {session.files[item.path]?.dirty ? " *" : ""}
                      <span className="block text-[10px] text-[var(--color-text-muted)]">
                        {item.conflictType}
                      </span>
                    </button>
                  ))}
                </div>
                <div>
                  <h3 className="px-2 py-1 text-xs font-semibold">
                    Resolved ·{" "}
                    {
                      Object.values(session.files).filter(
                        (item) => item.resolved,
                      ).length
                    }
                  </h3>
                  {Object.entries(session.files)
                    .filter(([, value]) => value.resolved)
                    .map(([path, value]) => (
                      <button
                        type="button"
                        key={path}
                        onClick={() =>
                          useConflictStore.getState().select(repoPath, path)
                        }
                        aria-current={
                          selectedPath === path ? "true" : undefined
                        }
                        className={`mb-1 block w-full break-all rounded px-2 py-2 text-left text-xs ${selectedPath === path ? "bg-[var(--color-bg-selected-muted)] text-[var(--color-accent)]" : "hover:bg-[var(--color-bg-hover)]"}`}
                      >
                        {path}
                        {value.dirty ? " *" : ""}
                        <span className="block text-[10px] text-[var(--color-text-muted)]">
                          {value.needsStaging
                            ? "Saved draft · restage required"
                            : "Staged · select to re-edit"}
                        </span>
                      </button>
                    ))}
                </div>
              </nav>
            </aside>
            <main className="min-w-0 overflow-auto">
              {!file || !content ? (
                <p className="p-8 text-center text-sm text-[var(--color-text-muted)]">
                  {loading
                    ? "Loading conflict content…"
                    : selectedPath
                      ? "Unable to load this file. Refresh to retry."
                      : "No unresolved files. Review the result and continue when ready."}
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] p-3">
                    <h3 className="min-w-0 flex-1 break-all font-mono text-xs font-semibold">
                      {selectedPath}
                      {file.dirty
                        ? " · Unsaved draft"
                        : file.resolved
                          ? " · Staged"
                          : " · Worktree version"}
                    </h3>
                    {content.kind !== "submodule" &&
                      content.kind !== "symlink" &&
                      content.kind !== "unsupported" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<ExternalLink className="h-3.5 w-3.5" />}
                          disabled={!canEdit || !content.resultExists}
                          onClick={() => void openExternal()}
                        >
                          External editor
                        </Button>
                      )}
                    {content.kind === "text" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowBase((value) => !value)}
                      >
                        {showBase ? "Hide base" : "Show base"}
                      </Button>
                    )}
                  </div>
                  {content.warning && (
                    <p className="p-3 text-xs text-[var(--color-warning)]">
                      {content.warning}
                    </p>
                  )}
                  {file.external && (
                    <div className="space-y-2 border-b border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] p-3 text-xs">
                      <p>
                        The worktree or index changed outside GitEye. Both
                        versions are preserved. Choose how to reconcile before
                        saving. Changed side/child pointers must be selected
                        again after reconciliation.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => setReview("external")}>
                          Compare external vs draft
                        </Button>
                        <Button
                          size="sm"
                          disabled={!canEdit}
                          onClick={async () => {
                            if (
                              await appDialog.confirm(
                                "Discard this in-memory draft and load the external version?",
                                "Reload external version?",
                              )
                            )
                              useConflictStore
                                .getState()
                                .reconcile(repoPath, selectedPath!, false);
                          }}
                        >
                          Reload external version
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={!canEdit}
                          onClick={async () => {
                            if (
                              await appDialog.confirm(
                                "Keep your editor draft against the new file revision? Nothing is overwritten until Save Draft or Mark resolved.",
                                "Keep draft for deliberate overwrite?",
                                "danger",
                              )
                            )
                              useConflictStore
                                .getState()
                                .reconcile(repoPath, selectedPath!, true);
                          }}
                        >
                          Keep draft / allow overwrite
                        </Button>
                      </div>
                    </div>
                  )}
                  {content.kind === "submodule" ? (
                    <div className="space-y-3 p-3 text-xs">
                      <h4 className="font-semibold">
                        Submodule commit pointers
                      </h4>
                      <div className="grid gap-2 lg:grid-cols-3">
                        {(["base", "ours", "theirs"] as const).map((side) => (
                          <StagePane
                            key={side}
                            stage={file.content[side]}
                            pointer
                          />
                        ))}
                      </div>
                      <p>
                        Relationship:{" "}
                        {content.submodule?.relationship ?? "unknown"}
                      </p>
                      <p>
                        Child HEAD:{" "}
                        <code>{content.submodule?.head ?? "unavailable"}</code>{" "}
                        ·{" "}
                        {content.submodule?.initialized
                          ? "initialized"
                          : "not initialized"}
                      </p>
                      {content.submodule?.dirty && (
                        <p className="text-[var(--color-warning)]">
                          Child worktree has uncommitted changes. A parent
                          gitlink records only a commit, not those changes.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={!canEdit}
                          onClick={() => chooseSide("ours")}
                        >
                          {file.content.ours.present
                            ? "Choose current pointer"
                            : "Choose current deletion"}
                        </Button>
                        <Button
                          size="sm"
                          disabled={!canEdit}
                          onClick={() => chooseSide("theirs")}
                        >
                          {file.content.theirs.present
                            ? "Choose incoming pointer"
                            : "Choose incoming deletion"}
                        </Button>
                        <Button
                          size="sm"
                          disabled={!canEdit || !content.submodule?.head}
                          onClick={() => change({ kind: "submoduleHead" })}
                        >
                          Use submodule HEAD
                        </Button>
                        <Button
                          size="sm"
                          disabled={pending || !content.submodule?.initialized}
                          onClick={() => void openChild()}
                        >
                          Open submodule
                        </Button>
                        {!content.submodule?.initialized && file.resolved && (
                          <Button
                            size="sm"
                            disabled={!canEdit}
                            onClick={() => {
                              close();
                              useAppStore
                                .getState()
                                .setActiveView("submodules");
                            }}
                          >
                            Open initialization controls
                          </Button>
                        )}
                      </div>
                      {!content.submodule?.initialized && (
                        <p className="text-[var(--color-warning)]">
                          Git cannot initialize an unmerged gitlink. Choose a
                          raw commit pointer and Mark resolved first, then
                          initialize it explicitly from Worktrees &amp;
                          Submodules. No fetch or child checkout happens here.
                        </p>
                      )}
                      <p className="rounded border border-[var(--color-border)] p-2">
                        Draft choice:{" "}
                        {file.resolution?.kind === "side"
                          ? `${file.resolution.side === "ours" ? file.content.ours.label : file.content.theirs.label} · ${file.content[file.resolution.side].oid}`
                          : file.resolution?.kind === "submoduleHead"
                            ? `Child HEAD ${content.submodule?.head}`
                            : file.resolution?.kind === "delete"
                              ? "Delete parent pointer"
                              : "None — choose a pointer"}
                        . Only Mark resolved updates the parent index. Nested
                        files are never changed by pointer choices.
                      </p>
                    </div>
                  ) : (
                    <>
                      {content.kind === "text" ? (
                        <div
                          className={`grid grid-cols-1 divide-[var(--color-border)] lg:divide-x ${showBase ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}
                        >
                          {showBase && <StagePane stage={file.content.base} />}
                          <StagePane stage={file.content.ours} />
                          <StagePane stage={file.content.theirs} />
                        </div>
                      ) : (
                        <p className="p-3 text-xs text-[var(--color-warning)]">
                          {content.kind} content cannot be edited safely as text
                          or sent to AI. Choose an available whole side or
                          deletion, then explicitly mark resolved. Use an
                          external tool for manual binary/symlink resolution.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 border-y border-[var(--color-border)] p-3">
                        <Button
                          size="sm"
                          disabled={!canEdit}
                          onClick={() => chooseSide("ours")}
                        >
                          {file.content.ours.present
                            ? "Use current file"
                            : "Use current deletion"}
                        </Button>
                        <Button
                          size="sm"
                          disabled={!canEdit}
                          onClick={() => chooseSide("theirs")}
                        >
                          {file.content.theirs.present
                            ? "Use incoming file"
                            : "Use incoming deletion"}
                        </Button>
                        {content.kind !== "text" && (
                          <Button
                            size="sm"
                            disabled={!canEdit || !content.resultExists}
                            onClick={() => change({ kind: "keep" })}
                          >
                            Keep worktree result
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={!canEdit}
                          onClick={() => change({ kind: "delete" })}
                        >
                          Delete result
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!canEdit || content.kind !== "text"}
                          onClick={() =>
                            change(
                              content.resultExists
                                ? {
                                    kind: "text",
                                    content: content.result ?? "",
                                  }
                                : { kind: "delete" },
                            )
                          }
                        >
                          Revert to worktree
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!canEdit || file.initial.kind !== "text"}
                          onClick={() =>
                            change(
                              file.initial.resultExists
                                ? {
                                    kind: "text",
                                    content: file.initial.result ?? "",
                                  }
                                : { kind: "delete" },
                            )
                          }
                        >
                          Reset initial merge
                        </Button>
                      </div>
                      {file.resolution?.kind === "text" && (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
                            <h4 className="font-semibold">
                              Editable result · {regions.length} marker
                              region(s)
                            </h4>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setReview(review === "saved" ? null : "saved")
                              }
                            >
                              Result vs saved diff
                            </Button>
                            <span className="text-[var(--color-text-muted)]">
                              Ctrl/⌘S saves draft · Ctrl/⌘F searches · undo/redo
                              supported
                            </span>
                          </div>
                          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-y border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-xs">
                            <Button
                              size="sm"
                              disabled={!regions.length}
                              onClick={() => navigateRegion(activeRegion - 1)}
                            >
                              Previous conflict
                            </Button>
                            <span aria-live="polite" className="tabular-nums">
                              {regions.length
                                ? `Conflict ${activeRegion + 1} of ${regions.length}`
                                : "No conflict regions remaining"}
                            </span>
                            <Button
                              size="sm"
                              disabled={!regions.length}
                              onClick={() => navigateRegion(activeRegion + 1)}
                            >
                              Next conflict
                            </Button>
                          </div>
                          {regions.length > 0 && (
                            <div className="max-h-52 space-y-2 overflow-auto px-3 py-3">
                              {regions.map((region, index) => (
                                <div
                                  key={region.id}
                                  className={`flex flex-wrap items-center gap-1 rounded border p-2 text-xs ${index === activeRegion ? "border-[var(--color-accent)] bg-[var(--color-bg-selected-muted)]" : "border-[var(--color-border)]"}`}
                                >
                                  <button
                                    type="button"
                                    aria-pressed={index === activeRegion}
                                    aria-label={`Go to conflict ${index + 1}`}
                                    onClick={() => navigateRegion(index)}
                                    className="mr-1 rounded px-2 py-1 font-semibold text-[var(--color-accent)] hover:bg-[var(--color-bg-selected)] focus-visible:outline-2"
                                  >
                                    Conflict {index + 1}
                                  </button>
                                  <Button
                                    size="sm"
                                    disabled={!canEdit}
                                    onClick={() =>
                                      resolveRegion(index, "current")
                                    }
                                  >
                                    Current
                                  </Button>
                                  <Button
                                    size="sm"
                                    disabled={!canEdit}
                                    onClick={() =>
                                      resolveRegion(index, "incoming")
                                    }
                                  >
                                    Incoming
                                  </Button>
                                  <Button
                                    size="sm"
                                    disabled={!canEdit}
                                    onClick={() =>
                                      resolveRegion(index, "currentIncoming")
                                    }
                                  >
                                    Current then incoming
                                  </Button>
                                  <Button
                                    size="sm"
                                    disabled={!canEdit}
                                    onClick={() =>
                                      resolveRegion(index, "incomingCurrent")
                                    }
                                  >
                                    Incoming then current
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                          <ConflictEditor
                            key={`${session.operationId}:${selectedPath}`}
                            repoPath={repoPath}
                            filePath={selectedPath!}
                            disabled={!canEdit}
                            activeRegion={activeRegion}
                            navigationRequest={navigationRequest}
                            onSave={() => void save(false)}
                            onResolveRegion={resolveRegion}
                          />
                        </>
                      )}
                      {file.resolution?.kind === "delete" && (
                        <p className="p-4 text-sm text-[var(--color-warning)]">
                          Deletion draft. The worktree is unchanged until Save
                          Draft or Mark resolved.
                        </p>
                      )}
                      {file.resolution?.kind === "side" && (
                        <p className="p-4 text-sm">
                          Whole-side draft:{" "}
                          {file.content[file.resolution.side].label}. The
                          worktree/index is unchanged until an explicit action
                          below.
                        </p>
                      )}
                      {file.resolution?.kind === "keep" && (
                        <p className="p-4 text-sm">
                          Keep the current worktree bytes or symlink target.
                          Mark resolved will stage only if its revision is still
                          unchanged.
                        </p>
                      )}
                    </>
                  )}
                  {review && (
                    <section className="border-t border-[var(--color-border)] p-3">
                      <h4 className="mb-2 text-xs font-semibold">
                        {review === "external"
                          ? "External version → retained draft"
                          : "Saved worktree → draft"}
                      </h4>
                      {patch ? (
                        <DiffViewer
                          diffText={patch}
                          filePath={selectedPath!}
                          mode="unified"
                        />
                      ) : (
                        <p className="text-xs">No text differences.</p>
                      )}
                    </section>
                  )}
                </>
              )}
              <ConflictAiReview repoPath={repoPath} disabled={!canEdit} />
            </main>
          </div>
        )}
        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
          <p className="min-w-0 flex-1 text-xs text-[var(--color-text-secondary)]">
            {sessionHasDrafts(session)
              ? "Save or discard drafts; restage edited resolved files before continuing."
              : operation?.conflicts.length
                ? `${operation.conflicts.length} unresolved file(s)`
                : "No unresolved files"}
          </p>
          {file && (
            <>
              <Button
                size="sm"
                disabled={
                  !canEdit ||
                  !file.resolution ||
                  file.resolution.kind === "keep" ||
                  Boolean(file.external) ||
                  content?.kind === "submodule"
                }
                onClick={() => void save(false)}
              >
                Save Draft
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={
                  !canEdit || !file.resolution || Boolean(file.external)
                }
                onClick={() => void save(true)}
              >
                {file.resolved ? "Save and restage" : "Mark resolved"}
              </Button>
            </>
          )}
          {operation?.allowedActions.includes("skip") && (
            <Button
              size="sm"
              disabled={!canEdit}
              onClick={() => void recover("skip")}
            >
              Skip commit…
            </Button>
          )}
          {operation?.allowedActions.includes("abort") && (
            <Button
              size="sm"
              variant="danger"
              disabled={!canEdit}
              onClick={() => void recover("abort")}
            >
              Abort…
            </Button>
          )}
          {operation?.allowedActions.includes("continue") && (
            <Button
              size="sm"
              variant="success"
              disabled={
                !canEdit ||
                sessionHasDrafts(session) ||
                operation.conflicts.length > 0
              }
              onClick={() => void recover("continue")}
            >
              Continue {operation.operation}
            </Button>
          )}
          {operation &&
            !operation.allowedActions.length &&
            !operation.conflicts.length && (
              <Button
                size="sm"
                onClick={() => {
                  close();
                  useAppStore
                    .getState()
                    .setSelectedCommitHash(WORKING_TREE_COMMIT_HASH);
                }}
              >
                Review staged changes
              </Button>
            )}
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function StagePane({
  stage,
  pointer = false,
}: {
  stage: ConflictStage;
  pointer?: boolean;
}) {
  return (
    <section className="min-w-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
      <h4 className="break-words border-b border-[var(--color-border)] px-3 py-2 text-xs font-semibold">
        {stage.label}
        <span className="ml-2 font-mono text-[10px] text-[var(--color-text-muted)]">
          {stage.oid?.slice(0, 12) ?? "absent"}
        </span>
      </h4>
      <pre className="max-h-56 min-h-16 overflow-auto whitespace-pre p-3 font-mono text-[11px]">
        {!stage.present
          ? "File absent in this side"
          : pointer
            ? stage.oid
            : stage.content === ""
              ? "(empty file)"
              : (stage.content ?? "Content unavailable for text comparison")}
      </pre>
    </section>
  );
}
