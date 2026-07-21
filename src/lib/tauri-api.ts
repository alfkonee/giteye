import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "../types/app";
import type {
  RepositoryInfo,
  RepositorySnapshot,
  BranchSummary,
  WorkspaceSummary,
  GitStatusFile,
  CommitRequest,
  CommitSummary,
  CommitDetails,
  Branch,
  Remote,
  StashEntry,
  GitTag,
  DiffResult,
  ResetMode,
  ResetPreview,
  AmendPreview,
  ReflogEntry,
  RecentRepo,
  FavoriteRepo,
  Worktree,
  Submodule,
  SubmoduleForeachStatus,
  RebaseState,
  ConflictContent,
  RebaseTodoItem,
  MergeWithOptionsRequest,
  StartRebaseRequest,
  RebasePreviewItem,
  RerereStatus,
  GitOperationSummary,
  GitIdentity,
  GitCredentialConfig,
  LfsStatus,
  SshStatus,
  RepositoryGithubOverview,
  PullRequestDiff,
  CommitSearchRequest,
  CommitSearchResult,
  FileHistoryRequest,
  FileHistoryEntry,
  BlameFileRequest,
  BlameLine,
  GitGrepRequest,
  GitGrepMatch,
  PickaxeSearchRequest,
  PickaxeSearchResult,
  LostCommit,
  BisectState,
  BisectActionSummary,
  GitFsckSummary,
  GitMaintenanceMode,
  GitMaintenanceSummary,
  GitSignatureSummary,
  GitJobRecord,
  GitJobSummary,
} from "../types/git";

export type CheckoutBranchStrategy = "move" | "stash";

export interface PushBranchRequest {
  remote: string;
  localBranch: string;
  remoteBranch?: string | null;
  setUpstream: boolean;
  forceWithLease: boolean;
}

export interface UpdateRemoteRequest {
  name: string;
  fetchUrl: string;
  pushUrl?: string | null;
}


export type PatchApplyOperation = "stage" | "unstage" | "discard";

export interface PatchApplyRequest {
  filePath: string;
  hunkPatch: string;
  operation: PatchApplyOperation;
  staged?: boolean;
}

export interface BisectStartRequest {
  badRevision?: string | null;
  goodRevisions?: string[];
  paths?: string[];
}

export type AiProvider = "openai" | "openrouter";
export type AiApiKeySource = "environment" | "stored" | "missing";

export interface AiConfigView {
  provider: AiProvider;
  model: string;
  endpoint: string;
  apiKeyConfigured: boolean;
  apiKeySource: AiApiKeySource;
}

export interface SaveAiConfigRequest {
  provider: AiProvider;
  model: string;
  endpoint: string | null;
  apiKey: string | null;
}

export const GIT_JOB_EVENT_NAME = "giteye://git-job-event";

