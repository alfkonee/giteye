import { invoke } from "@tauri-apps/api/core";
import type {
  RepositoryInfo,
  RepositorySnapshot,
  BranchSummary,
  WorkspaceSummary,
  GitStatusFile,
  CommitSummary,
  CommitDetails,
  Branch,
  Remote,
  StashEntry,
  GitTag,
  DiffResult,
  RecentRepo,
  FavoriteRepo,
  Worktree,
  Submodule,
  RebaseState,
  ConflictContent,
  RebaseTodoItem,
  GitIdentity,
  GitCredentialConfig,
  LfsStatus,
  SshStatus,
  RepositoryGithubOverview,
  PullRequestDiff,
} from "../types/git";

export type CheckoutBranchStrategy = "move" | "stash";

export const gitApi = {
  openRepository: (path: string) =>
    invoke<RepositorySnapshot>("open_repository", { path }),

  initRepository: (path: string) =>
    invoke<RepositorySnapshot>("init_repository", { path }),

  cloneRepository: (url: string, destination: string) =>
    invoke<RepositorySnapshot>("clone_repository", { url, destination }),

  getRepositoryInfo: (path: string) =>
    invoke<RepositoryInfo>("get_repository_info", { path }),

  getRepositorySnapshot: (path: string) =>
    invoke<RepositorySnapshot>("get_repository_snapshot", { path }),


  getBranchSummary: (path: string) =>
    invoke<BranchSummary>("get_branch_summary", { path }),

  getWorkspaceSummary: (path: string) =>
    invoke<WorkspaceSummary>("get_workspace_summary", { path }),

  warmRepositoryContext: (repoPath: string, includeGithub: boolean) =>
    invoke<void>("warm_repository_context", { repoPath, includeGithub }),
  listRecentRepositories: () =>
    invoke<RecentRepo[]>("list_recent_repositories"),

  listFavoriteRepositories: () =>
    invoke<FavoriteRepo[]>("list_favorite_repositories"),

  setRepositoryFavorite: (repoPath: string, name: string, favorite: boolean) =>
    invoke<FavoriteRepo[]>("set_repository_favorite", { repoPath, name, favorite }),

  startRepositoryWatch: (repoPath: string) =>
    invoke<void>("start_repository_watch", { repoPath }),

  stopRepositoryWatch: (repoPath: string) =>
    invoke<void>("stop_repository_watch", { repoPath }),

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


  cancelRepositoryGithubWork: (repoPath: string) =>
    invoke<void>("cancel_repository_github_work", { repoPath }),
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

  checkoutBranch: (repoPath: string, branchName: string, strategy: CheckoutBranchStrategy) =>
    invoke<void>("checkout_branch", { repoPath, branchName, strategy }),

  createBranch: (repoPath: string, branchName: string, checkout: boolean, startPoint?: string | null) =>
    invoke<void>("create_branch", { repoPath, branchName, checkout, startPoint: startPoint ?? null }),

  fastForwardBranch: (repoPath: string, branchName: string, upstream: string) =>
    invoke<void>("fast_forward_branch", { repoPath, branchName, upstream }),

  mergeBranch: (repoPath: string, source: string) =>
    invoke<void>("merge_branch", { repoPath, source }),

  deleteBranch: (repoPath: string, branchName: string) =>
    invoke<void>("delete_branch", { repoPath, branchName }),

  getGitIdentity: (repoPath: string) =>
    invoke<GitIdentity>("get_git_identity", { repoPath }),

  setGitIdentity: (repoPath: string, name: string | null, email: string | null) =>
    invoke<GitIdentity>("set_git_identity", { repoPath, name, email }),

  getGitCredentialConfig: (repoPath: string) =>
    invoke<GitCredentialConfig>("get_git_credential_config", { repoPath }),

  setGitCredentialHelper: (repoPath: string, helper: string | null) =>
    invoke<GitCredentialConfig>("set_git_credential_helper", { repoPath, helper }),

  getLfsStatus: (repoPath: string) =>
    invoke<LfsStatus>("get_lfs_status", { repoPath }),

  installLfs: (repoPath: string) =>
    invoke<void>("install_lfs", { repoPath }),

  trackLfsPattern: (repoPath: string, pattern: string) =>
    invoke<void>("track_lfs_pattern", { repoPath, pattern }),

  untrackLfsPattern: (repoPath: string, pattern: string) =>
    invoke<void>("untrack_lfs_pattern", { repoPath, pattern }),

  getSshStatus: () =>
    invoke<SshStatus>("get_ssh_status"),

  generateSshKey: (name: string, comment: string | null) =>
    invoke<SshStatus>("generate_ssh_key", { name, comment }),

  addSshKeyToAgent: (name: string) =>
    invoke<SshStatus>("add_ssh_key_to_agent", { name }),

  // Remotes
  listRemotes: (repoPath: string) =>
    invoke<Remote[]>("list_remotes", { repoPath }),

  fetch: (repoPath: string, remote?: string) =>
    invoke<void>("fetch", { repoPath, remote: remote ?? null }),

  pull: (repoPath: string, remote?: string, branch?: string) =>
    invoke<void>("pull", { repoPath, remote: remote ?? null, branch: branch ?? null }),

  push: (repoPath: string, remote?: string, branch?: string) =>
    invoke<void>("push", { repoPath, remote: remote ?? null, branch: branch ?? null }),

  // Stashes
  listStashes: (repoPath: string) =>
    invoke<StashEntry[]>("list_stashes", { repoPath }),

  createStash: (repoPath: string, message?: string, includeUntracked = true) =>
    invoke<void>("create_stash", { repoPath, message: message ?? null, includeUntracked }),

  applyStash: (repoPath: string, stashName: string) =>
    invoke<void>("apply_stash", { repoPath, stashName }),

  popStash: (repoPath: string, stashName: string) =>
    invoke<void>("pop_stash", { repoPath, stashName }),

  dropStash: (repoPath: string, stashName: string) =>
    invoke<void>("drop_stash", { repoPath, stashName }),

  // Tags
  listTags: (repoPath: string) =>
    invoke<GitTag[]>("list_tags", { repoPath }),

  createTag: (repoPath: string, name: string, target?: string, message?: string) =>
    invoke<void>("create_tag", { repoPath, name, target: target ?? null, message: message ?? null }),

  deleteTag: (repoPath: string, name: string) =>
    invoke<void>("delete_tag", { repoPath, name }),

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

  checkoutConflictSide: (repoPath: string, filePath: string, side: "ours" | "theirs") =>
    invoke<void>("checkout_conflict_side", { repoPath, filePath, side }),

  updateRebaseTodo: (repoPath: string, items: RebaseTodoItem[]) =>
    invoke<void>("update_rebase_todo", { repoPath, items }),

  // GitHub metadata
  getRepositoryGithubOverview: (repoPath: string) =>
    invoke<RepositoryGithubOverview>("get_repository_github_overview", { repoPath }),

  getPullRequestDiff: (repoPath: string, number: number) =>
    invoke<PullRequestDiff>("get_pull_request_diff", { repoPath, number }),

  checkoutPullRequest: (repoPath: string, number: number) =>
    invoke<void>("checkout_pull_request", { repoPath, number }),

  updatePullRequestBranch: (repoPath: string, number: number) =>
    invoke<void>("update_pull_request_branch", { repoPath, number }),

  requestPullRequestReview: (repoPath: string, number: number, reviewers: string[], teams: string[] = []) =>
    invoke<void>("request_pull_request_review", { repoPath, number, reviewers, teams }),

  submitPullRequestReview: (repoPath: string, number: number, event: "approve" | "request_changes" | "comment", body?: string) =>
    invoke<void>("submit_pull_request_review", { repoPath, number, event, body: body ?? null }),

  submitPullRequestLineComment: (repoPath: string, number: number, path: string, line: number, side: "LEFT" | "RIGHT", body: string) =>
    invoke<void>("submit_pull_request_line_comment", { repoPath, number, path, line, side, body }),

  addPullRequestLabel: (repoPath: string, number: number, labels: string[]) =>
    invoke<void>("add_pull_request_label", { repoPath, number, labels }),

  removePullRequestLabel: (repoPath: string, number: number, labels: string[]) =>
    invoke<void>("remove_pull_request_label", { repoPath, number, labels }),

  mergePullRequest: (repoPath: string, number: number, method: "merge" | "rebase" | "squash") =>
    invoke<void>("merge_pull_request", { repoPath, number, method }),
};
