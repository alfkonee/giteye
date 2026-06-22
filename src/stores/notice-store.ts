import { create } from "zustand";

export type NoticeStatus = "pending" | "success" | "error" | "info";
export type NoticeCategory = "git" | "system";

export interface NoticeAction {
  label: string;
  target: "command-log";
  jobId?: string | null;
}

export interface Notice {
  id: string;
  title: string;
  detail: string;
  recoveryHint: string | null;
  status: NoticeStatus;
  category: NoticeCategory;
  repoPath: string | null;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  expiresAt: number | null;
  action: NoticeAction | null;
}

export interface OperationTranscriptEntry {
  id: string;
  title: string;
  detail: string;
  recoveryHint: string | null;
  status: Exclude<NoticeStatus, "pending">;
  category: NoticeCategory;
  repoPath: string | null;
  createdAt: number;
  finishedAt: number;
}

export interface NoticeInput {
  title: string;
  detail?: string;
  recoveryHint?: string | null;
  status?: NoticeStatus;
  category?: NoticeCategory;
  repoPath?: string | null;
  action?: NoticeAction | null;
}

interface NoticeStore {
  notices: Notice[];
  operationTranscript: OperationTranscriptEntry[];
  transcriptOpen: boolean;
  startNotice: (notice: NoticeInput) => string;
  updateNotice: (id: string, patch: Partial<Pick<Notice, "title" | "detail" | "recoveryHint" | "status" | "repoPath" | "action">>) => void;
  finishNotice: (id: string, status: Extract<NoticeStatus, "success" | "error" | "info">, detail: string, recoveryHint?: string | null) => void;
  dismissNotice: (id: string) => void;
  clearFinished: () => void;
  clearOperationTranscript: () => void;
  setTranscriptOpen: (open: boolean) => void;
  toggleTranscriptOpen: () => void;
  pruneExpired: (now?: number) => void;
}

const FINISHED_NOTICE_TTL_MS = 8_000;
const MAX_NOTICES = 8;
const MAX_TRANSCRIPT_ENTRIES = 40;

export const useNoticeStore = create<NoticeStore>((set) => ({
  notices: [],
  operationTranscript: [],
  transcriptOpen: false,

  startNotice: (input) => {
    const now = Date.now();
    const id = makeNoticeId();
    const notice: Notice = {
      id,
      title: input.title,
      detail: input.detail ?? "Starting…",
      recoveryHint: input.recoveryHint ?? null,
      status: input.status ?? "pending",
      category: input.category ?? "git",
      repoPath: input.repoPath ?? null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      expiresAt: null,
      action: input.action ?? null,
    };

    set((state) => ({
      notices: [notice, ...state.notices].slice(0, MAX_NOTICES),
    }));

    return id;
  },

  updateNotice: (id, patch) => {
    const now = Date.now();
    set((state) => ({
      notices: state.notices.map((notice) =>
        notice.id === id
          ? {
              ...notice,
              ...patch,
              updatedAt: now,
            }
          : notice,
      ),
    }));
  },

  finishNotice: (id, status, detail, recoveryHint) => {
    const now = Date.now();
    set((state) => {
      let completedNotice: Notice | null = null;
      const notices = state.notices.map((notice) => {
        if (notice.id !== id) {
          return notice;
        }

        completedNotice = {
          ...notice,
          status,
          detail,
          recoveryHint: recoveryHint ?? notice.recoveryHint,
          updatedAt: now,
          finishedAt: now,
          expiresAt: now + FINISHED_NOTICE_TTL_MS,
        };

        return completedNotice;
      });

      if (!completedNotice) {
        return { notices };
      }

      const transcriptEntry = toTranscriptEntry(completedNotice);
      return {
        notices,
        operationTranscript: [
          transcriptEntry,
          ...state.operationTranscript.filter((entry) => entry.id !== id),
        ].slice(0, MAX_TRANSCRIPT_ENTRIES),
      };
    });
  },

  dismissNotice: (id) => {
    set((state) => ({
      notices: state.notices.filter((notice) => notice.id !== id),
    }));
  },

  clearFinished: () => {
    set((state) => ({
      notices: state.notices.filter((notice) => notice.status === "pending"),
    }));
  },

  clearOperationTranscript: () => {
    set({ operationTranscript: [] });
  },

  setTranscriptOpen: (open) => {
    set({ transcriptOpen: open });
  },

  toggleTranscriptOpen: () => {
    set((state) => ({ transcriptOpen: !state.transcriptOpen }));
  },

  pruneExpired: (now = Date.now()) => {
    set((state) => ({
      notices: state.notices.filter((notice) => notice.expiresAt === null || notice.expiresAt > now),
    }));
  },
}));

function toTranscriptEntry(notice: Notice): OperationTranscriptEntry {
  return {
    id: notice.id,
    title: notice.title,
    detail: notice.detail,
    recoveryHint: notice.recoveryHint,
    status: notice.status === "pending" ? "info" : notice.status,
    category: notice.category,
    repoPath: notice.repoPath,
    createdAt: notice.createdAt,
    finishedAt: notice.finishedAt ?? notice.updatedAt,
  };
}

function makeNoticeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `notice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
