export interface RepositoryInfo {
  path: string;
  name: string;
  currentBranch: string;
  isClean: boolean;
  headCommit: string | null;
  ahead: number;
  behind: number;
}

export interface GitStatusSummary {
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  ignoredCount: number;
  totalCount: number;
}

export interface RepositorySnapshot {
  repositoryInfo: RepositoryInfo;
  files: GitStatusFile[];
  summary: GitStatusSummary;
}

export interface BranchSummary {
  currentBranch: string;
  localCount: number;
  remoteCount: number;
  ahead: number;
  behind: number;
}

export interface WorkspaceSummary {
  worktreeCount: number;
  dirtyWorktreeCount: number;
  submoduleCount: number;
  behindSubmoduleCount: number;
}

export interface GitStatusFile {
  path: string;
  status: string;
  staged: boolean;
  unstaged: boolean;
  oldPath: string | null;
}

export interface CommitSummary {
  hash: string;
  shortHash: string;
  message: string;
  authorName: string;
  authorEmail: string;
  timestamp: string;
  refs: string[];
  parents: string[];
}

export interface CommitDetails {
  hash: string;
  message: string;
  body: string | null;
  authorName: string;
  authorEmail: string;
  committerName: string;
  committerEmail: string;
  timestamp: string;
  parents: string[];
  changedFiles: string[];
}

export interface Branch {
  name: string;
  shortName: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
}

export interface GitIdentity {
  localName: string | null;
  localEmail: string | null;
  globalName: string | null;
  globalEmail: string | null;
  effectiveName: string | null;
  effectiveEmail: string | null;
}

export interface GitCredentialConfig {
  localHelpers: string[];
  globalHelpers: string[];
  effectiveHelpers: string[];
}

export interface LfsStatus {
  available: boolean;
  version: string | null;
  trackedPatterns: LfsTrackPattern[];
  files: LfsFile[];
  error: string | null;
}

export interface LfsTrackPattern {
  pattern: string;
  source: string | null;
}

export interface LfsFile {
  oid: string;
  size: string | null;
  path: string;
}

export interface SshStatus {
  sshDir: string;
  sshKeygenAvailable: boolean;
  agentAvailable: boolean;
  agentError: string | null;
  keys: SshKey[];
  agentIdentities: SshAgentIdentity[];
}

export interface SshKey {
  name: string;
  privateKeyPath: string;
  publicKeyPath: string;
  keyType: string | null;
  fingerprint: string | null;
  comment: string | null;
  publicKey: string | null;
  hasPrivateKey: boolean;
  loadedInAgent: boolean;
}

export interface SshAgentIdentity {
  fingerprint: string;
  keyType: string | null;
  comment: string | null;
}

export interface Remote {
  name: string;
  url: string;
  fetchUrl: string | null;
  pushUrl: string | null;
}

export interface StashEntry {
  name: string;
  index: number;
  branch: string | null;
  message: string;
  commitHash: string;
  shortHash: string;
  timestamp: string | null;
}

export interface GitTag {
  name: string;
  commitHash: string;
  shortHash: string;
  subject: string | null;
  tagger: string | null;
  timestamp: string | null;
  annotated: boolean;
}

export interface DiffResult {
  filePath: string;
  oldFilePath: string | null;
  diffText: string;
  additions: number;
  deletions: number;
  isBinary: boolean;
}

export interface RecentRepo {
  path: string;
  name: string;
  lastOpenedAt: string;
}

export interface FavoriteRepo {
  path: string;
  name: string;
  favoritedAt: string;
}

export interface Worktree {
  path: string;
  branch: string | null;
  head: string | null;
  isCurrent: boolean;
  isBare: boolean;
  isDetached: boolean;
  isLocked: boolean;
  lockReason: string | null;
  prunable: boolean;
  status: string;
  modifiedFiles: number;
  stagedFiles: number;
  ahead: number;
  behind: number;
  updatedAt: string | null;
}

export interface Submodule {
  path: string;
  name: string;
  url: string | null;
  branch: string | null;
  pinnedCommit: string | null;
  currentCommit: string | null;
  status: string;
  isInitialized: boolean;
  isRecursive: boolean;
  behind: number;
  ahead: number;
  hasChanges: boolean;
}

