import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Code2,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
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
  useCreateWorktree,
  usePruneWorktrees,
  useRemoveWorktree,
  useSubmodules,
  useSyncSubmodules,
  useUpdateSubmodule,
  useWorktrees,
} from "../../hooks/useAdvancedGit";
import { useOpenRepository } from "../../hooks/useRepository";
import { gitApi } from "../../lib/tauri-api";
import type { Submodule, Worktree } from "../../types/git";

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

function EmptyState({ message }: { message: string }) {
  return <div className="px-5 py-6 text-center text-sm text-[var(--color-text-muted)]">{message}</div>;
}

export function WorktreesSubmodules() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const worktreesQuery = useWorktrees(activeRepoPath);
  const submodulesQuery = useSubmodules(activeRepoPath);
  const updateSubmodule = useUpdateSubmodule(activeRepoPath);
  const syncSubmodules = useSyncSubmodules(activeRepoPath);
  const bumpSubmodule = useBumpSubmodule(activeRepoPath);
  const pruneWorktrees = usePruneWorktrees(activeRepoPath);
  const createWorktree = useCreateWorktree(activeRepoPath);
  const removeWorktree = useRemoveWorktree(activeRepoPath);
  const openRepository = useOpenRepository();
  const [actionError, setActionError] = useState<string | null>(null);

  const worktreeRows = activeRepoPath ? (worktreesQuery.data ?? []).map((worktree) => toWorktreeRow(worktree, activeRepoPath)) : [];
  const submoduleRows = (submodulesQuery.data ?? []).map(toSubmoduleRow);
  const selectedWorktree = worktreeRows.find((worktree) => !worktree.isCurrent) ?? worktreeRows[0] ?? null;
  const selectedSubmodule = submoduleRows.find((submodule) => submodule.behind > 0 || submodule.hasChanges) ?? submoduleRows[0] ?? null;
  const outdatedSubmodules = submoduleRows.filter((submodule) => submodule.behind > 0).length;
  const dirtyWorktrees = worktreeRows.filter((worktree) => worktree.status !== "Clean").length;
  const workspaceHealth = activeRepoPath ? (dirtyWorktrees || outdatedSubmodules ? "Needs attention" : "Good") : "No repository";
  const submoduleHealth = submoduleRows.length === 0 ? "None" : outdatedSubmodules ? `${outdatedSubmodules} behind` : "Up to date";
  const worktreeHealth = worktreeRows.length === 0 ? "None" : `${worktreeRows.length} active`;
  const summaryText = submoduleRows.length === 0 ? "no submodules" : outdatedSubmodules ? `${outdatedSubmodules} need updates` : "submodules up to date";
  const isSubmoduleMutating = updateSubmodule.isPending || syncSubmodules.isPending || bumpSubmodule.isPending;
  const mutationError = updateSubmodule.error ?? syncSubmodules.error ?? bumpSubmodule.error ?? pruneWorktrees.error;
  const canMutateSubmodules = submoduleRows.length > 0 && !isSubmoduleMutating;

  const isWorktreeMutating = createWorktree.isPending || removeWorktree.isPending || pruneWorktrees.isPending;
  const worktreeError = actionError ?? formatMutationError(createWorktree.error ?? removeWorktree.error ?? openRepository.error);

  const handleCreateWorktree = () => {
    if (!activeRepoPath) return;
    const worktreePath = window.prompt("Path for the new worktree");
    if (!worktreePath?.trim()) return;

    const branchInput = window.prompt("Branch or commit for the worktree (leave blank for default)");
    const branch = branchInput?.trim() || null;
    const createBranch = branch ? window.confirm(`Create branch '${branch}' if it does not exist?`) : false;
    setActionError(null);
    createWorktree.mutate({ path: worktreePath.trim(), branch, createBranch });
  };

  const handleOpenWorktree = (worktreePath: string) => {
    setActionError(null);
    openRepository.mutate(worktreePath);
  };

  const handleRemoveWorktree = (worktreePath: string) => {
    if (!window.confirm(`Remove worktree at ${worktreePath}?`)) return;
    setActionError(null);
    removeWorktree.mutate({ path: worktreePath, force: false });
  };

  const handleOpenSubmodule = async (submodulePath: string) => {
    if (!activeRepoPath) return;
    setActionError(null);
    try {
      const repoPath = await gitApi.openSubmodule(activeRepoPath, submodulePath);
      openRepository.mutate(repoPath);
    } catch (error) {
      setActionError(formatMutationError(error));
    }
  };
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
            <div className="flex items-center gap-3"><label className="flex w-48 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs text-[var(--color-text-muted)]"><Search className="h-4 w-4" /> Filter</label><button className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!activeRepoPath || isWorktreeMutating} onClick={handleCreateWorktree}>{createWorktree.isPending ? "Creating…" : "Create Worktree"}</button><button className="rounded-md border border-[var(--color-border)] p-2 disabled:cursor-not-allowed disabled:opacity-50" disabled={!activeRepoPath || pruneWorktrees.isPending} onClick={() => { if (activeRepoPath) pruneWorktrees.mutate(); }} title="Prune stale worktrees"><ChevronDown className={pruneWorktrees.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} /></button></div>
          </div>
          <div className="grid grid-cols-[1.2fr_1.6fr_1.2fr_0.8fr_0.8fr_0.8fr_0.9fr] border-b border-[var(--color-border-muted)] px-4 py-2 text-xs uppercase tracking-wide text-[var(--color-text-muted)]"><span>Name</span><span>Path</span><span>Branch</span><span>Status</span><span>Ahead / Behind</span><span>Updated</span><span className="text-right">Actions</span></div>
          {worktreeRows.length > 0 ? (
            worktreeRows.map((row) => (
              <div key={row.key} className="grid grid-cols-[1.2fr_1.6fr_1.2fr_0.8fr_0.8fr_0.8fr_0.9fr] items-center border-b border-[var(--color-border-muted)] px-4 py-3 text-sm last:border-b-0">
                <span className="inline-flex items-center gap-2 font-medium"><FolderGit2 className="h-4 w-4 text-[var(--color-text-muted)]" />{row.name}</span>
                <span className="truncate text-[var(--color-text-secondary)]">{row.path}</span>
                <span>{row.branch}</span>
                <span className={row.status === "Dirty" || row.status === "Locked" ? "text-[var(--color-warning)]" : "text-[var(--color-success)]"}><StatusDot status={row.status} /> <span className="ml-1">{row.status}</span></span>
                <span>{row.aheadBehind}</span>
                <span className="text-[var(--color-text-secondary)]">{row.updated}</span>
                <span className="flex justify-end gap-1"><button className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50" disabled={openRepository.isPending} onClick={() => handleOpenWorktree(row.path)}><TerminalSquare className="h-3 w-3" />{row.action}</button><button className="rounded border border-[var(--color-border)] p-1 text-[var(--color-text-muted)] disabled:cursor-not-allowed disabled:opacity-50" disabled={row.isCurrent || removeWorktree.isPending} onClick={() => handleRemoveWorktree(row.path)} title={row.isCurrent ? "Current worktree cannot be removed here" : "Remove worktree"}><MoreHorizontal className="h-3 w-3" /></button></span>
              </div>
            ))
          ) : (
            <EmptyState message={activeRepoPath ? "No worktrees returned by the repository." : "Open a repository to load worktrees."} />
          )}
          <p className="px-5 py-5 text-xs text-[var(--color-text-muted)]">{worktreeError ?? "Tip: Worktrees share the same objects and save disk space while keeping branches isolated."}</p>
        </section>

        <section className="min-h-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border-muted)] px-4 py-3">
            <div className="flex items-baseline gap-3"><h2 className="text-lg font-semibold">Submodules</h2><span className="text-sm text-[var(--color-text-muted)]">{submoduleRows.length} submodules</span><QueryNote loading={Boolean(activeRepoPath && submodulesQuery.isLoading)} error={submodulesQuery.error ?? mutationError} /></div>
            <div className="flex items-center gap-3"><label className="flex w-48 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs text-[var(--color-text-muted)]"><Search className="h-4 w-4" /> Filter</label><button className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50" disabled={!canMutateSubmodules} onClick={() => { submoduleRows.forEach((row) => updateSubmodule.mutate({ path: row.path, recursive: row.recursive === "Yes" })); }}>Update All</button><button className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50" disabled={!canMutateSubmodules} onClick={() => syncSubmodules.mutate({ recursive: true })}>Sync</button><button className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!selectedSubmodule || isSubmoduleMutating} onClick={() => { if (selectedSubmodule) bumpSubmodule.mutate({ path: selectedSubmodule.path }); }}><RefreshCw className={bumpSubmodule.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Bump Selected</button></div>
          </div>
          <div className="grid grid-cols-[1fr_1.35fr_0.9fr_0.9fr_0.55fr_0.85fr_0.6fr_0.95fr_0.8fr] border-b border-[var(--color-border-muted)] px-4 py-2 text-xs uppercase tracking-wide text-[var(--color-text-muted)]"><span>Submodule</span><span>Remote</span><span>Pinned</span><span>Current</span><span>Behind</span><span>Branch</span><span>Recursive</span><span>Status</span><span className="text-right">Actions</span></div>
          {submoduleRows.length > 0 ? (
            submoduleRows.map((row) => (
              <div key={row.key} className="grid grid-cols-[1fr_1.35fr_0.9fr_0.9fr_0.55fr_0.85fr_0.6fr_0.95fr_0.8fr] items-center border-b border-[var(--color-border-muted)] px-4 py-3 text-sm last:border-b-0">
                <span className="inline-flex items-center gap-2 font-medium"><HardDrive className="h-4 w-4 text-[var(--color-text-muted)]" />{row.name}</span>
                <span className="truncate text-[var(--color-text-secondary)]">{row.url}</span>
                <span className="font-mono text-xs">{row.pinnedCommit}{row.pinnedVersion ? ` v${row.pinnedVersion}` : ""}</span>
                <span className="font-mono text-xs">{row.currentCommit}</span>
                <span className={row.behind === 0 ? "" : "text-[var(--color-danger)]"}>{row.behind}</span>
                <span>{row.branch}<br /><span className={row.behind === 0 ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}>{row.behind === 0 ? "Up to date" : `Behind by ${row.behind}`}</span></span>
                <span>{row.recursive}</span>
                <span className={row.status === "Up to date" ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}><StatusDot status={row.status} /> <span className="ml-1">{row.status}</span></span>
                <span className="flex justify-end gap-1"><button className="rounded border border-[var(--color-border)] px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50" disabled={isSubmoduleMutating} onClick={() => updateSubmodule.mutate({ path: row.path, recursive: row.recursive === "Yes" })}>Update</button><button className="rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50" disabled={openRepository.isPending} onClick={() => void handleOpenSubmodule(row.path)}>Open</button></span>
              </div>
            ))
          ) : (
            <EmptyState message={activeRepoPath ? "No submodules returned by the repository." : "Open a repository to load submodules."} />
          )}
          <div className="grid grid-cols-2 gap-0 border-t border-[var(--color-border)] p-3">
            <div className="rounded-l-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-4"><h3 className="font-semibold">What are submodules?</h3><p className="mt-3 text-sm text-[var(--color-text-secondary)]">Submodules are linked repositories pinned to a specific commit.</p><button className="mt-5 inline-flex items-center gap-2 text-sm text-[var(--color-accent)]">Learn more <ArrowRight className="h-4 w-4" /></button></div>
            <div className="rounded-r-lg border border-l-0 border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-4"><h3 className="font-semibold">Best practices</h3><ul className="mt-3 space-y-2 text-sm text-[var(--color-text-secondary)]"><li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" /> Commit submodule updates with intent</li><li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" /> Keep submodules on tracked branches</li><li className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" /> Use recursive updates for consistency</li></ul></div>
          </div>
        </section>
      </main>

      <aside className="min-h-0 space-y-3 overflow-y-auto">
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]"><h3 className="text-sm font-semibold text-[var(--color-text-secondary)]">Selected Worktree</h3>{selectedWorktree ? <><div className="mt-4 flex items-center gap-2 text-lg font-semibold"><FolderGit2 className="h-5 w-5" /> {selectedWorktree.name}</div><div className="mt-3 space-y-2 text-sm text-[var(--color-text-secondary)]"><p>{selectedWorktree.path}</p><p><GitBranch className="mr-2 inline h-4 w-4" />{selectedWorktree.branch}</p><p className="flex justify-between">Status <span className={selectedWorktree.status === "Clean" ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}>{selectedWorktree.status}</span></p><p className="flex justify-between">Changes <span>{selectedWorktree.modifiedFiles} modified · {selectedWorktree.stagedFiles} staged</span></p><p className="flex justify-between">Ahead / Behind <span>{selectedWorktree.aheadBehind}</span></p></div><button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md border border-[var(--color-border)] py-2 text-sm text-[var(--color-accent)]"><TerminalSquare className="h-4 w-4" /> Open Terminal</button></> : <p className="mt-4 text-sm text-[var(--color-text-muted)]">No worktree selected.</p>}</section>
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]"><h3 className="text-sm font-semibold text-[var(--color-text-secondary)]">Selected Submodule</h3>{selectedSubmodule ? <><div className="mt-4 flex items-center gap-2 text-lg font-semibold"><HardDrive className="h-5 w-5" /> {selectedSubmodule.name}</div><p className="mt-2 text-sm text-[var(--color-text-secondary)]">{selectedSubmodule.url}</p><div className="mt-4 space-y-2 text-sm"><p className="flex justify-between">Pinned <span className="font-mono">{selectedSubmodule.pinnedCommit}{selectedSubmodule.pinnedVersion ? ` (v${selectedSubmodule.pinnedVersion})` : ""}</span></p><p className="flex justify-between">Current <span className="font-mono">{selectedSubmodule.currentCommit}</span></p><p className="flex justify-between">Branch <span>{selectedSubmodule.branch}</span></p><p className="flex justify-between">Status <span>{selectedSubmodule.status}</span></p></div><button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md border border-[var(--color-border)] py-2 text-sm text-[var(--color-accent)]"><GitCommitHorizontal className="h-4 w-4" /> View Commits</button></> : <p className="mt-4 text-sm text-[var(--color-text-muted)]">No submodule selected.</p>}</section>
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]"><h3 className="font-semibold">Recent Activity</h3><p className="mt-4 text-sm text-[var(--color-text-muted)]">Recent worktree and submodule activity is unavailable from the current backend.</p></section>
        {selectedSubmodule && selectedSubmodule.behind > 0 ? <section className="rounded-xl border border-[color:rgba(210,153,34,0.35)] bg-[color:rgba(210,153,34,0.08)] p-4 text-sm text-[var(--color-warning)]"><AlertCircle className="mr-2 inline h-4 w-4" /> {selectedSubmodule.name} is {selectedSubmodule.behind} commits behind its tracked branch.</section> : null}
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 text-sm text-[var(--color-text-secondary)]"><Clock3 className="mr-2 inline h-4 w-4" /><Code2 className="mr-2 inline h-4 w-4" />{worktreeRows.length} worktrees · {submoduleRows.length} submodules · {summaryText}</section>
      </aside>
    </section>
  );
}
