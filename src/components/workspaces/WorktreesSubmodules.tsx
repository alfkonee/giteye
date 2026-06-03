import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Code2,
  ExternalLink,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  HardDrive,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";
import { useAppStore } from "../../stores/app-store";
import {
  useBumpSubmodule,
  usePruneWorktrees,
  useSubmodules,
  useSyncSubmodules,
  useUpdateSubmodule,
  useWorktrees,
} from "../../hooks/useAdvancedGit";
import type { Submodule, Worktree } from "../../types/git";

const staticWorktrees = [
  ["Main (default)", "~/Code/web-app", "main", "Clean", "—", "2m ago", "Open"],
  ["Feature: Checkout Flow", "~/Code/web-app-wt/checkout-flow", "feature/checkout-flow", "Dirty", "3 / 0", "5m ago", "Switch"],
  ["Hotfix: Auth Timeout", "~/Code/web-app-wt/auth-timeout", "hotfix/auth-timeout", "Clean", "1 / 0", "1h ago", "Switch"],
] as const;

const staticSubmodules = [
  ["libs/ui-kit", "git@github.com:acme/ui-kit.git", "a1b2c3d", "a1b2c3d", "0", "main", "Yes", "Up to date"],
  ["libs/payments", "git@github.com:acme/payments.git", "d4e5f6a", "f6a7b8c", "2", "main", "Yes", "Updates available"],
  ["libs/analytics", "git@github.com:acme/analytics.git", "7890abc", "c34de5f", "1", "develop", "No", "Updates available"],
] as const;

const recentActivities: Array<{ icon: LucideIcon; text: string; time: string }> = [
  { icon: Activity, text: "Updated libs/analytics", time: "2m ago" },
  { icon: GitBranch, text: "Switched to feature/checkout-flow", time: "5m ago" },
  { icon: GitFork, text: "Created worktree hotfix/auth-timeout", time: "1h ago" },
];

type WorktreeRow = {
  key: string;
  name: string;
  path: string;
  branch: string;
  status: string;
  aheadBehind: string;
  updated: string;
  action: string;
  modifiedFiles: number;
  stagedFiles: number;
  isCurrent: boolean;
};

type SubmoduleRow = {
  key: string;
  path: string;
  name: string;
  url: string;
  pinnedCommit: string;
  pinnedVersion: string | null;
  currentCommit: string;
  behind: number;
  branch: string;
  recursive: string;
  status: string;
  isInitialized: boolean;
  hasChanges: boolean;
};

function shortHash(hash: string | null) {
  return hash ? hash.slice(0, 7) : "—";
}

