import { create } from "zustand";

export type NoticeStatus = "pending" | "success" | "error" | "info";
export type NoticeCategory = "git" | "system";

export interface Notice {
  id: string;
  title: string;
  detail: string;
  status: NoticeStatus;
  category: NoticeCategory;
  repoPath: string | null;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  expiresAt: number | null;
}

export interface NoticeInput {
  title: string;
  detail?: string;
  status?: NoticeStatus;
  category?: NoticeCategory;
  repoPath?: string | null;
}

interface NoticeStore {
  notices: Notice[];
  startNotice: (notice: NoticeInput) => string;
  updateNotice: (id: string, patch: Partial<Pick<Notice, "title" | "detail" | "status" | "repoPath">>) => void;
  finishNotice: (id: string, status: Extract<NoticeStatus, "success" | "error" | "info">, detail: string) => void;
  dismissNotice: (id: string) => void;
  clearFinished: () => void;
  pruneExpired: (now?: number) => void;
}

const FINISHED_NOTICE_TTL_MS = 8_000;
const MAX_NOTICES = 8;

export const useNoticeStore = create<NoticeStore>((set) => ({
  notices: [],

  startNotice: (input) => {
    const now = Date.now();
    const id = makeNoticeId();
    const notice: Notice = {
      id,
      title: input.title,
      detail: input.detail ?? "Starting…",
      status: input.status ?? "pending",
      category: input.category ?? "git",
      repoPath: input.repoPath ?? null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      expiresAt: null,
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

  finishNotice: (id, status, detail) => {
    const now = Date.now();
    set((state) => ({
      notices: state.notices.map((notice) =>
        notice.id === id
          ? {
              ...notice,
              status,
              detail,
              updatedAt: now,
              finishedAt: now,
              expiresAt: now + FINISHED_NOTICE_TTL_MS,
            }
          : notice,
      ),
    }));
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

  pruneExpired: (now = Date.now()) => {
    set((state) => ({
      notices: state.notices.filter((notice) => notice.expiresAt === null || notice.expiresAt > now),
    }));
  },
}));

function makeNoticeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `notice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
