import { create } from "zustand";
import type {
  AppRoute,
  DiffMode,
  GlobalViewType,
  RepositorySessionState,
  SelectedEntityState,
  ViewType,
} from "../types/git";

const DEFAULT_REPOSITORY_VIEW: ViewType = "working-tree";

function createSelectedState(repoPath: string | null): SelectedEntityState {
  return {
    repositoryPath: repoPath,
    branchName: null,
    commitHash: null,
    filePath: null,
    commitFilePath: null,
    fileStaged: false,
    pullRequestId: null,
    stackId: null,
    worktreePath: null,
    submodulePath: null,
    conflictPath: null,
  };
}

function createRepositorySession(
  repoPath: string,
  activeView: ViewType = DEFAULT_REPOSITORY_VIEW,
): RepositorySessionState {
  return {
    repoPath,
    activeView,
    selected: createSelectedState(repoPath),
  };
}

function normalizeRepositorySession(
  session: RepositorySessionState,
  repoPath: string,
): RepositorySessionState {
  return {
    repoPath,
    activeView: session.activeView ?? DEFAULT_REPOSITORY_VIEW,
    selected: {
      ...createSelectedState(repoPath),
      ...session.selected,
      repositoryPath: repoPath,
    },
  };
}

export interface AppStore {
  // Open repository sessions
  activeRepoPath: string | null;
  openRepoPaths: string[];
  repoSessions: Record<string, RepositorySessionState>;
  setActiveRepoPath: (path: string | null) => void;
  closeRepoPath: (path: string) => void;
  route: AppRoute;
  setGlobalView: (view: GlobalViewType) => void;
  selected: SelectedEntityState;

  selectedBranchName: string | null;
  setSelectedBranchName: (name: string | null) => void;
  pendingAdvancedBranchName: string | null;
  setPendingAdvancedBranchName: (name: string | null) => void;

  selectedCommitHash: string | null;
  setSelectedCommitHash: (hash: string | null) => void;
  selectedCommitFilePath: string | null;
  setSelectedCommitFilePath: (path: string | null) => void;

  selectedFilePath: string | null;
  selectedFileStaged: boolean;
  setSelectedFile: (path: string | null, staged: boolean) => void;

  selectedPullRequestId: string | null;
  setSelectedPullRequestId: (id: string | null) => void;

  selectedStackId: string | null;
  setSelectedStackId: (id: string | null) => void;

  selectedWorktreePath: string | null;
  setSelectedWorktreePath: (path: string | null) => void;

  selectedSubmodulePath: string | null;
  setSelectedSubmodulePath: (path: string | null) => void;

  selectedConflictPath: string | null;
  setSelectedConflictPath: (path: string | null) => void;

  // Active view
  activeView: ViewType;
  setActiveView: (view: ViewType) => void;

  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Diff mode
  diffMode: DiffMode;
  setDiffMode: (mode: DiffMode) => void;

  // Theme
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
}

type ActiveSessionState = Pick<
  AppStore,
  | "activeRepoPath"
  | "route"
  | "activeView"
  | "selected"
  | "selectedBranchName"
  | "pendingAdvancedBranchName"
  | "selectedCommitHash"
  | "selectedCommitFilePath"
  | "selectedFilePath"
  | "selectedFileStaged"
  | "selectedPullRequestId"
  | "selectedStackId"
  | "selectedWorktreePath"
  | "selectedSubmodulePath"
  | "selectedConflictPath"
>;

function activeStateFromSession(
  session: RepositorySessionState,
): ActiveSessionState {
  const selected = normalizeRepositorySession(session, session.repoPath).selected;

  return {
    activeRepoPath: session.repoPath,
    route: {
      area: "repository",
      view: session.activeView,
      repoPath: session.repoPath,
    },
    activeView: session.activeView,
    selected,
    selectedBranchName: selected.branchName,
    pendingAdvancedBranchName: null,
    selectedCommitHash: selected.commitHash,
    selectedCommitFilePath: selected.commitFilePath,
    selectedFilePath: selected.filePath,
    selectedFileStaged: selected.fileStaged,
    selectedPullRequestId: selected.pullRequestId,
    selectedStackId: selected.stackId,
    selectedWorktreePath: selected.worktreePath,
    selectedSubmodulePath: selected.submodulePath,
    selectedConflictPath: selected.conflictPath,
  };
}

