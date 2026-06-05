import { create } from "zustand";
import type { AppRoute, ViewType, DiffMode, SelectedEntityState } from "../types/git";

export interface AppStore {
  // Active repository path
  activeRepoPath: string | null;
  setActiveRepoPath: (path: string | null) => void;
  route: AppRoute;
  selected: SelectedEntityState;

  selectedBranchName: string | null;
  setSelectedBranchName: (name: string | null) => void;

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

export const useAppStore = create<AppStore>((set) => ({
  activeRepoPath: null,
  route: { area: "global", view: "repo-hub" },
  selected: {
    repositoryPath: null,
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
  },
  setActiveRepoPath: (path) =>
    set({
      activeRepoPath: path,
      route: path ? { area: "repository", view: "working-tree", repoPath: path } : { area: "global", view: "repo-hub" },
      selected: {
        repositoryPath: path,
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
      },
      selectedCommitHash: null,
      selectedCommitFilePath: null,
      selectedFilePath: null,
      selectedFileStaged: false,
      selectedBranchName: null,
      selectedPullRequestId: null,
      selectedStackId: null,
      selectedWorktreePath: null,
      selectedSubmodulePath: null,
      selectedConflictPath: null,
    }),

  selectedBranchName: null,
  setSelectedBranchName: (name) =>
    set((state) => ({
      selectedBranchName: name,
      selected: { ...state.selected, branchName: name },
    })),

  selectedCommitHash: null,
  selectedCommitFilePath: null,
  setSelectedCommitHash: (hash) =>
    set((state) => ({
      selectedCommitHash: hash,
      selectedCommitFilePath: null,
      selectedFilePath: null,
      selectedFileStaged: false,
      selected: { ...state.selected, commitHash: hash, commitFilePath: null, filePath: null, fileStaged: false },
    })),

  setSelectedCommitFilePath: (path) =>
    set((state) => ({
      selectedCommitFilePath: path,
      selected: { ...state.selected, commitFilePath: path },
    })),

  selectedFilePath: null,
  selectedFileStaged: false,
  setSelectedFile: (path, staged) =>
    set((state) => ({
      selectedFilePath: path,
      selectedFileStaged: staged,
      selectedCommitFilePath: null,
      selected: { ...state.selected, filePath: path, fileStaged: staged, commitFilePath: null },
    })),

  selectedPullRequestId: null,
  setSelectedPullRequestId: (id) =>
    set((state) => ({
      selectedPullRequestId: id,
      selected: { ...state.selected, pullRequestId: id },
    })),

  selectedStackId: null,
  setSelectedStackId: (id) =>
    set((state) => ({
      selectedStackId: id,
      selected: { ...state.selected, stackId: id },
    })),

  selectedWorktreePath: null,
  setSelectedWorktreePath: (path) =>
    set((state) => ({
      selectedWorktreePath: path,
      selected: { ...state.selected, worktreePath: path },
    })),

  selectedSubmodulePath: null,
  setSelectedSubmodulePath: (path) =>
    set((state) => ({
      selectedSubmodulePath: path,
      selected: { ...state.selected, submodulePath: path },
    })),

  selectedConflictPath: null,
  setSelectedConflictPath: (path) =>
    set((state) => ({
      selectedConflictPath: path,
      selected: { ...state.selected, conflictPath: path },
    })),

  activeView: "working-tree",
  setActiveView: (view) =>
    set((state) => ({
      activeView: view,
      route: state.activeRepoPath ? { area: "repository", view, repoPath: state.activeRepoPath } : state.route,
      selectedCommitHash: null,
      selectedCommitFilePath: null,
      selectedFilePath: null,
      selectedFileStaged: false,
      selected: { ...state.selected, commitHash: null, commitFilePath: null, filePath: null, fileStaged: false },
    })),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  diffMode: "unified",
  setDiffMode: (mode) => set({ diffMode: mode }),

  theme: "dark",
  setTheme: (theme) => set({ theme }),
}));
