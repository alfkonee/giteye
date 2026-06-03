import { invoke } from "@tauri-apps/api/core";
import type {
  RepositoryInfo,
  GitStatusFile,
  CommitSummary,
  CommitDetails,
  Branch,
  Remote,
  DiffResult,
  RecentRepo,
  Worktree,
  Submodule,
  RebaseState,
  ConflictContent,
  RebaseTodoItem,
  RepositoryGithubOverview,
} from "../types/git";

export const gitApi = {
  // Repository
  openRepository: (path: string) =>
    invoke<RepositoryInfo>("open_repository", { path }),

  getRepositoryInfo: (path: string) =>
    invoke<RepositoryInfo>("get_repository_info", { path }),

  listRecentRepositories: () =>
    invoke<RecentRepo[]>("list_recent_repositories"),

  // Status
  getStatus: (repoPath: string) =>
    invoke<GitStatusFile[]>("get_status", { repoPath }),

  getStagedFiles: (repoPath: string) =>
    invoke<GitStatusFile[]>("get_staged_files", { repoPath }),

  getUnstagedFiles: (repoPath: string) =>
    invoke<GitStatusFile[]>("get_unstaged_files", { repoPath }),

  stageFile: (repoPath: string, filePath: string) =>
    invoke<void>("stage_file", { repoPath, filePath }),

  unstageFile: (repoPath: string, filePath: string) =>
    invoke<void>("unstage_file", { repoPath, filePath }),

  stageAll: (repoPath: string) =>
    invoke<void>("stage_all", { repoPath }),

  unstageAll: (repoPath: string) =>
    invoke<void>("unstage_all", { repoPath }),

  commit: (repoPath: string, message: string) =>
    invoke<void>("commit", { repoPath, message }),

  // Commits
  getCommitHistory: (repoPath: string, limit?: number) =>
    invoke<CommitSummary[]>("get_commit_history", { repoPath, limit: limit ?? null }),

  getCommitDetails: (repoPath: string, commitHash: string) =>
    invoke<CommitDetails>("get_commit_details", { repoPath, commitHash }),

  // Branches
  listBranches: (repoPath: string) =>
    invoke<Branch[]>("list_branches", { repoPath }),

  getCurrentBranch: (repoPath: string) =>
    invoke<string>("get_current_branch", { repoPath }),

  checkoutBranch: (repoPath: string, branchName: string) =>
    invoke<void>("checkout_branch", { repoPath, branchName }),

  createBranch: (repoPath: string, branchName: string, checkout: boolean) =>
    invoke<void>("create_branch", { repoPath, branchName, checkout }),

  deleteBranch: (repoPath: string, branchName: string) =>
    invoke<void>("delete_branch", { repoPath, branchName }),

  // Remotes
  listRemotes: (repoPath: string) =>
    invoke<Remote[]>("list_remotes", { repoPath }),

  fetch: (repoPath: string, remote?: string) =>
    invoke<void>("fetch", { repoPath, remote: remote ?? null }),

  pull: (repoPath: string, remote?: string, branch?: string) =>
    invoke<void>("pull", { repoPath, remote: remote ?? null, branch: branch ?? null }),

  push: (repoPath: string, remote?: string, branch?: string) =>
    invoke<void>("push", { repoPath, remote: remote ?? null, branch: branch ?? null }),

  // Diff
  getFileDiff: (repoPath: string, filePath: string, staged: boolean) =>
    invoke<DiffResult>("get_file_diff", { repoPath, filePath, staged }),

  getCommitDiff: (repoPath: string, commitHash: string) =>
    invoke<DiffResult>("get_commit_diff", { repoPath, commitHash }),

  // Worktrees
  listWorktrees: (repoPath: string) =>
    invoke<Worktree[]>("list_worktrees", { repoPath }),

  createWorktree: (repoPath: string, path: string, branch: string | null, createBranch: boolean) =>
    invoke<void>("create_worktree", { repoPath, path, branch, createBranch }),

  removeWorktree: (repoPath: string, path: string, force: boolean) =>
    invoke<void>("remove_worktree", { repoPath, path, force }),

  pruneWorktrees: (repoPath: string) =>
    invoke<void>("prune_worktrees", { repoPath }),

  // Submodules
  listSubmodules: (repoPath: string) =>
    invoke<Submodule[]>("list_submodules", { repoPath }),

  updateSubmodule: (repoPath: string, path: string, recursive: boolean) =>
    invoke<void>("update_submodule", { repoPath, path, recursive }),

  syncSubmodules: (repoPath: string, recursive: boolean) =>
    invoke<void>("sync_submodules", { repoPath, recursive }),

  openSubmodule: (repoPath: string, path: string) =>
    invoke<string>("open_submodule", { repoPath, path }),

  bumpSubmodule: (repoPath: string, path: string) =>
    invoke<void>("bump_submodule", { repoPath, path }),

  // Rebase / conflicts
  getRebaseState: (repoPath: string) =>
    invoke<RebaseState>("get_rebase_state", { repoPath }),

  getConflictContent: (repoPath: string, filePath: string) =>
    invoke<ConflictContent>("get_conflict_content", { repoPath, filePath }),

  continueRebase: (repoPath: string) =>
    invoke<void>("continue_rebase", { repoPath }),

  abortRebase: (repoPath: string) =>
    invoke<void>("abort_rebase", { repoPath }),

  skipRebase: (repoPath: string) =>
    invoke<void>("skip_rebase", { repoPath }),

  markFileResolved: (repoPath: string, filePath: string) =>
    invoke<void>("mark_file_resolved", { repoPath, filePath }),

  updateRebaseTodo: (repoPath: string, items: RebaseTodoItem[]) =>
    invoke<void>("update_rebase_todo", { repoPath, items }),

  // GitHub metadata
  getRepositoryGithubOverview: (repoPath: string) =>
    invoke<RepositoryGithubOverview>("get_repository_github_overview", { repoPath }),
};