function emptyActiveState(): ActiveSessionState {
  const selected = createSelectedState(null);

  return {
    activeRepoPath: null,
    route: { area: "global", view: "repo-hub" },
    activeView: DEFAULT_REPOSITORY_VIEW,
    selected,
    selectedBranchName: null,
    pendingAdvancedBranchName: null,
    selectedCommitHash: null,
    selectedCommitFilePath: null,
    selectedFilePath: null,
    selectedFileStaged: false,
    selectedPullRequestId: null,
    selectedStackId: null,
    selectedWorktreePath: null,
    selectedSubmodulePath: null,
    selectedConflictPath: null,
  };
}

function syncActiveSession(
  state: AppStore,
  activePatch: Partial<AppStore>,
  sessionPatch: Partial<Omit<RepositorySessionState, "repoPath">>,
): Partial<AppStore> {
  if (!state.activeRepoPath) {
    return activePatch;
  }

  const currentSession = normalizeRepositorySession(
    state.repoSessions[state.activeRepoPath] ??
      createRepositorySession(state.activeRepoPath, state.activeView),
    state.activeRepoPath,
  );
  const nextSession: RepositorySessionState = {
    ...currentSession,
    ...sessionPatch,
    repoPath: state.activeRepoPath,
    selected: sessionPatch.selected ?? currentSession.selected,
    activeView: sessionPatch.activeView ?? currentSession.activeView,
  };

  return {
    ...activePatch,
    repoSessions: {
      ...state.repoSessions,
      [state.activeRepoPath]: nextSession,
    },
  };
}