export const gitApi = {
  getAppSettings: () =>
    invoke<AppSettings>("get_app_settings"),

  saveAppSettings: (settings: AppSettings) =>
    invoke<AppSettings>("save_app_settings", { settings }),

  openRepository: (path: string) =>
    invoke<RepositorySnapshot>("open_repository", { path }),

  initRepository: (path: string) =>
    invoke<RepositorySnapshot>("init_repository", { path }),

  cloneRepository: (url: string, destination: string) =>
    invoke<GitJobSummary>("clone_repository", { url, destination }),

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
    invoke<FavoriteRepo[]>("set_repository_favorite", {
      repoPath,
      name,
      favorite,
    }),

  removeRecentRepository: (repoPath: string) =>
    invoke<RecentRepo[]>("remove_recent_repository", { repoPath }),

  startRepositoryWatch: (repoPath: string) =>
    invoke<void>("start_repository_watch", { repoPath }),

  stopRepositoryWatch: (repoPath: string) =>
    invoke<void>("stop_repository_watch", { repoPath }),

  listGitJobs: (repoPath?: string | null) =>
    invoke<GitJobSummary[]>("list_git_jobs", { repoPath: repoPath ?? null }),

  getGitJob: (jobId: string) =>
    invoke<GitJobRecord | null>("get_git_job", { jobId }),

  cancelGitJob: (jobId: string) =>
    invoke<GitJobSummary>("cancel_git_job", { jobId }),

  clearGitJobLog: (repoPath?: string | null, jobId?: string | null) =>
    invoke<GitJobSummary[]>("clear_git_job_log", { repoPath: repoPath ?? null, jobId: jobId ?? null }),

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

  stageAll: (repoPath: string) => invoke<void>("stage_all", { repoPath }),

  cancelRepositoryGithubWork: (repoPath: string) =>
    invoke<void>("cancel_repository_github_work", { repoPath }),
  unstageAll: (repoPath: string) => invoke<void>("unstage_all", { repoPath }),

  commit: (repoPath: string, request: CommitRequest) =>
    invoke<void>("commit", {
      repoPath,
      message: request.message,
      signOff: request.signOff ?? false,
      noVerify: request.noVerify ?? false,
      allowEmpty: request.allowEmpty ?? false,
    }),

  // Commits
  getCommitHistory: (repoPath: string, limit?: number) =>
    invoke<CommitSummary[]>("get_commit_history", {
      repoPath,
      limit: limit ?? null,
    }),

  getCommitDetails: (repoPath: string, commitHash: string) =>
    invoke<CommitDetails>("get_commit_details", { repoPath, commitHash }),

  cherryPickCommit: (repoPath: string, commitHash: string) =>
    invoke<void>("cherry_pick_commit", { repoPath, commitHash }),

  revertCommit: (repoPath: string, commitHash: string) =>
    invoke<void>("revert_commit", { repoPath, commitHash }),

  previewResetToCommit: (repoPath: string, commitHash: string) =>
    invoke<ResetPreview | string>("preview_reset_to_commit", {
      repoPath,
      commitHash,
    }),

  resetToCommit: (
    repoPath: string,
    commitHash: string,
    mode: ResetMode,
    confirmDiscardChanges: boolean,
  ) =>
    invoke<void>("reset_to_commit", {
      repoPath,
      commitHash,
      mode,
      confirmDiscardChanges,
    }),

  amendCommit: (
    repoPath: string,
    message?: string | null,
    options?: Omit<CommitRequest, "message">,
  ) =>
    invoke<void>("amend_commit", {
      repoPath,
      message: message ?? null,
      signOff: options?.signOff ?? false,
      noVerify: options?.noVerify ?? false,
      allowEmpty: options?.allowEmpty ?? false,
    }),

  previewAmend: (repoPath: string, message?: string | null) =>
    invoke<AmendPreview>("preview_amend", { repoPath, message: message ?? null }),

  listReflogEntries: (repoPath: string, limit?: number | null) =>
    invoke<ReflogEntry[]>("list_reflog_entries", {
      repoPath,
      limit: limit ?? null,
    }),

  commitSearch: (repoPath: string, request: CommitSearchRequest) =>
    invoke<CommitSearchResult[]>("commit_search", {
      repoPath,
      query: request.query,
      limit: request.limit ?? null,
    }),

  fileHistory: (repoPath: string, request: FileHistoryRequest) =>
    invoke<FileHistoryEntry[]>("file_history", {
      repoPath,
      filePath: request.filePath,
      limit: request.limit ?? null,
    }),

  blameFile: (repoPath: string, request: BlameFileRequest) =>
    invoke<BlameLine[]>("blame_file", {
      repoPath,
      filePath: request.filePath,
      revision: request.revision ?? null,
      limit: request.limit ?? null,
    }),

  gitGrep: (repoPath: string, request: GitGrepRequest) =>
    invoke<GitGrepMatch[]>("git_grep", {
      repoPath,
      query: request.query,
      pathspec: request.pathspec ?? null,
      caseSensitive: request.caseSensitive ?? true,
      limit: request.limit ?? null,
    }),

  pickaxeSearch: (repoPath: string, request: PickaxeSearchRequest) =>
    invoke<PickaxeSearchResult[]>("pickaxe_search", {
      repoPath,
      query: request.query,
      regex: request.mode === "regex",
      limit: request.limit ?? null,
    }),

  discoverLostCommits: (repoPath: string, limit?: number | null) =>
    invoke<LostCommit[]>("discover_lost_commits", {
      repoPath,
      limit: limit ?? null,
    }),

  searchReflog: (repoPath: string, query?: string | null, limit?: number | null) =>
    invoke<ReflogEntry[]>("reflog_search", {
      repoPath,
      query: query ?? null,
      limit: limit ?? null,
    }),

  checkoutReflogEntry: (repoPath: string, selector: string) =>
    invoke<void>("checkout_reflog_entry", { repoPath, selector }),

  createBranchFromReflogEntry: (
    repoPath: string,
    branchName: string,
    selector: string,
    checkout: boolean,
  ) =>
    invoke<void>("create_branch_from_reflog_entry", {
      repoPath,
      branchName,
      selector,
      checkout,
    }),

  // Branches
  listBranches: (repoPath: string) =>
    invoke<Branch[]>("list_branches", { repoPath }),

  getCurrentBranch: (repoPath: string) =>
    invoke<string>("get_current_branch", { repoPath }),

  checkoutBranch: (
    repoPath: string,
    branchName: string,
    strategy: CheckoutBranchStrategy,
  ) => invoke<void>("checkout_branch", { repoPath, branchName, strategy }),

  createBranch: (
    repoPath: string,
    branchName: string,
    checkout: boolean,
    startPoint?: string | null,
  ) =>
    invoke<void>("create_branch", {
      repoPath,
      branchName,
      checkout,
      startPoint: startPoint ?? null,
    }),


  renameBranch: (repoPath: string, oldName: string, newName: string) =>
    invoke<void>("rename_branch", { repoPath, oldName, newName }),

  setBranchUpstream: (
    repoPath: string,
    branchName: string,
    upstream?: string | null,
  ) =>
    invoke<void>("set_branch_upstream", {
      repoPath,
      branchName,
      upstream: upstream ?? null,
    }),

  fastForwardBranch: (repoPath: string, branchName: string, upstream: string) =>
    invoke<void>("fast_forward_branch", { repoPath, branchName, upstream }),

  mergeBranch: (repoPath: string, source: string) =>
    invoke<GitJobSummary>("merge_branch", { repoPath, source }),

  mergeWithOptions: (repoPath: string, request: MergeWithOptionsRequest) =>
    invoke<GitJobSummary>("merge_with_options", {
      repoPath,
      source: request.source,
      noFf: request.noFf,
      squash: request.squash,
      strategyOption: request.strategyOption,
    }),

  deleteBranch: (repoPath: string, branchName: string) =>
    invoke<void>("delete_branch", { repoPath, branchName }),

  getGitIdentity: (repoPath: string) =>
    invoke<GitIdentity>("get_git_identity", { repoPath }),

  setGitIdentity: (
    repoPath: string,
    name: string | null,
    email: string | null,
  ) => invoke<GitIdentity>("set_git_identity", { repoPath, name, email }),

  getGitCredentialConfig: (repoPath: string) =>
    invoke<GitCredentialConfig>("get_git_credential_config", { repoPath }),

  setGitCredentialHelper: (repoPath: string, helper: string | null) =>
    invoke<GitCredentialConfig>("set_git_credential_helper", {
      repoPath,
      helper,
    }),

  testGitAuthentication: (repoPath: string, remote?: string | null) =>
    invoke<{ success: boolean; remote: string; message: string }>(
      "test_git_authentication",
      { repoPath, remote: remote ?? null },
    ),

  clearCredentialCache: (repoPath: string, host?: string | null) =>
    invoke<string>("clear_credential_cache", {
      repoPath,
      host: host ?? null,
    }),

  getLfsStatus: (repoPath: string) =>
    invoke<LfsStatus>("get_lfs_status", { repoPath }),

  installLfs: (repoPath: string) => invoke<void>("install_lfs", { repoPath }),

  trackLfsPattern: (repoPath: string, pattern: string) =>
    invoke<void>("track_lfs_pattern", { repoPath, pattern }),

  untrackLfsPattern: (repoPath: string, pattern: string) =>
    invoke<void>("untrack_lfs_pattern", { repoPath, pattern }),

  getSshStatus: () => invoke<SshStatus>("get_ssh_status"),

  generateSshKey: (name: string, comment: string | null) =>
    invoke<SshStatus>("generate_ssh_key", { name, comment }),

  addSshKeyToAgent: (name: string) =>
    invoke<SshStatus>("add_ssh_key_to_agent", { name }),

  // Remotes
  listRemotes: (repoPath: string) =>
    invoke<Remote[]>("list_remotes", { repoPath }),

  fetch: (repoPath: string, remote?: string) =>
    invoke<GitJobSummary>("fetch", { repoPath, remote: remote ?? null }),

  pull: (repoPath: string, remote?: string, branch?: string) =>
    invoke<GitJobSummary>("pull", {
      repoPath,
      remote: remote ?? null,
      branch: branch ?? null,
    }),

  push: (repoPath: string, remote?: string, branch?: string) =>
    invoke<GitJobSummary>("push", {
      repoPath,
      remote: remote ?? null,
      branch: branch ?? null,
    }),

  addRemote: (repoPath: string, name: string, url: string) =>
    invoke<void>("add_remote", { repoPath, name, url }),

  updateRemote: (
    repoPath: string,
    name: string,
    fetchUrl: string,
    pushUrl?: string | null,
  ) =>
    invoke<void>("update_remote", {
      repoPath,
      name,
      fetchUrl,
      pushUrl: pushUrl ?? null,
    }),

  deleteRemote: (repoPath: string, name: string) =>
    invoke<void>("delete_remote", { repoPath, name }),

  pruneRemote: (repoPath: string, name: string) =>
    invoke<void>("prune_remote", { repoPath, name }),

  pruneRemoteDryRun: (repoPath: string, name: string) =>
    invoke<string[]>("prune_remote_dry_run", { repoPath, name }),

  pushBranch: (repoPath: string, request: PushBranchRequest) =>
    invoke<void>("push_branch", {
      repoPath,
      remote: request.remote,
      localBranch: request.localBranch,
      remoteBranch: request.remoteBranch ?? null,
      setUpstream: request.setUpstream,
      forceWithLease: request.forceWithLease,
    }),

  pushBranchDryRun: (repoPath: string, request: PushBranchRequest) =>
    invoke<string[]>("push_branch_dry_run", {
      repoPath,
      remote: request.remote,
      localBranch: request.localBranch,
      remoteBranch: request.remoteBranch ?? null,
      setUpstream: request.setUpstream,
      forceWithLease: request.forceWithLease,
    }),

  deleteRemoteBranch: (repoPath: string, remote: string, branch: string) =>
    invoke<void>("delete_remote_branch", { repoPath, remote, branch }),

  deleteRemoteBranchDryRun: (repoPath: string, remote: string, branch: string) =>
    invoke<string[]>("delete_remote_branch_dry_run", { repoPath, remote, branch }),


  // Stashes
  listStashes: (repoPath: string) =>
    invoke<StashEntry[]>("list_stashes", { repoPath }),

  createStash: (repoPath: string, message?: string, includeUntracked = true) =>
    invoke<void>("create_stash", {
      repoPath,
      message: message ?? null,
      includeUntracked,
    }),

  createStashForPaths: (
    repoPath: string,
    message: string | undefined,
    includeUntracked: boolean,
    paths: string[],
  ) =>
    invoke<void>("create_stash_for_paths", {
      repoPath,
      message: message ?? null,
      includeUntracked,
      paths,
    }),

  applyStash: (repoPath: string, stashName: string) =>
    invoke<void>("apply_stash", { repoPath, stashName }),

  popStash: (repoPath: string, stashName: string) =>
    invoke<void>("pop_stash", { repoPath, stashName }),

  previewStash: (repoPath: string, stashName: string) =>
    invoke<string[]>("preview_stash", { repoPath, stashName }),

  dropStash: (repoPath: string, stashName: string) =>
    invoke<void>("drop_stash", { repoPath, stashName }),

  // Tags
  listTags: (repoPath: string) => invoke<GitTag[]>("list_tags", { repoPath }),

  createTag: (
    repoPath: string,
    name: string,
    target?: string,
    message?: string,
  ) =>
    invoke<void>("create_tag", {
      repoPath,
      name,
      target: target ?? null,
      message: message ?? null,
    }),

  deleteTag: (repoPath: string, name: string) =>
    invoke<void>("delete_tag", { repoPath, name }),

  pushTag: (repoPath: string, remote: string, name: string) =>
    invoke<void>("push_tag", { repoPath, remote, name }),

  pushTagDryRun: (repoPath: string, remote: string, name: string) =>
    invoke<string[]>("push_tag_dry_run", { repoPath, remote, name }),

  deleteRemoteTag: (repoPath: string, remote: string, name: string) =>
    invoke<void>("delete_remote_tag", { repoPath, remote, name }),

  deleteRemoteTagDryRun: (repoPath: string, remote: string, name: string) =>
    invoke<string[]>("delete_remote_tag_dry_run", { repoPath, remote, name }),

  // Diff
  getFileDiff: (repoPath: string, filePath: string, staged: boolean) =>
    invoke<DiffResult>("get_file_diff", { repoPath, filePath, staged }),

  getCommitDiff: (repoPath: string, commitHash: string) =>
    invoke<DiffResult>("get_commit_diff", { repoPath, commitHash }),

  applyPatch: (repoPath: string, request: PatchApplyRequest) =>
    invoke<void>("apply_patch", { repoPath, request }),

  stageHunk: (repoPath: string, filePath: string, hunkPatch: string) =>
    invoke<void>("stage_hunk", { repoPath, filePath, hunkPatch }),

  unstageHunk: (repoPath: string, filePath: string, hunkPatch: string) =>
    invoke<void>("unstage_hunk", { repoPath, filePath, hunkPatch }),

  discardHunk: (repoPath: string, filePath: string, staged: boolean, hunkPatch: string) =>
    invoke<void>("discard_hunk", { repoPath, filePath, staged, hunkPatch }),

  discardFile: (repoPath: string, filePath: string, staged: boolean, untracked: boolean) =>
    invoke<void>("discard_file", { repoPath, filePath, staged, untracked }),

  // Worktrees
  listWorktrees: (repoPath: string) =>
    invoke<Worktree[]>("list_worktrees", { repoPath }),

  createWorktree: (
    repoPath: string,
    path: string,
    branch: string | null,
    createBranch: boolean,
  ) =>
    invoke<void>("create_worktree", { repoPath, path, branch, createBranch }),

  removeWorktree: (repoPath: string, path: string, force: boolean) =>
    invoke<void>("remove_worktree", { repoPath, path, force }),

  removeWorktreeDryRun: (repoPath: string, path: string, force: boolean) =>
    invoke<string[]>("remove_worktree_dry_run", { repoPath, path, force }),

  pruneWorktrees: (repoPath: string) =>
    invoke<GitJobSummary>("prune_worktrees", { repoPath }),

  pruneWorktreesDryRun: (repoPath: string) =>
    invoke<string[]>("worktree_prune_dry_run", { repoPath }),

  moveWorktree: (repoPath: string, path: string, newPath: string) =>
    invoke<void>("worktree_move", { repoPath, path, newPath }),

  lockWorktree: (repoPath: string, path: string, reason: string | null) =>
    invoke<void>("worktree_lock", { repoPath, path, reason }),

  unlockWorktree: (repoPath: string, path: string) =>
    invoke<void>("worktree_unlock", { repoPath, path }),

  repairWorktree: (repoPath: string, path: string) =>
    invoke<GitJobSummary>("worktree_repair", { repoPath, path }),

  repairWorktreeDryRun: (repoPath: string, path: string) =>
    invoke<string[]>("worktree_repair_dry_run", { repoPath, path }),

  // Submodules
  listSubmodules: (repoPath: string) =>
    invoke<Submodule[]>("list_submodules", { repoPath }),

  updateSubmodule: (repoPath: string, path: string, recursive: boolean) =>
    invoke<GitJobSummary>("update_submodule", { repoPath, path, recursive }),

  addSubmodule: (
    repoPath: string,
    url: string,
    path: string,
    branch?: string | null,
    name?: string | null,
  ) =>
    invoke<void>("add_submodule", {
      repoPath,
      url,
      path,
      branch: branch ?? null,
      name: name ?? null,
    }),

  submoduleInitUpdate: (
    repoPath: string,
    path: string | null,
    recursive: boolean,
    remote: boolean,
  ) =>
    invoke<GitJobSummary>("submodule_init_update", {
      repoPath,
      path,
      recursive,
      remote,
    }),

  submoduleSetBranch: (repoPath: string, path: string, branch: string) =>
    invoke<void>("submodule_set_branch", { repoPath, path, branch }),

  submoduleForeachStatus: (repoPath: string, recursive: boolean) =>
    invoke<SubmoduleForeachStatus[]>("submodule_foreach_status", {
      repoPath,
      recursive,
    }),

  syncSubmodules: (repoPath: string, recursive: boolean) =>
    invoke<GitJobSummary>("sync_submodules", { repoPath, recursive }),

  openSubmodule: (repoPath: string, path: string) =>
    invoke<string>("open_submodule", { repoPath, path }),

  bumpSubmodule: (repoPath: string, path: string) =>
    invoke<void>("bump_submodule", { repoPath, path }),

  // Rebase / conflicts
  getRebaseState: (repoPath: string) =>
    invoke<RebaseState>("get_rebase_state", { repoPath }),

  getConflictContent: (repoPath: string, filePath: string) =>
    invoke<ConflictContent>("get_conflict_content", { repoPath, filePath }),

  getOperationSummary: (repoPath: string) =>
    invoke<GitOperationSummary>("get_operation_summary", { repoPath }),

  getRerereStatus: (repoPath: string) =>
    invoke<RerereStatus>("get_rerere_status", { repoPath }),

  getRerereConfig: (repoPath: string) =>
    invoke<boolean>("get_rerere_config", { repoPath }),

  setRerereEnabled: (repoPath: string, enabled: boolean) =>
    invoke<RerereStatus>("set_rerere_enabled", { repoPath, enabled }),

  previewRebase: (repoPath: string, request: StartRebaseRequest) =>
    invoke<RebasePreviewItem[]>("preview_rebase", {
      repoPath,
      upstream: request.upstream,
      onto: request.onto ?? null,
      branch: request.branch,
    }),

  rebaseOnto: (repoPath: string, request: StartRebaseRequest) =>
    invoke<GitJobSummary>("rebase_onto", {
      repoPath,
      upstream: request.upstream,
      onto: request.onto ?? "",
      branch: request.branch,
      autostash: request.autostash,
    }),

  rebaseUpstream: (repoPath: string, request: StartRebaseRequest) =>
    invoke<GitJobSummary>("rebase_upstream", {
      repoPath,
      upstream: request.upstream,
      branch: request.branch,
      autostash: request.autostash,
    }),

  continueRebase: (repoPath: string) =>
    invoke<GitJobSummary>("continue_rebase", { repoPath }),

  abortRebase: (repoPath: string) => invoke<GitJobSummary>("abort_rebase", { repoPath }),

  skipRebase: (repoPath: string) => invoke<GitJobSummary>("skip_rebase", { repoPath }),

  markFileResolved: (repoPath: string, filePath: string) =>
    invoke<void>("mark_file_resolved", { repoPath, filePath }),

  checkoutConflictSide: (
    repoPath: string,
    filePath: string,
    side: "ours" | "theirs",
  ) => invoke<void>("checkout_conflict_side", { repoPath, filePath, side }),

  updateRebaseTodo: (repoPath: string, items: RebaseTodoItem[]) =>
    invoke<void>("update_rebase_todo", { repoPath, items }),

  // Diagnostics / bisect
  getBisectState: (repositoryPath: string) =>
    invoke<BisectState>("get_bisect_state", { repositoryPath }),

  bisectStart: (repositoryPath: string, request: BisectStartRequest) =>
    invoke<BisectActionSummary>("bisect_start", {
      repositoryPath,
      badRevision: request.badRevision ?? null,
      goodRevisions: request.goodRevisions ?? [],
      paths: request.paths ?? [],
    }),

  bisectGood: (repositoryPath: string, revision?: string | null) =>
    invoke<BisectActionSummary>("bisect_good", { repositoryPath, revision: revision ?? null }),

  bisectBad: (repositoryPath: string, revision?: string | null) =>
    invoke<BisectActionSummary>("bisect_bad", { repositoryPath, revision: revision ?? null }),

  bisectSkip: (repositoryPath: string, revision?: string | null) =>
    invoke<BisectActionSummary>("bisect_skip", { repositoryPath, revision: revision ?? null }),

  bisectReset: (repositoryPath: string, revision?: string | null) =>
    invoke<BisectActionSummary>("bisect_reset", { repositoryPath, revision: revision ?? null }),

  runGitFsck: (repositoryPath: string, full: boolean, strict: boolean) =>
    invoke<GitFsckSummary>("run_git_fsck", { repositoryPath, full, strict }),

  runGitMaintenance: (repositoryPath: string, mode: GitMaintenanceMode) =>
    invoke<GitMaintenanceSummary>("run_git_maintenance", { repositoryPath, mode }),

  verifyGitSignature: (repositoryPath: string, target: string) =>
    invoke<GitSignatureSummary>("verify_git_signature", {
      repositoryPath,
      target,
    }),

  // GitHub metadata
  getRepositoryGithubOverview: (repoPath: string) =>
    invoke<RepositoryGithubOverview>("get_repository_github_overview", {
      repoPath,
    }),

  getPullRequestDiff: (repoPath: string, number: number) =>
    invoke<PullRequestDiff>("get_pull_request_diff", { repoPath, number }),

  checkoutPullRequest: (repoPath: string, number: number) =>
    invoke<void>("checkout_pull_request", { repoPath, number }),

  updatePullRequestBranch: (repoPath: string, number: number) =>
    invoke<void>("update_pull_request_branch", { repoPath, number }),

  requestPullRequestReview: (
    repoPath: string,
    number: number,
    reviewers: string[],
    teams: string[] = [],
  ) =>
    invoke<void>("request_pull_request_review", {
      repoPath,
      number,
      reviewers,
      teams,
    }),

  submitPullRequestReview: (
    repoPath: string,
    number: number,
    event: "approve" | "request_changes" | "comment",
    body?: string,
  ) =>
    invoke<void>("submit_pull_request_review", {
      repoPath,
      number,
      event,
      body: body ?? null,
    }),

  submitPullRequestLineComment: (
    repoPath: string,
    number: number,
    path: string,
    line: number,
    side: "LEFT" | "RIGHT",
    body: string,
  ) =>
    invoke<void>("submit_pull_request_line_comment", {
      repoPath,
      number,
      path,
      line,
      side,
      body,
    }),

  addPullRequestLabel: (repoPath: string, number: number, labels: string[]) =>
    invoke<void>("add_pull_request_label", { repoPath, number, labels }),

  removePullRequestLabel: (
    repoPath: string,
    number: number,
    labels: string[],
  ) => invoke<void>("remove_pull_request_label", { repoPath, number, labels }),

  mergePullRequest: (
    repoPath: string,
    number: number,
    method: "merge" | "rebase" | "squash",
    options: { admin?: boolean; deleteBranch?: boolean } = {},
  ) =>
    invoke<void>("merge_pull_request", {
      repoPath,
      number,
      method,
      admin: options.admin ?? false,
      deleteBranch: options.deleteBranch ?? true,
    }),

  closePullRequest: (repoPath: string, number: number) =>
    invoke<void>("close_pull_request", { repoPath, number }),

  exportSettings: (outputPath: string, theme: string, diffMode: string) =>
    invoke<string>("export_settings", { outputPath, theme, diffMode }),

  importSettings: (inputPath: string) =>
    invoke<{ theme: string; diffMode: string }>("import_settings", { inputPath }),

  runCustomGitCommand: (repoPath: string, args: string[]) =>
    invoke<{ success: boolean; stdout: string; stderr: string; exitCode: number }>(
      "run_custom_git_command",
      { repoPath, args },
    ),

  getAiConfig: () =>
    invoke<AiConfigView>("get_ai_config"),

  saveAiConfig: (request: SaveAiConfigRequest) =>
    invoke<AiConfigView>("save_ai_config", { request }),

  resolveConflictWithAi: (base: string, ours: string, theirs: string) =>
    invoke<string>("resolve_conflict_with_ai", { base, ours, theirs }),

  suggestCommitMessage: (diffs: Array<{ filePath: string; status: string; diffText: string }>) =>
    invoke<string>("suggest_commit_message", { diffs }),
};