function formatRelativeTime(value: string | null) {
  if (!value) return "—";

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) return "just now";

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d ago`;
}

function formatMutationError(error: unknown) {
  if (!error) return null;
  return error instanceof Error ? error.message : String(error);
}

function toWorktreeRow(worktree: Worktree, activeRepoPath: string): WorktreeRow {
  const branch = worktree.branch ?? (worktree.isDetached ? `detached ${shortHash(worktree.head)}` : "—");
  const status = worktree.isLocked ? "Locked" : worktree.status || (worktree.modifiedFiles || worktree.stagedFiles ? "Dirty" : "Clean");

  return {
    key: worktree.path,
    name: worktree.isCurrent ? "Main (current)" : branch,
    path: worktree.path,
    branch,
    status,
    aheadBehind: worktree.ahead || worktree.behind ? `${worktree.ahead} / ${worktree.behind}` : "—",
    updated: formatRelativeTime(worktree.updatedAt),
    action: worktree.isCurrent || worktree.path === activeRepoPath ? "Open" : "Switch",
    modifiedFiles: worktree.modifiedFiles,
    stagedFiles: worktree.stagedFiles,
    isCurrent: worktree.isCurrent,
  };
}

function toStaticWorktreeRow(row: (typeof staticWorktrees)[number], index: number): WorktreeRow {
  return {
    key: row[0],
    name: row[0],
    path: row[1],
    branch: row[2],
    status: row[3],
    aheadBehind: row[4],
    updated: row[5],
    action: row[6],
    modifiedFiles: row[3] === "Dirty" ? 5 : 0,
    stagedFiles: row[3] === "Dirty" ? 3 : 0,
    isCurrent: index === 0,
  };
}

function toSubmoduleRow(submodule: Submodule): SubmoduleRow {
  const behind = submodule.behind ?? 0;
  const status = submodule.status || (!submodule.isInitialized ? "Not initialized" : behind > 0 ? "Updates available" : "Up to date");

  return {
    key: submodule.path,
    path: submodule.path,
    name: submodule.name || submodule.path,
    url: submodule.url ?? "—",
    pinnedCommit: shortHash(submodule.pinnedCommit),
    pinnedVersion: null,
    currentCommit: shortHash(submodule.currentCommit),
    behind,
    branch: submodule.branch ?? "—",
    recursive: submodule.isRecursive ? "Yes" : "No",
    status,
    isInitialized: submodule.isInitialized,
    hasChanges: submodule.hasChanges,
  };
}

function toStaticSubmoduleRow(row: (typeof staticSubmodules)[number]): SubmoduleRow {
  return {
    key: row[0],
    path: row[0],
    name: row[0],
    url: row[1],
    pinnedCommit: row[2],
    pinnedVersion: row[2] === "a1b2c3d" ? "1.4.2" : row[2] === "d4e5f6a" ? "2.1.0" : "0.9.5",
    currentCommit: row[3],
    behind: Number(row[4]),
    branch: row[5],
    recursive: row[6],
    status: row[7],
    isInitialized: true,
    hasChanges: false,
  };
}

function HealthCard({ title, value, icon: Icon, tone = "success" }: { title: string; value: string; icon: LucideIcon; tone?: "success" | "accent" }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--color-text-muted)]"><Icon className={tone === "accent" ? "h-4 w-4 text-[var(--color-accent)]" : "h-4 w-4 text-[var(--color-success)]"} />{title}</div>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const clean = status === "Clean" || status === "Up to date";
  return <span className={`inline-block h-2 w-2 rounded-full ${clean ? "bg-[var(--color-success)]" : "bg-[var(--color-warning)]"}`} />;
}

function QueryNote({ loading, error }: { loading: boolean; error: unknown }) {
  const message = error ? formatMutationError(error) : loading ? "Loading live repository data…" : null;
  if (!message) return null;

  return <span className="text-xs text-[var(--color-text-muted)]">{message}</span>;
}

export function WorktreesSubmodules() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const worktreesQuery = useWorktrees(activeRepoPath);
  const submodulesQuery = useSubmodules(activeRepoPath);
  const updateSubmodule = useUpdateSubmodule(activeRepoPath);
  const syncSubmodules = useSyncSubmodules(activeRepoPath);
  const bumpSubmodule = useBumpSubmodule(activeRepoPath);
  const pruneWorktrees = usePruneWorktrees(activeRepoPath);

  const hasLiveWorktrees = Boolean(activeRepoPath && worktreesQuery.data?.length);
  const hasLiveSubmodules = Boolean(activeRepoPath && submodulesQuery.data?.length);
  const worktreeRows = hasLiveWorktrees
    ? worktreesQuery.data!.map((worktree) => toWorktreeRow(worktree, activeRepoPath!))
    : staticWorktrees.map(toStaticWorktreeRow);
  const submoduleRows = hasLiveSubmodules ? submodulesQuery.data!.map(toSubmoduleRow) : staticSubmodules.map(toStaticSubmoduleRow);
  const selectedWorktree = worktreeRows.find((worktree) => !worktree.isCurrent) ?? worktreeRows[0];
  const selectedSubmodule = submoduleRows.find((submodule) => submodule.behind > 0 || submodule.hasChanges) ?? submoduleRows[0];
  const outdatedSubmodules = hasLiveSubmodules ? submoduleRows.filter((submodule) => submodule.behind > 0).length : 0;
  const dirtyWorktrees = hasLiveWorktrees ? worktreeRows.filter((worktree) => worktree.status !== "Clean").length : 0;
  const workspaceHealth = dirtyWorktrees || outdatedSubmodules ? "Needs attention" : "Good";
  const submoduleHealth = outdatedSubmodules ? `${outdatedSubmodules} behind` : "Up to date";
  const worktreeHealth = hasLiveWorktrees ? `${worktreeRows.length} active` : "3 active";
  const summaryText = hasLiveSubmodules && outdatedSubmodules ? `${outdatedSubmodules} need updates` : "main up to date";
  const isSubmoduleMutating = updateSubmodule.isPending || syncSubmodules.isPending || bumpSubmodule.isPending;
  const mutationError = updateSubmodule.error ?? syncSubmodules.error ?? bumpSubmodule.error ?? pruneWorktrees.error;
  return (
    <section className="grid h-full min-h-0 grid-cols-[minmax(760px,1fr)_300px] gap-3 bg-[var(--color-bg-primary)] p-3 text-[var(--color-text-primary)]">
      <main className="flex min-h-0 flex-col gap-3 overflow-hidden">
        <header className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-4 shadow-[var(--shadow-panel)]">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Submodules &amp; Worktrees</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">Manage linked repositories and multiple working directories.</p>
          </div>
          <div className="grid grid-cols-3 gap-3"><HealthCard title="Workspace health" value={workspaceHealth} icon={CheckCircle2} /><HealthCard title="Submodules" value={submoduleHealth} icon={ShieldCheck} /><HealthCard title="Worktrees" value={worktreeHealth} icon={FolderGit2} tone="accent" /></div>
        </header>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border-muted)] px-4 py-3">
            <div className="flex items-baseline gap-3"><h2 className="text-lg font-semibold">Worktrees</h2><span className="text-sm text-[var(--color-text-muted)]">{worktreeRows.length} worktrees</span><QueryNote loading={Boolean(activeRepoPath && worktreesQuery.isLoading)} error={worktreesQuery.error} /></div>
            <div className="flex items-center gap-3"><label className="flex w-48 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs text-[var(--color-text-muted)]"><Search className="h-4 w-4" /> Filter</label><button className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white">Create Worktree</button><button className="rounded-md border border-[var(--color-border)] p-2 disabled:cursor-not-allowed disabled:opacity-50" disabled={pruneWorktrees.isPending} onClick={() => { if (activeRepoPath) pruneWorktrees.mutate(); }} title="Prune stale worktrees"><ChevronDown className={pruneWorktrees.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} /></button></div>
          </div>
          <div className="grid grid-cols-[1.2fr_1.6fr_1.2fr_0.8fr_0.8fr_0.8fr_0.9fr] border-b border-[var(--color-border-muted)] px-4 py-2 text-xs uppercase tracking-wide text-[var(--color-text-muted)]"><span>Name</span><span>Path</span><span>Branch</span><span>Status</span><span>Ahead / Behind</span><span>Updated</span><span className="text-right">Actions</span></div>
          {worktreeRows.map((row) => (
            <div key={row.key} className="grid grid-cols-[1.2fr_1.6fr_1.2fr_0.8fr_0.8fr_0.8fr_0.9fr] items-center border-b border-[var(--color-border-muted)] px-4 py-3 text-sm last:border-b-0">
              <span className="inline-flex items-center gap-2 font-medium"><FolderGit2 className="h-4 w-4 text-[var(--color-text-muted)]" />{row.name}</span><span className="truncate text-[var(--color-text-secondary)]">{row.path}</span><span>{row.branch}</span><span className={row.status === "Dirty" || row.status === "Locked" ? "text-[var(--color-warning)]" : "text-[var(--color-success)]"}><StatusDot status={row.status} /> <span className="ml-1">{row.status}</span></span><span>{row.aheadBehind}</span><span className="text-[var(--color-text-secondary)]">{row.updated}</span><span className="flex justify-end gap-1"><button className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-accent)]">{row.isCurrent ? <ExternalLink className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}{row.action}</button></span>
            </div>
          ))}
          <p className="px-5 py-5 text-xs text-[var(--color-text-muted)]">Tip: Worktrees share the same objects and save disk space while keeping branches isolated.</p>
        </section>

        <section className="min-h-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border-muted)] px-4 py-3">
            <div className="flex items-baseline gap-3"><h2 className="text-lg font-semibold">Submodules</h2><span className="text-sm text-[var(--color-text-muted)]">{submoduleRows.length} submodules</span><QueryNote loading={Boolean(activeRepoPath && submodulesQuery.isLoading)} error={submodulesQuery.error ?? mutationError} /></div>
            <div className="flex items-center gap-3"><label className="flex w-48 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs text-[var(--color-text-muted)]"><Search className="h-4 w-4" /> Filter</label><button className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50" disabled={hasLiveSubmodules && isSubmoduleMutating} onClick={() => { if (hasLiveSubmodules) submoduleRows.forEach((row) => updateSubmodule.mutate({ path: row.path, recursive: row.recursive === "Yes" })); }}>Update All</button><button className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50" disabled={hasLiveSubmodules && syncSubmodules.isPending} onClick={() => { if (hasLiveSubmodules) syncSubmodules.mutate({ recursive: true }); }}>Sync All</button><button className="rounded-md border border-[var(--color-border)] p-2"><MoreHorizontal className="h-4 w-4" /></button></div>
          </div>
          <div className="grid grid-cols-[1fr_1.35fr_0.9fr_0.9fr_0.55fr_0.85fr_0.6fr_0.95fr_0.8fr] border-b border-[var(--color-border-muted)] px-4 py-2 text-xs uppercase tracking-wide text-[var(--color-text-muted)]"><span>Submodule</span><span>Remote</span><span>Pinned</span><span>Current</span><span>Behind</span><span>Branch</span><span>Recursive</span><span>Status</span><span className="text-right">Actions</span></div>
          {submoduleRows.map((row) => (
            <div key={row.key} className="grid grid-cols-[1fr_1.35fr_0.9fr_0.9fr_0.55fr_0.85fr_0.6fr_0.95fr_0.8fr] items-center border-b border-[var(--color-border-muted)] px-4 py-3 text-sm last:border-b-0">
              <span className="inline-flex items-center gap-2 font-medium"><HardDrive className="h-4 w-4 text-[var(--color-text-muted)]" />{row.name}</span><span className="truncate text-[var(--color-text-secondary)]">{row.url}</span><span className="font-mono text-xs">{row.pinnedCommit}<br />{row.pinnedVersion ? <span className="text-[var(--color-text-muted)]">v{row.pinnedVersion}</span> : null}</span><span className="font-mono text-xs">{row.currentCommit}</span><span className={row.behind === 0 ? "" : "text-[var(--color-danger)]"}>{row.behind}</span><span>{row.branch}<br /><span className={row.behind === 0 ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}>{row.behind === 0 ? "Up to date" : `Behind by ${row.behind}`}</span></span><span>{row.recursive}</span><span className={row.status === "Up to date" ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}><StatusDot status={row.status} /> <span className="ml-1">{row.status}</span></span><span className="flex justify-end gap-1"><button className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50" disabled={hasLiveSubmodules && updateSubmodule.isPending} onClick={() => { if (hasLiveSubmodules) updateSubmodule.mutate({ path: row.path, recursive: row.recursive === "Yes" }); }}>Update</button><button className="rounded border border-[var(--color-border)] px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50" disabled={hasLiveSubmodules && bumpSubmodule.isPending} onClick={() => { if (hasLiveSubmodules) bumpSubmodule.mutate({ path: row.path }); }}>Bump</button></span>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-0 border-t border-[var(--color-border)] p-3">
            <div className="rounded-l-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-4"><h3 className="font-semibold">What are submodules?</h3><p className="mt-3 text-sm text-[var(--color-text-secondary)]">Submodules are linked repositories pinned to a specific commit.</p><button className="mt-5 inline-flex items-center gap-2 text-sm text-[var(--color-accent)]">Learn more <ArrowRight className="h-4 w-4" /></button></div>
            <div className="rounded-r-lg border border-l-0 border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-4"><h3 className="font-semibold">Best practices</h3><ul className="mt-3 space-y-2 text-sm text-[var(--color-text-secondary)]"><li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" /> Commit submodule updates with intent</li><li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" /> Keep submodules on tracked branches</li><li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" /> Use recursive updates for consistency</li></ul></div>
          </div>
        </section>
      </main>

      <aside className="min-h-0 space-y-3 overflow-y-auto">
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]"><h3 className="text-sm font-semibold text-[var(--color-text-secondary)]">Selected Worktree</h3><div className="mt-4 flex items-center gap-2 text-lg font-semibold"><FolderGit2 className="h-5 w-5" /> {selectedWorktree.name}</div><div className="mt-3 space-y-2 text-sm text-[var(--color-text-secondary)]"><p>{selectedWorktree.path}</p><p><GitBranch className="mr-2 inline h-4 w-4" />{selectedWorktree.branch}</p><p className="flex justify-between">Status <span className={selectedWorktree.status === "Clean" ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}>{selectedWorktree.status}</span></p><p className="flex justify-between">Modified files <span>{selectedWorktree.modifiedFiles}</span></p><p className="flex justify-between">Staged files <span>{selectedWorktree.stagedFiles}</span></p></div><button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] py-2 text-sm font-semibold text-white"><TerminalSquare className="h-4 w-4" /> Open in Terminal</button></section>
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]"><h3 className="text-sm font-semibold text-[var(--color-text-secondary)]">Selected Submodule</h3><div className="mt-4 flex items-center gap-2 text-lg font-semibold"><HardDrive className="h-5 w-5" /> {selectedSubmodule.name}</div><p className="mt-2 text-sm text-[var(--color-text-secondary)]">{selectedSubmodule.url}</p><div className="mt-4 space-y-2 text-sm"><p className="flex justify-between">Pinned <span className="font-mono">{selectedSubmodule.pinnedCommit}{selectedSubmodule.pinnedVersion ? ` (v${selectedSubmodule.pinnedVersion})` : ""}</span></p><p className="flex justify-between">Current <span className="font-mono">{selectedSubmodule.currentCommit}</span></p><p className="flex justify-between">Behind <span className={selectedSubmodule.behind === 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}>{selectedSubmodule.behind}</span></p><p className="flex justify-between">Initialized <span>{selectedSubmodule.isInitialized ? "Yes" : "No"}</span></p></div><button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md border border-[var(--color-border)] py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50" disabled={hasLiveSubmodules && updateSubmodule.isPending} onClick={() => { if (hasLiveSubmodules) updateSubmodule.mutate({ path: selectedSubmodule.path, recursive: selectedSubmodule.recursive === "Yes" }); }}><GitCommitHorizontal className="h-4 w-4" /> Update to latest</button></section>
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]"><h3 className="font-semibold">Recent Activity</h3><div className="mt-4 space-y-4 text-sm text-[var(--color-text-secondary)]">{recentActivities.map(({ icon: Icon, text, time }) => <div key={text} className="flex items-center gap-3"><Icon className="h-4 w-4" /><span className="flex-1">{text}</span><span className="text-xs text-[var(--color-text-muted)]">{time}</span></div>)}</div><button className="mt-6 inline-flex w-full items-center justify-center gap-2 text-sm text-[var(--color-accent)]">View Full History <ArrowRight className="h-4 w-4" /></button></section>
        {selectedSubmodule.behind > 0 ? <section className="rounded-xl border border-[color:rgba(210,153,34,0.35)] bg-[color:rgba(210,153,34,0.08)] p-4 text-sm text-[var(--color-warning)]"><AlertCircle className="mr-2 inline h-4 w-4" /> {selectedSubmodule.name} is {selectedSubmodule.behind} commits behind its tracked branch.</section> : null}
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-sm text-[var(--color-text-secondary)]"><Clock3 className="mr-2 inline h-4 w-4" /><Code2 className="mr-2 inline h-4 w-4" />{worktreeRows.length} worktrees · {submoduleRows.length} submodules · {summaryText}</section>
      </aside>
    </section>
  );
}