export interface RebaseTodoItem {
  action: string;
  commit: string;
  message: string;
  raw: string;
  completed: boolean;
}

export interface ConflictFile {
  path: string;
}

export interface ConflictContent {
  filePath: string;
  base: string;
  ours: string;
  theirs: string;
  result: string;
}

export interface RebaseState {
  inProgress: boolean;
  rebaseDir: string | null;
  headName: string | null;
  onto: string | null;
  origHead: string | null;
  currentStep: number | null;
  totalSteps: number | null;
  todo: RebaseTodoItem[];
  done: RebaseTodoItem[];
  conflicts: ConflictFile[];
}

export interface GitHubAccount {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  htmlUrl: string | null;
}
export interface LabelSummary {
  name: string;
  color: string | null;
  description: string | null;
}

export interface ReviewRequestSummary {
  login: string;
  kind: string;
}


export interface PullRequestSummary {
  number: number;
  title: string;
  state: string;
  author: string | null;
  url: string | null;
  headRefName: string | null;
  baseRefName: string | null;
  isDraft: boolean;
  updatedAt: string | null;
  labels: LabelSummary[];
  reviewRequests: ReviewRequestSummary[];
  reviewDecision: string | null;
  mergeStateStatus: string | null;
}

export interface PullRequestFileDiff {
  path: string;
  additions: number;
  deletions: number;
  status: string;
}

export interface ReviewCommentSummary {
  id: number;
  author: string | null;
  path: string | null;
  line: number | null;
  body: string;
  url: string | null;
  createdAt: string | null;
}

export interface PullRequestDiff {
  number: number;
  title: string | null;
  url: string | null;
  diffText: string;
  files: PullRequestFileDiff[];
  comments: ReviewCommentSummary[];
  reviews: ReviewSummary[];
  checkRuns: CheckRunSummary[];
  activity: ActivityItem[];
}

export interface CheckRunSummary {
  name: string;
  state: string | null;
  conclusion: string | null;
  url: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ReviewSummary {
  author: string | null;
  state: string;
  submittedAt: string | null;
  url: string | null;
}

export interface ActivityItem {
  id: string;
  kind: string;
  actor: string | null;
  title: string | null;
  url: string | null;
  createdAt: string | null;
}

export interface RepositoryGithubOverview {
  providerAvailable: boolean;
  isGithubRepository: boolean;
  owner: string | null;
  repo: string | null;
  remoteUrl: string | null;
  account: GitHubAccount | null;
  pullRequests: PullRequestSummary[];
  checkRuns: CheckRunSummary[];
  reviews: ReviewSummary[];
  activity: ActivityItem[];
}

export type GlobalViewType = "repo-hub";

export type RepositoryViewType =
  | "working-tree"
  | "history"
  | "branches"
  | "remotes"
  | "stashes"
  | "tags"
  | "lfs"
  | "stacked-prs"
  | "review-studio"
  | "worktrees"
  | "submodules"
  | "rebase-conflicts"
  | "settings";

export type ViewType = RepositoryViewType;

export type AppRoute =
  | { area: "global"; view: GlobalViewType }
  | { area: "repository"; view: RepositoryViewType; repoPath: string };

export interface SelectedEntityState {
  repositoryPath: string | null;
  branchName: string | null;
  commitHash: string | null;
  filePath: string | null;
  commitFilePath: string | null;
  fileStaged: boolean;
  pullRequestId: string | null;
  stackId: string | null;
  worktreePath: string | null;
  submodulePath: string | null;
  conflictPath: string | null;
}
export type DiffMode = "unified" | "split";

export type FileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "ignored"
  | "conflict"
  | "typechange";

export function parseFileStatus(xyStatus: string): FileStatus {
  const x = xyStatus[0];
  const y = xyStatus[1];

  if ((x === "D" && y === "D") || (x === "A" && y === "A") || (x === "U" && y === "U")) return "conflict";
  if (x === "?" && y === "?") return "untracked";
  if (x === "!" && y === "!") return "ignored";
  if (x === "R") return "renamed";
  if (x === "C") return "copied";
  if (x === "T" || y === "T") return "typechange";
  if (x === "A" || y === "A") return "added";
  if (x === "D" || y === "D") return "deleted";
  return "modified";
}
