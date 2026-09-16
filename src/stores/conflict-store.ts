import { create } from "zustand";
import type { EditorState } from "@codemirror/state";
import type {
  AiConflictContext,
  AiConflictProposal,
  ConflictContent,
  ConflictResolution,
  OperationSnapshot,
  RebaseTodoItem,
} from "../types/git";

export interface ConflictDraft {
  content: ConflictContent;
  initial: ConflictContent;
  external: ConflictContent | null;
  resolution: ConflictResolution | null;
  dirty: boolean;
  version: number;
  resolved: boolean;
  needsStaging: boolean;
  editorState: EditorState | null;
  scrollTop: number;
  activeRegion: number;
  ai: {
    status:
      "idle" | "queued" | "running" | "ready" | "stale" | "error" | "cancelled";
    context?: AiConflictContext;
    proposal?: AiConflictProposal;
    version?: number;
    error?: string;
  };
}

export interface ConflictSession {
  operationId: string;
  pending: boolean;
  snapshot: OperationSnapshot;
  selectedPath: string | null;
  files: Record<string, ConflictDraft>;
  todoDraft: RebaseTodoItem[];
  todoSaved: RebaseTodoItem[];
  queueToken: number;
  queueRunning: boolean;
}

export const todoEqual = (left: RebaseTodoItem[], right: RebaseTodoItem[]) =>
  left.length === right.length &&
  left.every((item, index) => {
    const other = right[index];
    return (
      item.action === other.action &&
      item.commit === other.commit &&
      item.message === other.message
    );
  });

export const sessionHasDrafts = (session: ConflictSession | undefined) =>
  Boolean(
    session &&
    (Object.values(session.files).some(
      (file) => file.dirty || file.needsStaging,
    ) ||
      !todoEqual(session.todoDraft, session.todoSaved)),
  );

function worktreeResolution(
  content: ConflictContent,
): ConflictResolution | null {
  if (content.kind === "submodule") return null;
  if (!content.resultExists) return { kind: "delete" };
  if (content.kind === "text" && content.result !== null)
    return { kind: "text", content: content.result };
  return null;
}

function newDraft(content: ConflictContent, resolved = false): ConflictDraft {
  return {
    content,
    initial: content,
    external: null,
    resolution: worktreeResolution(content),
    dirty: false,
    version: 0,
    resolved,
    needsStaging: false,
    editorState: null,
    scrollTop: 0,
    activeRegion: 0,
    ai: { status: "idle" },
  };
}

interface ConflictStore {
  openRepoPath: string | null;
  openRepositories: Record<string, boolean>;
  sessions: Record<string, ConflictSession>;
  autoOpened: Record<string, string>;
  open: (repoPath: string) => void;
  close: (repoPath: string) => void;
  sync: (
    repoPath: string,
    snapshot: OperationSnapshot,
    discard?: boolean,
  ) => void;
  select: (repoPath: string, filePath: string) => void;
  receive: (
    repoPath: string,
    content: ConflictContent,
    savedVersion?: number,
    resolved?: boolean,
  ) => void;
  updateFile: (
    repoPath: string,
    filePath: string,
    update: (draft: ConflictDraft) => ConflictDraft,
  ) => void;
  setResolution: (
    repoPath: string,
    filePath: string,
    resolution: ConflictResolution,
  ) => void;
  reconcile: (repoPath: string, filePath: string, keepDraft: boolean) => void;
  updateSession: (
    repoPath: string,
    update: (session: ConflictSession) => ConflictSession,
  ) => void;
  cancelQueue: (repoPath: string) => void;
}