export const useAppStore = create<AppStore>((set) => ({
  ...emptyActiveState(),
  openRepoPaths: [],
  repoSessions: {},
  setGlobalView: (view) =>
    set({
      ...emptyActiveState(),
      route: { area: "global", view },
    }),
  setActiveRepoPath: (path) =>
    set((state) => {
      if (!path) {
        return emptyActiveState();
      }

      const session = normalizeRepositorySession(
        state.repoSessions[path] ?? createRepositorySession(path),
        path,
      );
      const openRepoPaths = state.openRepoPaths.includes(path)
        ? state.openRepoPaths
        : [...state.openRepoPaths, path];

      return {
        openRepoPaths,
        repoSessions: {
          ...state.repoSessions,
          [path]: session,
        },
        ...activeStateFromSession(session),
      };
    }),
  closeRepoPath: (path) =>
    set((state) => {
      const openRepoPaths = state.openRepoPaths.filter(
        (repoPath) => repoPath !== path,
      );
      const { [path]: _closedSession, ...repoSessions } = state.repoSessions;

      if (state.activeRepoPath !== path) {
        return { openRepoPaths, repoSessions };
      }

      const closedIndex = state.openRepoPaths.indexOf(path);
      const nextRepoPath =
        openRepoPaths[Math.min(Math.max(closedIndex, 0), openRepoPaths.length - 1)] ??
        null;

      if (!nextRepoPath) {
        return {
          openRepoPaths,
          repoSessions,
          ...emptyActiveState(),
        };
      }

      const nextSession = normalizeRepositorySession(
        repoSessions[nextRepoPath] ?? createRepositorySession(nextRepoPath),
        nextRepoPath,
      );

      return {
        openRepoPaths,
        repoSessions: {
          ...repoSessions,
          [nextRepoPath]: nextSession,
        },
        ...activeStateFromSession(nextSession),
      };
    }),

  setSelectedBranchName: (name) =>
    set((state) => {
      const selected = {
        ...state.selected,
        repositoryPath: state.activeRepoPath,
        branchName: name,
      };
      return syncActiveSession(
        state,
        {
          selectedBranchName: name,
          selected,
        },
        { selected },
      );
    }),
  setPendingAdvancedBranchName: (name) =>
    set({ pendingAdvancedBranchName: name }),

  setSelectedCommitHash: (hash) =>
    set((state) => {
      const selected = {
        ...state.selected,
        repositoryPath: state.activeRepoPath,
        commitHash: hash,
        commitFilePath: null,
        filePath: null,
        fileStaged: false,
      };
      return syncActiveSession(
        state,
        {
          selectedCommitHash: hash,
          selectedCommitFilePath: null,
          selectedFilePath: null,
          selectedFileStaged: false,
          selected,
        },
        { selected },
      );
    }),

  setSelectedCommitFilePath: (path) =>
    set((state) => {
      const selected = {
        ...state.selected,
        repositoryPath: state.activeRepoPath,
        commitFilePath: path,
      };
      return syncActiveSession(
        state,
        {
          selectedCommitFilePath: path,
          selected,
        },
        { selected },
      );
    }),

  setSelectedFile: (path, staged) =>
    set((state) => {
      const selected = {
        ...state.selected,
        repositoryPath: state.activeRepoPath,
        filePath: path,
        fileStaged: staged,
        commitFilePath: null,
      };
      return syncActiveSession(
        state,
        {
          selectedFilePath: path,
          selectedFileStaged: staged,
          selectedCommitFilePath: null,
          selected,
        },
        { selected },
      );
    }),

  setSelectedPullRequestId: (id) =>
    set((state) => {
      const selected = {
        ...state.selected,
        repositoryPath: state.activeRepoPath,
        pullRequestId: id,
      };
      return syncActiveSession(
        state,
        {
          selectedPullRequestId: id,
          selected,
        },
        { selected },
      );
    }),

  setSelectedStackId: (id) =>
    set((state) => {
      const selected = {
        ...state.selected,
        repositoryPath: state.activeRepoPath,
        stackId: id,
      };
      return syncActiveSession(
        state,
        {
          selectedStackId: id,
          selected,
        },
        { selected },
      );
    }),

  setSelectedWorktreePath: (path) =>
    set((state) => {
      const selected = {
        ...state.selected,
        repositoryPath: state.activeRepoPath,
        worktreePath: path,
      };
      return syncActiveSession(
        state,
        {
          selectedWorktreePath: path,
          selected,
        },
        { selected },
      );
    }),

  setSelectedSubmodulePath: (path) =>
    set((state) => {
      const selected = {
        ...state.selected,
        repositoryPath: state.activeRepoPath,
        submodulePath: path,
      };
      return syncActiveSession(
        state,
        {
          selectedSubmodulePath: path,
          selected,
        },
        { selected },
      );
    }),

  setSelectedConflictPath: (path) =>
    set((state) => {
      const selected = {
        ...state.selected,
        repositoryPath: state.activeRepoPath,
        conflictPath: path,
      };
      return syncActiveSession(
        state,
        {
          selectedConflictPath: path,
          selected,
        },
        { selected },
      );
    }),

  setActiveView: (view) =>
    set((state) => {
      const selected = {
        ...state.selected,
        repositoryPath: state.activeRepoPath,
        commitHash: null,
        commitFilePath: null,
        filePath: null,
        fileStaged: false,
      };
      const route: AppRoute = state.activeRepoPath
        ? { area: "repository", view, repoPath: state.activeRepoPath }
        : state.route;

      return syncActiveSession(
        state,
        {
          activeView: view,
          route,
          selectedCommitHash: null,
          selectedCommitFilePath: null,
          selectedFilePath: null,
          selectedFileStaged: false,
          selected,
        },
        { activeView: view, selected },
      );
    }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  diffMode: "unified",
  setDiffMode: (mode) => set({ diffMode: mode }),

  theme: "dark",
  setTheme: (theme) => set({ theme }),
}));
