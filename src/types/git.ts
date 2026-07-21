export interface RepositoryParent {
  path: string;
  name: string;
  submodulePath: string;
}

export interface RepositoryInfo {
  path: string;
  name: string;
  currentBranch: string;
  isClean: boolean;
  headCommit: string | null;
  ahead: number;
  behind: number;
  submoduleParent: RepositoryParent | null;
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

export interface CommitRequest {
  message: string;
  signOff?: boolean;
  noVerify?: boolean;
  allowEmpty?: boolean;
}

export type ResetMode = "soft" | "mixed" | "hard";

export interface ResetPreviewFile {
  status: string;
  path: string;
}

export interface ResetPreview {
  targetCommit?: CommitSummary | null;
  currentHead?: string | null;
  targetHash?: string | null;
  targetSubject?: string | null;
  commitsToRemove?: CommitSummary[];
  changedFiles?: ResetPreviewFile[];
  filesChanged?: string[];
  warnings?: string[];
  summary?: string | null;
}

export interface RebasePreviewItem {
  action: string;
  commit: string;
  message: string;
}

export interface AmendPreview {
  head: CommitSummary;
  message: string;
  stagedFiles: ResetPreviewFile[];
}

export interface ReflogEntry {
  selector: string;
  hash: string;
  shortHash?: string | null;
  message: string;
  action?: string | null;
  authorName?: string | null;
  timestamp?: string | null;
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

export interface SubmoduleForeachStatus {
  path: string;
  branch: string | null;
  head: string | null;
  status: string;
  modifiedFiles: number;
  stagedFiles: number;
  ahead: number;
  behind: number;
  detached: boolean;
  initialized: boolean;
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

export type MergeStrategyOption =
  | "ours"
  | "theirs"
  | "ignore-space-change"
  | "ignore-all-space"
  | "ignore-space-at-eol"
  | "ignore-cr-at-eol"
  | "renormalize"
  | "no-renormalize"
  | "patience"
  | "diff-algorithm=patience"
  | "diff-algorithm=minimal"
  | "diff-algorithm=histogram"
  | "diff-algorithm=myers";

export interface MergeWithOptionsRequest {
  source: string;
  noFf: boolean;
  squash: boolean;
  strategyOption: MergeStrategyOption | null;
}

export interface StartRebaseRequest {
  upstream: string;
  branch: string | null;
  onto: string | null;
  autostash: boolean;
}

export interface RerereStatus {
  enabled: boolean;
  paths: string[];
}

export interface OperationConflict {
  path: string;
  status: string;
  conflictType: string;
}

export interface GitOperationSummary {
  operation: string | null;
  inRebase: boolean;
  inMerge: boolean;
  inCherryPick: boolean;
  inRevert: boolean;
  rebase: RebaseState;
  mergeHead: string | null;
  cherryPickHead: string | null;
  revertHead: string | null;
  conflicts: OperationConflict[];
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
  fetchError: string | null;
}

export interface CheckRunSummary {
  name: string;
  state: string | null;
  conclusion: string | null;
  bucket: string | null;
  workflow: string | null;
  event: string | null;
  description: string | null;
  url: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ReviewSummary {
  author: string | null;
  state: string;
  submittedAt: string | null;
  body: string | null;
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

export interface CommitSearchRequest {
  query: string;
  limit?: number | null;
}

export interface FileHistoryRequest {
  filePath: string;
  limit?: number | null;
}

export interface BlameFileRequest {
  filePath: string;
  revision?: string | null;
  limit?: number | null;
}

export interface GitGrepRequest {
  query: string;
  pathspec?: string | null;
  caseSensitive?: boolean;
  limit?: number | null;
}

export type PickaxeSearchMode = "literal" | "regex";

export interface PickaxeSearchRequest {
  query: string;
  mode: PickaxeSearchMode;
  limit?: number | null;
}

export interface FileChange {
  status: string;
  path: string;
  previousPath?: string | null;
}

export interface CommitSearchResult {
  hash: string;
  shortHash: string;
  message: string;
  authorName: string;
  authorEmail: string;
  timestamp: string;
  refs: string[];
  parents: string[];
}

export interface FileHistoryEntry {
  hash: string;
  shortHash: string;
  message: string;
  authorName: string;
  authorEmail: string;
  timestamp: string;
  refs: string[];
  parents: string[];
  changes: FileChange[];
}

export interface BlameLine {
  lineNumber: number;
  originalLineNumber: number;
  hash: string;
  authorName: string;
  authorEmail: string;
  authorTime: string;
  summary: string;
  content: string;
}

export interface GitGrepMatch {
  path: string;
  lineNumber: number;
  content: string;
}

export interface PickaxeSearchResult {
  hash: string;
  shortHash: string;
  message: string;
  authorName: string;
  authorEmail: string;
  timestamp: string;
  refs: string[];
  parents: string[];
  changes: FileChange[];
}

export interface LostCommit {
  hash: string;
  shortHash: string;
  message: string;
  authorName: string;
  authorEmail: string;
  timestamp: string;
  source: string;
}


export interface GitCommandSafety {
  requiresExplicitAction: boolean;
  changesWorktree: boolean;
  rewritesHistory: boolean;
  longRunning: boolean;
  description: string;
}

export interface BisectTerms {
  bad: string;
  good: string;
}

export interface BisectRevision {
  role: string;
  name: string;
  commit: string;
  summary: string;
}

export interface BisectLogEntry {
  command: string;
  revision: string | null;
  raw: string;
}

export interface BisectState {
  inProgress: boolean;
  terms: BisectTerms;
  startRevision: string | null;
  currentCommit: BisectRevision | null;
  paths: string[];
  knownGood: BisectRevision[];
  knownBad: BisectRevision[];
  skipped: BisectRevision[];
  log: BisectLogEntry[];
  safety: GitCommandSafety;
}

export interface BisectActionSummary {
  command: string[];
  output: string;
  state: BisectState;
  safety: GitCommandSafety;
}

export type GitFsckSeverity = "info" | "warning" | "error";

export interface GitFsckIssue {
  severity: GitFsckSeverity;
  objectType: string | null;
  objectId: string | null;
  message: string;
}

export interface GitFsckSummary {
  ok: boolean;
  exitCode: number;
  command: string[];
  issueCount: number;
  issues: GitFsckIssue[];
  rawOutput: string;
  safety: GitCommandSafety;
}

export interface GitMaintenanceSummary {
  mode: string;
  exitCode: number;
  command: string[];
  output: string;
  safety: GitCommandSafety;
}

export type GitMaintenanceMode = "maintenance" | "gc";

export type GitSignatureStatus = "valid" | "invalid" | "unsigned" | "unknown" | "unsupported";

export interface GitSignatureSummary {
  target: string;
  objectType: string;
  status: GitSignatureStatus;
  signer: string | null;
  keyId: string | null;
  fingerprint: string | null;
  trust: string | null;
  exitCode: number;
  command: string[];
  output: string;
  rawStatus: string[];
  safety: GitCommandSafety;
}

export type GitJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "cancelled";

export type GitJobLogChannel = "stdout" | "stderr";

export interface GitJobStreamLine {
  channel: GitJobLogChannel;
  line: string;
  timestamp?: string | null;
}

export interface GitJobEvent {
  jobId: string;
  repoPath: string;
  kind: string;
  title: string;
  status: GitJobStatus;
  createdAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  command?: string | null;
  args?: string[] | null;
  stream?: GitJobStreamLine | null;
  exitCode?: number | null;
  error?: string | null;
  invalidationReasons?: string[] | null;
}

export interface GitJobSummary extends Omit<GitJobEvent, "stream"> {
  logLineCount?: number;
}

export interface GitJobRecord extends GitJobSummary {
  logs?: GitJobStreamLine[];
  output?: GitJobStreamLine[];
}

export type GlobalViewType = "repo-hub" | "settings";

export type RepositoryViewType =
  | "working-tree"
  | "history"
  | "branches"
  | "remotes"
  | "stashes"
  | "tags"
  | "lfs"
  | "collaboration-connect"
  | "ci-status"
  | "stacked-prs"
  | "review-studio"
  | "worktrees"
  | "submodules"
  | "rebase-conflicts"
  | "archaeology"
  | "diagnostics"
  | "custom-command";

export type ViewType = RepositoryViewType;

export type AppRoute =
  | { area: "global"; view: GlobalViewType }
  | { area: "repository"; view: RepositoryViewType; repoPath: string };

export interface RepositorySessionState {
  repoPath: string;
  activeView: RepositoryViewType;
  selected: SelectedEntityState;
}

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