export const useConflictStore = create<ConflictStore>((set, get) => ({
  openRepoPath: null,
  openRepositories: {},
  sessions: {},
  autoOpened: {},
  open: (repoPath) =>
    set((state) => ({
      openRepoPath: repoPath,
      openRepositories: { ...state.openRepositories, [repoPath]: true },
    })),
  close: (repoPath) =>
    set((state) => ({
      openRepoPath: state.openRepoPath === repoPath ? null : state.openRepoPath,
      openRepositories: { ...state.openRepositories, [repoPath]: false },
    })),
  sync: (repoPath, snapshot, discard = false) =>
    set((state) => {
      const previous = state.sessions[repoPath];
      if (previous?.operationId !== snapshot.id) {
        // An external abort/restart must never silently destroy an unsaved editor or todo.
        if (sessionHasDrafts(previous) && !discard) return state;
        const sessions = { ...state.sessions };
        if (!snapshot.id) delete sessions[repoPath];
        else
          sessions[repoPath] = {
            operationId: snapshot.id,
            snapshot,
            selectedPath: snapshot.conflicts[0]?.path ?? null,
            pending: false,
            files: {},
            todoDraft: snapshot.rebase.todo,
            todoSaved: snapshot.rebase.todo,
            queueToken: (previous?.queueToken ?? 0) + 1,
            queueRunning: false,
          };
        return { sessions };
      }
      if (!previous) return state;
      const stepChanged =
        previous.snapshot.current?.hash !== snapshot.current?.hash ||
        previous.snapshot.rebase.currentStep !== snapshot.rebase.currentStep;
      const conflicts = new Set(snapshot.conflicts.map((file) => file.path));
      const files = { ...previous.files };
      for (const [path, draft] of Object.entries(files)) {
        // A repeated path in a later replay is a new conflict, not the prior resolved result.
        if (stepChanged && conflicts.has(path) && !draft.dirty)
          delete files[path];
        else
          files[path] = {
            ...draft,
            resolved: !conflicts.has(path),
            ai:
              stepChanged && draft.ai.status !== "idle"
                ? {
                    status: "stale",
                    error: "The operation moved to a new step.",
                  }
                : draft.ai,
          };
      }
      const todoDirty = !todoEqual(previous.todoDraft, previous.todoSaved);
      return {
        sessions: {
          ...state.sessions,
          [repoPath]: {
            ...previous,
            snapshot,
            files,
            selectedPath:
              previous.selectedPath &&
              (files[previous.selectedPath] ||
                conflicts.has(previous.selectedPath))
                ? previous.selectedPath
                : (snapshot.conflicts[0]?.path ??
                  Object.keys(files)[0] ??
                  null),
            todoSaved: todoDirty ? previous.todoSaved : snapshot.rebase.todo,
            todoDraft: todoDirty ? previous.todoDraft : snapshot.rebase.todo,
            queueToken: previous.queueToken + (stepChanged ? 1 : 0),
            queueRunning: stepChanged ? false : previous.queueRunning,
          },
        },
      };
    }),
  select: (repoPath, selectedPath) =>
    get().updateSession(repoPath, (session) => ({ ...session, selectedPath })),
  receive: (repoPath, content, savedVersion, resolved) =>
    get().updateSession(repoPath, (session) => {
      if (session.operationId !== content.operationId) return session;
      const previous = session.files[content.filePath];
      const isResolved =
        resolved ??
        !session.snapshot.conflicts.some(
          (file) => file.path === content.filePath,
        );
      let draft: ConflictDraft;
      if (!previous) draft = newDraft(content, isResolved);
      else if (
        savedVersion !== undefined &&
        previous.version === savedVersion
      ) {
        draft = {
          ...previous,
          content,
          external: null,
          dirty: false,
          resolved: isResolved,
          version: previous.version + 1,
          needsStaging:
            resolved === true
              ? false
              : previous.resolved || previous.needsStaging,
          resolution:
            content.kind === "submodule"
              ? previous.resolution
              : worktreeResolution(content),
          ai: previous.ai.status === "idle" ? previous.ai : { status: "stale" },
        };
      } else if (previous.content.revision === content.revision)
        draft = { ...previous, resolved: isResolved };
      else if (
        previous.dirty ||
        (savedVersion !== undefined && previous.version !== savedVersion)
      ) {
        draft = {
          ...previous,
          external: content,
          resolved: isResolved,
          ai: { status: "stale", error: "File content changed." },
        };
      } else
        draft = {
          ...newDraft(content, isResolved),
          initial: previous.initial,
          version: previous.version + 1,
          needsStaging:
            previous.needsStaging ||
            (previous.resolved && previous.content.result !== content.result),
        };
      return {
        ...session,
        files: { ...session.files, [content.filePath]: draft },
      };
    }),
  updateFile: (repoPath, filePath, update) =>
    get().updateSession(repoPath, (session) => {
      const file = session.files[filePath];
      return file
        ? { ...session, files: { ...session.files, [filePath]: update(file) } }
        : session;
    }),
  setResolution: (repoPath, filePath, resolution) =>
    get().updateFile(repoPath, filePath, (file) => ({
      ...file,
      resolution,
      dirty:
        resolution.kind === "text"
          ? !file.content.resultExists ||
            resolution.content !== file.content.result
          : resolution.kind === "delete"
            ? file.content.resultExists
            : true,
      version: file.version + 1,
      editorState: null,
      ai:
        file.ai.status === "ready" || file.ai.status === "running"
          ? { ...file.ai, status: "stale" }
          : file.ai,
    })),
  reconcile: (repoPath, filePath, keepDraft) =>
    get().updateFile(repoPath, filePath, (file) => {
      if (!file.external) return file;
      const pointerChanged =
        file.resolution?.kind === "side"
          ? file.content[file.resolution.side].oid !==
              file.external[file.resolution.side].oid ||
            file.content[file.resolution.side].mode !==
              file.external[file.resolution.side].mode ||
            file.content[file.resolution.side].present !==
              file.external[file.resolution.side].present
          : file.resolution?.kind === "submoduleHead" &&
            file.content.submodule?.head !== file.external.submodule?.head;
      if (keepDraft && pointerChanged)
        return {
          ...file,
          content: file.external,
          external: null,
          resolution: null,
          dirty: false,
          version: file.version + 1,
          ai: { status: "idle" },
        };
      return keepDraft
        ? {
            ...file,
            content: file.external,
            external: null,
            version: file.version + 1,
            ai: { status: "stale" },
          }
        : {
            ...newDraft(file.external, file.resolved),
            initial: file.initial,
            version: file.version + 1,
            needsStaging: file.needsStaging || file.resolved,
          };
    }),
  updateSession: (repoPath, update) =>
    set((state) => {
      const session = state.sessions[repoPath];
      if (!session) return state;
      const updated = update(session);
      return updated === session
        ? state
        : { sessions: { ...state.sessions, [repoPath]: updated } };
    }),
  cancelQueue: (repoPath) =>
    get().updateSession(repoPath, (session) => ({
      ...session,
      queueToken: session.queueToken + 1,
      queueRunning: false,
      files: Object.fromEntries(
        Object.entries(session.files).map(([path, draft]) => [
          path,
          draft.ai.status === "queued" || draft.ai.status === "running"
            ? { ...draft, ai: { status: "cancelled" as const } }
            : draft,
        ]),
      ),
    })),
}));
