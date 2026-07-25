import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  HardDrive,
  RefreshCw,
  Search,
  ShieldCheck,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { useAppStore } from "../../stores/app-store";
import type { Submodule, SubmoduleForeachStatus, Worktree } from "../../types/git";

type WorktreeRow = {
  key: string;
  name: string;
  path: string;
  branch: string;
  head: string;
  status: string;
  aheadBehind: string;
  updated: string;
  action: string;
  modifiedFiles: number;
  stagedFiles: number;
  isCurrent: boolean;
  isDetached: boolean;
  isLocked: boolean;
  lockReason: string | null;
  prunable: boolean;
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
  ahead: number;
  branch: string;
  recursive: string;
  status: string;
  isInitialized: boolean;
  hasChanges: boolean;
  foreachStatus: SubmoduleForeachStatus | null;
};

type AddSubmoduleForm = {
  url: string;
  path: string;
  branch: string;
  name: string;
};

type CreateWorktreeForm = {
  path: string;
  branch: string;
  createBranch: boolean;
};

type WorkspaceSection = "worktrees" | "submodules";

const STATUS_LABELS: Record<string, string> = {
  Clean: "Clean",
  Dirty: "Dirty",
  Locked: "Locked",
  UpToDate: "Up to date",
  UpdatesAvailable: "Updates available",
  Uninitialized: "Not initialized",
  Modified: "Modified",
  Conflict: "Conflict",
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

function formatStatus(status: string | null | undefined, fallback: string) {
  if (!status) return fallback;
  return STATUS_LABELS[status] ?? status.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function formatMutationError(error: unknown) {
  if (!error) return null;
  return error instanceof Error ? error.message : String(error);
}

function previewList(paths: string[]) {
  if (paths.length === 0) return "No stale worktree metadata was reported by the dry run.";
  const listed = paths.slice(0, 8).map((path) => `• ${path}`).join("\n");
  const suffix = paths.length > 8 ? `\n…and ${paths.length - 8} more` : "";
  return `${listed}${suffix}`;
}

function worktreeRemovalDetails(row: WorktreeRow, dryRunLines: string[]) {
  const stateLines = [
    `Status: ${row.status}`,
    `Modified files: ${row.modifiedFiles}`,
    `Staged files: ${row.stagedFiles}`,
    row.isLocked ? `Locked: ${row.lockReason || "yes"}` : "Locked: no",
    row.prunable ? "Prunable: yes" : "Prunable: no",
  ];
  const dryRun = dryRunLines.length > 0 ? dryRunLines.join("\n") : "Dry run did not report additional details.";
  return `${stateLines.join("\n")}\n\nDry run:\n${dryRun}`;
}

function toWorktreeRow(worktree: Worktree, activeRepoPath: string): WorktreeRow {
  const branch = worktree.branch ?? (worktree.isDetached ? `detached ${shortHash(worktree.head)}` : "—");
  const dirty = worktree.modifiedFiles > 0 || worktree.stagedFiles > 0;
  const status = worktree.isLocked
    ? "Locked"
    : formatStatus(worktree.status, dirty ? "Dirty" : worktree.isDetached ? "Detached" : "Clean");

  return {
    key: worktree.path,
    name: worktree.isCurrent ? "Main (current)" : branch,
    path: worktree.path,
    branch,
    head: shortHash(worktree.head),
    status,
    aheadBehind: worktree.ahead || worktree.behind ? `${worktree.ahead} / ${worktree.behind}` : "—",
    updated: formatRelativeTime(worktree.updatedAt),
    action: worktree.isCurrent || worktree.path === activeRepoPath ? "Open" : "Switch",
    modifiedFiles: worktree.modifiedFiles,
    stagedFiles: worktree.stagedFiles,
    isCurrent: worktree.isCurrent,
    isDetached: worktree.isDetached,
    isLocked: worktree.isLocked,
    lockReason: worktree.lockReason,
    prunable: worktree.prunable,
  };
}

function toSubmoduleRow(
  submodule: Submodule,
  foreachStatus: SubmoduleForeachStatus | null,
): SubmoduleRow {
  const behind = foreachStatus?.behind ?? submodule.behind ?? 0;
  const ahead = foreachStatus?.ahead ?? submodule.ahead ?? 0;
  const initialized = foreachStatus?.initialized ?? submodule.isInitialized;
  const status = formatStatus(
    foreachStatus?.status ?? submodule.status,
    !initialized ? "Not initialized" : behind > 0 ? "Updates available" : "Up to date",
  );

  return {
    key: submodule.path,
    path: submodule.path,
    name: submodule.name || submodule.path,
    url: submodule.url ?? "—",
    pinnedCommit: shortHash(submodule.pinnedCommit),
    pinnedVersion: null,
    currentCommit: shortHash(foreachStatus?.head ?? submodule.currentCommit),
    behind,
    ahead,
    branch: foreachStatus?.branch ?? submodule.branch ?? "—",
    recursive: submodule.isRecursive ? "Yes" : "No",
    status,
    isInitialized: initialized,
    hasChanges: submodule.hasChanges || Boolean(foreachStatus && (foreachStatus.modifiedFiles > 0 || foreachStatus.stagedFiles > 0)),
    foreachStatus,
  };
}

function rowMatchesFilter(values: Array<string | number | null | undefined>, filter: string) {
  const query = filter.trim().toLowerCase();
  if (!query) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(query));
}

function HealthCard({
  title,
  value,
  icon: Icon,
  tone = "success",
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  tone?: "success" | "accent";
}) {
  return (
    <div className="inline-flex min-w-0 items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2">
      <div className="flex min-w-0 items-center gap-2 text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
        <Icon className={tone === "accent" ? "h-4 w-4 text-[var(--color-accent)]" : "h-4 w-4 text-[var(--color-success)]"} />
        {title}
      </div>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const clean = normalized === "clean" || normalized === "up to date";
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

function ActionButton({
  children,
  disabled,
  tone = "default",
  title,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  tone?: "default" | "accent" | "danger";
  title?: string;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
}) {
  const toneClass =
    tone === "accent"
      ? "text-[var(--color-accent)]"
      : tone === "danger"
        ? "border-[color:rgba(248,81,73,0.45)] text-[var(--color-danger)]"
        : "text-[var(--color-text-muted)]";

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1 rounded border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const WORKTREE_GRID =
  "grid-cols-[minmax(10rem,1.1fr)_minmax(15rem,1.5fr)_minmax(10rem,1.1fr)_minmax(7.5rem,0.8fr)_minmax(5rem,0.65fr)_minmax(6rem,0.7fr)_minmax(8rem,0.55fr)]";
const SUBMODULE_GRID =
  "grid-cols-[minmax(10rem,1fr)_minmax(14rem,1.25fr)_minmax(6rem,0.65fr)_minmax(6rem,0.65fr)_minmax(4rem,0.45fr)_minmax(9rem,0.85fr)_minmax(5.5rem,0.55fr)_minmax(8rem,0.8fr)_minmax(8rem,0.6fr)]";

const EMPTY_ADD_SUBMODULE_FORM: AddSubmoduleForm = {
  url: "",
  path: "",
  branch: "",
  name: "",
};

const EMPTY_CREATE_WORKTREE_FORM: CreateWorktreeForm = {
  path: "",
  branch: "",
  createBranch: false,
};

export function WorktreesSubmodules() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const queryClient = useQueryClient();
  const setActiveRepoPath = useAppStore((s) => s.setActiveRepoPath);
  const selectedWorktreePath = useAppStore((s) => s.selectedWorktreePath);
  const setSelectedWorktreePath = useAppStore((s) => s.setSelectedWorktreePath);
  const selectedSubmodulePath = useAppStore((s) => s.selectedSubmodulePath);
  const setSelectedSubmodulePath = useAppStore((s) => s.setSelectedSubmodulePath);
  const worktreesQuery = useQuery(gitQueries.worktrees(activeRepoPath));
  const submodulesQuery = useQuery(gitQueries.submodules(activeRepoPath));
  const foreachStatusQuery = useQuery(
    gitQueries.submoduleForeachStatus(
      activeRepoPath,
      true,
      Boolean(activeRepoPath && (submodulesQuery.data?.length ?? 0) > 0),
    ),
  );
  const updateSubmodule = useMutation(gitMutations.updateSubmodule(queryClient, activeRepoPath));
  const addSubmodule = useMutation(gitMutations.addSubmodule(queryClient, activeRepoPath));
  const syncSubmodules = useMutation(gitMutations.syncSubmodules(queryClient, activeRepoPath));
  const bumpSubmodule = useMutation(gitMutations.bumpSubmodule(queryClient, activeRepoPath));
  const submoduleInitUpdate = useMutation(gitMutations.submoduleInitUpdate(queryClient, activeRepoPath));
  const submoduleSetBranch = useMutation(gitMutations.submoduleSetBranch(queryClient, activeRepoPath));
  const pruneWorktrees = useMutation(gitMutations.pruneWorktrees(queryClient, activeRepoPath));
  const pruneWorktreesDryRun = useMutation(gitMutations.pruneWorktreesDryRun(activeRepoPath));
  const createWorktree = useMutation(gitMutations.createWorktree(queryClient, activeRepoPath));
  const removeWorktree = useMutation(gitMutations.removeWorktree(queryClient, activeRepoPath));
  const removeWorktreeDryRun = useMutation(gitMutations.removeWorktreeDryRun(activeRepoPath));
  const moveWorktree = useMutation(gitMutations.moveWorktree(queryClient, activeRepoPath));
  const lockWorktree = useMutation(gitMutations.lockWorktree(queryClient, activeRepoPath));
  const unlockWorktree = useMutation(gitMutations.unlockWorktree(queryClient, activeRepoPath));
  const repairWorktree = useMutation(gitMutations.repairWorktree(queryClient, activeRepoPath));
  const repairWorktreeDryRun = useMutation(gitMutations.repairWorktreeDryRun(activeRepoPath));
  const openRepository = useMutation(gitMutations.openRepository(queryClient, setActiveRepoPath));
  const openSubmodule = useMutation(gitMutations.openSubmodule(activeRepoPath));
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeWorkspaceSection, setActiveWorkspaceSection] =
    useState<WorkspaceSection>("worktrees");
  const [worktreeFilter, setWorktreeFilter] = useState("");
  const [submoduleFilter, setSubmoduleFilter] = useState("");
  const [prunePreviewPaths, setPrunePreviewPaths] = useState<string[]>([]);
  const [repairPreviewPath, setRepairPreviewPath] = useState<string | null>(null);
  const [repairPreviewLines, setRepairPreviewLines] = useState<string[]>([]);
  const [isAddSubmoduleOpen, setIsAddSubmoduleOpen] = useState(false);
  const [addSubmoduleForm, setAddSubmoduleForm] = useState<AddSubmoduleForm>(
    EMPTY_ADD_SUBMODULE_FORM,
  );
  const [isCreateWorktreeOpen, setIsCreateWorktreeOpen] = useState(false);
  const [createWorktreeForm, setCreateWorktreeForm] =
    useState<CreateWorktreeForm>(EMPTY_CREATE_WORKTREE_FORM);

  const foreachStatusByPath = new Map((foreachStatusQuery.data ?? []).map((row) => [row.path, row]));
  const allWorktreeRows = activeRepoPath ? (worktreesQuery.data ?? []).map((worktree) => toWorktreeRow(worktree, activeRepoPath)) : [];
  const allSubmoduleRows = (submodulesQuery.data ?? []).map((submodule) => toSubmoduleRow(submodule, foreachStatusByPath.get(submodule.path) ?? null));
  const worktreeRows = allWorktreeRows.filter((row) => rowMatchesFilter([row.name, row.path, row.branch, row.status, row.lockReason], worktreeFilter));
  const submoduleRows = allSubmoduleRows.filter((row) => rowMatchesFilter([row.name, row.path, row.url, row.branch, row.status], submoduleFilter));
  const selectedWorktree = worktreeRows.find((worktree) => worktree.path === selectedWorktreePath) ?? worktreeRows.find((worktree) => worktree.prunable || worktree.isDetached || worktree.isLocked) ?? worktreeRows.find((worktree) => !worktree.isCurrent) ?? worktreeRows[0] ?? null;
  const selectedSubmodule = submoduleRows.find((submodule) => submodule.path === selectedSubmodulePath) ?? submoduleRows.find((submodule) => !submodule.isInitialized || submodule.behind > 0 || submodule.hasChanges) ?? submoduleRows[0] ?? null;
  const outdatedSubmodules = allSubmoduleRows.filter((submodule) => submodule.behind > 0).length;
  const dirtyWorktrees = allWorktreeRows.filter((worktree) => worktree.status !== "Clean").length;
  const lockedWorktrees = allWorktreeRows.filter((worktree) => worktree.isLocked).length;
  const detachedWorktrees = allWorktreeRows.filter((worktree) => worktree.isDetached).length;
  const workspaceHealth = activeRepoPath ? (dirtyWorktrees || outdatedSubmodules ? "Needs attention" : "Good") : "No repository";
  const submoduleHealth = allSubmoduleRows.length === 0 ? "None" : outdatedSubmodules ? `${outdatedSubmodules} behind` : "Up to date";
  const worktreeHealth = allWorktreeRows.length === 0 ? "None" : `${allWorktreeRows.length} active`;
  const summaryText = allSubmoduleRows.length === 0 ? "no submodules" : outdatedSubmodules ? `${outdatedSubmodules} need updates` : "submodules up to date";
  const isSubmoduleMutating = addSubmodule.isPending || updateSubmodule.isPending || syncSubmodules.isPending || bumpSubmodule.isPending || submoduleInitUpdate.isPending || submoduleSetBranch.isPending;
  const mutationError = addSubmodule.error ?? updateSubmodule.error ?? syncSubmodules.error ?? bumpSubmodule.error ?? submoduleInitUpdate.error ?? submoduleSetBranch.error ?? foreachStatusQuery.error;
  const canMutateSubmodules = submoduleRows.length > 0 && !isSubmoduleMutating;
  const isWorktreeMutating = createWorktree.isPending || removeWorktreeDryRun.isPending || removeWorktree.isPending || pruneWorktrees.isPending || moveWorktree.isPending || lockWorktree.isPending || unlockWorktree.isPending || repairWorktree.isPending;
  const worktreeError = actionError ?? formatMutationError(createWorktree.error ?? removeWorktreeDryRun.error ?? removeWorktree.error ?? openRepository.error ?? pruneWorktrees.error ?? pruneWorktreesDryRun.error ?? moveWorktree.error ?? lockWorktree.error ?? unlockWorktree.error ?? repairWorktree.error ?? repairWorktreeDryRun.error);

  const openCreateWorktreeDialog = () => {
    setActionError(null);
    setCreateWorktreeForm(EMPTY_CREATE_WORKTREE_FORM);
    setIsCreateWorktreeOpen(true);
  };

  const closeCreateWorktreeDialog = () => {
    if (createWorktree.isPending) return;
    setIsCreateWorktreeOpen(false);
  };

  const handleCreateWorktree = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeRepoPath) return;
    const path = createWorktreeForm.path.trim();
    if (!path) {
      setActionError("Worktree path is required.");
      return;
    }
    const branch = createWorktreeForm.branch.trim() || null;
    setActionError(null);
    createWorktree.mutate(
      {
        path,
        branch,
        createBranch: Boolean(branch && createWorktreeForm.createBranch),
      },
      {
        onSuccess: () => {
          setCreateWorktreeForm(EMPTY_CREATE_WORKTREE_FORM);
          setIsCreateWorktreeOpen(false);
        },
      },
    );
  };

  const handleOpenWorktree = (worktreePath: string) => {
    setActionError(null);
    openRepository.mutate(worktreePath);
  };

  const handleMoveWorktree = (row: WorktreeRow) => {
    const newPath = window.prompt("Move worktree to this new path", row.path);
    if (!newPath?.trim() || newPath.trim() === row.path) return;
    if (!window.confirm(`Move worktree\n\nFrom: ${row.path}\nTo: ${newPath.trim()}?`)) return;
    setActionError(null);
    moveWorktree.mutate({ path: row.path, newPath: newPath.trim() });
  };

  const handleLockWorktree = (row: WorktreeRow) => {
    const reason = window.prompt("Lock reason (optional)", row.lockReason ?? "");
    if (reason === null) return;
    setActionError(null);
    lockWorktree.mutate({ path: row.path, reason: reason.trim() || null });
  };

  const handleUnlockWorktree = (row: WorktreeRow) => {
    if (!window.confirm(`Unlock worktree at ${row.path}?`)) return;
    setActionError(null);
    unlockWorktree.mutate(row.path);
  };

  const handleRepairWorktree = (row: WorktreeRow) => {
    const detail = repairPreviewPath === row.path && repairPreviewLines.length > 0
      ? `\n\nLast repair preview:\n${previewList(repairPreviewLines)}`
      : "";
    if (!window.confirm(`Repair Git metadata for worktree at ${row.path}?${detail}`)) return;
    setActionError(null);
    repairWorktree.mutate(row.path, {
      onSuccess: (job) => {
        setRepairPreviewPath(row.path);
        setRepairPreviewLines([`${job.title} queued. Track progress in the command log.`]);
      },
    });
  };

  const handlePreviewRepair = (row: WorktreeRow) => {
    setActionError(null);
    repairWorktreeDryRun.mutate(row.path, {
      onSuccess: (lines) => {
        setRepairPreviewPath(row.path);
        setRepairPreviewLines(lines);
        if (lines.length === 0) {
          window.alert("Repair dry run did not report any worktree link changes.");
        }
      },
      onError: (error) => setActionError(formatMutationError(error)),
    });
  };

  const handleRemoveWorktree = async (row: WorktreeRow, force: boolean) => {
    const worktreePath = row.path;
    const mode = force ? "force remove" : "remove";
    setActionError(null);
    let dryRunLines: string[];
    try {
      dryRunLines = await removeWorktreeDryRun.mutateAsync({ path: worktreePath, force });
    } catch (error) {
      setActionError(formatMutationError(error));
      return;
    }

    const details = worktreeRemovalDetails(row, dryRunLines);
    if (!window.confirm(`${mode[0].toUpperCase()}${mode.slice(1)} worktree at ${worktreePath}?\n\n${details}`)) return;
    if (force && (row.modifiedFiles > 0 || row.stagedFiles > 0 || row.isLocked)) {
      const typedPath = window.prompt(`Force removing this worktree can discard dirty or locked state. Type the full path to confirm:\n\n${worktreePath}`);
      if (typedPath !== worktreePath) {
        setActionError("Force remove canceled: typed path did not match the worktree path.");
        return;
      }
    }

    removeWorktree.mutate({ path: worktreePath, force });
  };

  const handlePreviewPrune = () => {
    setActionError(null);
    pruneWorktreesDryRun.mutate(undefined, {
      onSuccess: (paths) => {
        setPrunePreviewPaths(paths);
        if (paths.length === 0) {
          window.alert("No stale worktree metadata was found by the prune dry run.");
        }
      },
      onError: (error) => setActionError(formatMutationError(error)),
    });
  };

  const handlePruneWorktrees = () => {
    const message = prunePreviewPaths.length > 0
      ? `Prune these stale worktree records?\n\n${previewList(prunePreviewPaths)}`
      : "Run git worktree prune? Use Preview prune first to see stale records before removing them.";
    if (!window.confirm(message)) return;
    setActionError(null);
    pruneWorktrees.mutate(undefined, {
      onSuccess: () => setPrunePreviewPaths([]),
    });
  };

  const handleOpenSubmodule = (submodulePath: string) => {
    if (!activeRepoPath) return;
    setActionError(null);
    openSubmodule.mutate(submodulePath, {
      onSuccess: (repoPath) => openRepository.mutate(repoPath),
      onError: (error) => setActionError(formatMutationError(error)),
    });
  };

  const openAddSubmoduleDialog = () => {
    setActionError(null);
    setAddSubmoduleForm(EMPTY_ADD_SUBMODULE_FORM);
    setIsAddSubmoduleOpen(true);
  };

  const closeAddSubmoduleDialog = () => {
    if (addSubmodule.isPending) return;
    setIsAddSubmoduleOpen(false);
  };

  const handleAddSubmodule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeRepoPath) return;
    const url = addSubmoduleForm.url.trim();
    const path = addSubmoduleForm.path.trim();
    if (!url || !path) {
      setActionError("Submodule URL and relative path are required.");
      return;
    }
    setActionError(null);
    addSubmodule.mutate(
      {
        url,
        path,
        branch: addSubmoduleForm.branch.trim() || null,
        name: addSubmoduleForm.name.trim() || null,
      },
      {
        onSuccess: () => {
          setAddSubmoduleForm(EMPTY_ADD_SUBMODULE_FORM);
          setIsAddSubmoduleOpen(false);
        },
      },
    );
  };

  const handleSubmoduleInitUpdate = (path: string | null, remoteDefault: boolean) => {
    const target = path ?? "all submodules";
    const defaultText = remoteDefault ? " Choose OK to follow configured branch tracking." : "";
    const remote = window.confirm(`Fetch remote tracking branches while updating ${target}?${defaultText}`);
    const recursive = true;
    if (!window.confirm(`Run recursive init/update for ${target}${remote ? " with remote tracking" : ""}?`)) return;
    setActionError(null);
    submoduleInitUpdate.mutate({ path, recursive, remote });
  };

  const handleSetSubmoduleBranch = (row: SubmoduleRow) => {
    const initial = row.branch === "—" ? "" : row.branch;
    const branch = window.prompt("Branch to track for this submodule", initial);
    if (branch === null) return;
    const branchValue = branch.trim();
    if (!branchValue) {
      window.alert("Enter a branch name to track. Clearing submodule branch tracking is not supported by the current backend.");
      return;
    }
    if (!window.confirm(`Track '${branchValue}' for ${row.path}?`)) return;
    setActionError(null);
    submoduleSetBranch.mutate({ path: row.path, branch: branchValue });
  };

  const handleBumpSubmodule = (row: SubmoduleRow) => {
    if (!window.confirm(`Bump ${row.path} in the parent repository to its current submodule commit?`)) return;
    setActionError(null);
    bumpSubmodule.mutate({ path: row.path });
  };

  const handlePinnedSubmoduleUpdate = (row: SubmoduleRow) => {
    if (!window.confirm(`Update ${row.path} to the commit pinned by the parent repository?`)) return;
    setActionError(null);
    updateSubmodule.mutate({ path: row.path, recursive: row.recursive === "Yes" });
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Submodules &amp; Worktrees</h1>
          <p className="text-xs text-[var(--color-text-muted)]">Focus on one workspace surface at a time; details and risky actions stay in the context panel.</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <HealthCard title="Workspace" value={workspaceHealth} icon={CheckCircle2} />
          <HealthCard title="Submodules" value={submoduleHealth} icon={ShieldCheck} />
          <HealthCard title="Worktrees" value={worktreeHealth} icon={FolderGit2} tone="accent" />
        </div>
      </header>

      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] px-5 py-3">
        <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-1">
          <button
            type="button"
            onClick={() => setActiveWorkspaceSection("worktrees")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeWorkspaceSection === "worktrees" ? "giteye-nav-active" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"}`}
          >
            Worktrees <span className="ml-2 text-xs text-[var(--color-text-muted)]">{allWorktreeRows.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveWorkspaceSection("submodules")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeWorkspaceSection === "submodules" ? "giteye-nav-active" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"}`}
          >
            Submodules <span className="ml-2 text-xs text-[var(--color-text-muted)]">{allSubmoduleRows.length}</span>
          </button>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {worktreeRows.length} worktrees · {submoduleRows.length} submodules · {summaryText}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] gap-3 p-3">
        <main className="min-h-0 overflow-hidden">
          {activeWorkspaceSection === "worktrees" ? (
            <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-muted)] px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-base font-semibold">Worktrees</h2>
                    <span className="text-sm text-[var(--color-text-muted)]">{worktreeRows.length} / {allWorktreeRows.length}</span>
                    <QueryNote loading={Boolean(activeRepoPath && worktreesQuery.isLoading)} error={worktreesQuery.error} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">{detachedWorktrees} detached · {lockedWorktrees} locked · select a row for move, lock, repair, and remove.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex w-56 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
                    <Search className="h-4 w-4" />
                    <input value={worktreeFilter} onChange={(event) => setWorktreeFilter(event.target.value)} placeholder="Filter worktrees" className="min-w-0 flex-1 bg-transparent text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]" />
                  </label>
                  <button className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!activeRepoPath || isWorktreeMutating} onClick={openCreateWorktreeDialog}>{createWorktree.isPending ? "Creating…" : "Create Worktree"}</button>
                  <button className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50" disabled={!activeRepoPath || pruneWorktreesDryRun.isPending} onClick={handlePreviewPrune}>Preview prune</button>
                  <button className="rounded-md border border-[var(--color-border)] p-2 text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50" disabled={!activeRepoPath || pruneWorktrees.isPending} onClick={handlePruneWorktrees} title="Prune stale worktrees"><RefreshCw className={`h-4 w-4 ${pruneWorktrees.isPending ? "animate-spin" : ""}`} /></button>
                </div>
              </div>
              {prunePreviewPaths.length > 0 ? (
                <div className="border-b border-[var(--color-border-muted)] bg-[color:rgba(210,153,34,0.08)] px-4 py-3 text-xs text-[var(--color-warning)]">
                  <strong>Prune preview:</strong> {prunePreviewPaths.length} stale worktree record{prunePreviewPaths.length === 1 ? "" : "s"} detected. Confirm prune from the toolbar or review the context panel first.
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-auto">
                <div className={`sticky top-0 z-10 grid min-w-[1040px] ${WORKTREE_GRID} border-b border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-4 py-2 text-xs uppercase tracking-wide text-[var(--color-text-muted)]`}><span>Name</span><span>Path</span><span>Branch / HEAD</span><span>Status</span><span>A/B</span><span>Updated</span><span className="text-right">Primary</span></div>
                {worktreeRows.length > 0 ? (
                  worktreeRows.map((row) => (
                    <div key={row.key} className={`grid min-w-[1040px] cursor-pointer ${WORKTREE_GRID} items-center border-b border-[var(--color-border-muted)] px-4 py-3 text-sm last:border-b-0 ${selectedWorktree?.key === row.key ? "bg-[var(--color-bg-hover)]" : "hover:bg-[var(--color-bg-surface)]"}`} onClick={() => setSelectedWorktreePath(row.path)}>
                      <span className="inline-flex min-w-0 items-center gap-2 font-medium"><FolderGit2 className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" /><span className="truncate">{row.name}</span></span>
                      <span className="truncate text-[var(--color-text-secondary)]">{row.path}</span>
                      <span className="min-w-0"><span className="truncate">{row.branch}</span><br /><span className="font-mono text-xs text-[var(--color-text-muted)]">{row.head}</span></span>
                      <span className={row.status === "Dirty" || row.status === "Locked" || row.prunable ? "text-[var(--color-warning)]" : "text-[var(--color-success)]"}><StatusDot status={row.status} /> <span className="ml-1">{row.prunable ? "Prunable" : row.status}</span></span>
                      <span>{row.aheadBehind}</span>
                      <span className="text-[var(--color-text-secondary)]">{row.updated}</span>
                      <span className="flex justify-end">
                        <ActionButton tone="accent" disabled={openRepository.isPending} onClick={(event) => { event.stopPropagation(); handleOpenWorktree(row.path); }}><TerminalSquare className="h-3 w-3" />{row.action}</ActionButton>
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyState message={activeRepoPath ? "No worktrees returned by the repository." : "Open a repository to load worktrees."} />
                )}
              </div>
              <p className="border-t border-[var(--color-border-muted)] px-5 py-3 text-xs text-[var(--color-text-muted)]">{worktreeError ?? "Open/Switch stays in-row. Advanced and destructive actions require row selection."}</p>
            </section>
          ) : (
            <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-muted)] px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-base font-semibold">Submodules</h2>
                    <span className="text-sm text-[var(--color-text-muted)]">{submoduleRows.length} / {allSubmoduleRows.length}</span>
                    <QueryNote loading={Boolean(activeRepoPath && (submodulesQuery.isLoading || foreachStatusQuery.isLoading))} error={submodulesQuery.error ?? mutationError} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">{outdatedSubmodules} behind · recursive details are collapsed until needed.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex w-56 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
                    <Search className="h-4 w-4" />
                    <input value={submoduleFilter} onChange={(event) => setSubmoduleFilter(event.target.value)} placeholder="Filter submodules" className="min-w-0 flex-1 bg-transparent text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]" />
                  </label>
                  <button className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!activeRepoPath || isSubmoduleMutating} onClick={openAddSubmoduleDialog}>{addSubmodule.isPending ? "Adding…" : "Add Submodule"}</button>
                  <button className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50" disabled={!canMutateSubmodules} onClick={() => handleSubmoduleInitUpdate(null, true)}>Init/update recursive</button>
                  <button className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50" disabled={!canMutateSubmodules} onClick={() => { if (window.confirm("Sync all submodule URLs recursively?")) syncSubmodules.mutate({ recursive: true }); }}>Sync recursive</button>
                  <button className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50" disabled={!activeRepoPath || foreachStatusQuery.isFetching} onClick={() => { void foreachStatusQuery.refetch(); }}>Refresh foreach</button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <div className={`sticky top-0 z-10 grid min-w-[1040px] ${SUBMODULE_GRID} border-b border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-4 py-2 text-xs uppercase tracking-wide text-[var(--color-text-muted)]`}><span>Submodule</span><span>Remote</span><span>Pinned</span><span>Current</span><span>A/B</span><span>Branch</span><span>Recursive</span><span>Status</span><span className="text-right">Primary</span></div>
                {submoduleRows.length > 0 ? (
                  submoduleRows.map((row) => (
                    <div key={row.key} className={`grid min-w-[1040px] cursor-pointer ${SUBMODULE_GRID} items-center border-b border-[var(--color-border-muted)] px-4 py-3 text-sm last:border-b-0 ${selectedSubmodule?.key === row.key ? "bg-[var(--color-bg-hover)]" : "hover:bg-[var(--color-bg-surface)]"}`} onClick={() => setSelectedSubmodulePath(row.path)}>
                      <span className="inline-flex min-w-0 items-center gap-2 font-medium"><HardDrive className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" /><span className="truncate">{row.name}</span></span>
                      <span className="truncate text-[var(--color-text-secondary)]">{row.url}</span>
                      <span className="font-mono text-xs">{row.pinnedCommit}{row.pinnedVersion ? ` v${row.pinnedVersion}` : ""}</span>
                      <span className="font-mono text-xs">{row.currentCommit}</span>
                      <span className={row.behind === 0 && row.ahead === 0 ? "" : "text-[var(--color-danger)]"}>{row.ahead}/{row.behind}</span>
                      <span>{row.branch}<br /><span className={row.behind === 0 ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}>{row.behind === 0 ? "Tracking" : `Behind ${row.behind}`}</span></span>
                      <span>{row.recursive}</span>
                      <span className={row.status === "Up to date" ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}><StatusDot status={row.status} /> <span className="ml-1">{row.status}</span></span>
                      <span className="flex justify-end gap-1">
                        <ActionButton disabled={isSubmoduleMutating} onClick={(event) => { event.stopPropagation(); handleSubmoduleInitUpdate(row.path, !row.isInitialized); }}>{row.isInitialized ? "Update" : "Init"}</ActionButton>
                        <ActionButton tone="accent" disabled={openRepository.isPending} onClick={(event) => { event.stopPropagation(); void handleOpenSubmodule(row.path); }}>Open</ActionButton>
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyState message={activeRepoPath ? "No submodules returned by the repository." : "Open a repository to load submodules."} />
                )}
              </div>
              {foreachStatusQuery.data && foreachStatusQuery.data.length > 0 ? (
                <details className="border-t border-[var(--color-border)] p-3">
                  <summary className="cursor-pointer text-xs uppercase tracking-wide text-[var(--color-text-muted)]">Recursive foreach status detail · {foreachStatusQuery.data.length} entries</summary>
                  <div className="mt-3 max-h-36 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-2 text-xs">
                    {foreachStatusQuery.data.map((status) => (
                      <div key={status.path} className="grid grid-cols-[1.4fr_0.9fr_0.7fr_0.7fr] gap-2 border-b border-[var(--color-border-muted)] py-1 last:border-b-0">
                        <span className="truncate">{status.path}</span>
                        <span className="truncate">{status.detached ? `detached ${shortHash(status.head)}` : status.branch ?? "—"}</span>
                        <span>{status.modifiedFiles + status.stagedFiles} changes</span>
                        <span>{status.ahead}/{status.behind} A/B</span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </section>
          )}
        </main>

        <aside className="min-h-0 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
          {activeWorkspaceSection === "worktrees" ? (
            <>
              <h3 className="text-sm font-semibold text-[var(--color-text-secondary)]">Selected Worktree</h3>
              {selectedWorktree ? (
                <>
                  <div className="mt-4 flex items-center gap-2 text-lg font-semibold"><FolderGit2 className="h-5 w-5" /> {selectedWorktree.name}</div>
                  <div className="mt-3 space-y-2 text-sm text-[var(--color-text-secondary)]">
                    <p className="break-all">{selectedWorktree.path}</p>
                    <p><GitBranch className="mr-2 inline h-4 w-4" />{selectedWorktree.branch}</p>
                    <p className="flex justify-between">HEAD <span className="font-mono">{selectedWorktree.head}</span></p>
                    <p className="flex justify-between">Status <span className={selectedWorktree.status === "Clean" ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}>{selectedWorktree.prunable ? "Prunable" : selectedWorktree.status}</span></p>
                    <p className="flex justify-between">Changes <span>{selectedWorktree.modifiedFiles} modified · {selectedWorktree.stagedFiles} staged</span></p>
                    <p className="flex justify-between">Ahead / Behind <span>{selectedWorktree.aheadBehind}</span></p>
                    <p className="flex justify-between">Detached <span>{selectedWorktree.isDetached ? "Yes" : "No"}</span></p>
                    <p className="flex justify-between">Locked <span>{selectedWorktree.isLocked ? selectedWorktree.lockReason || "Yes" : "No"}</span></p>
                  </div>
                  {selectedWorktree.isDetached ? <p className="mt-4 rounded-md border border-[color:rgba(210,153,34,0.35)] bg-[color:rgba(210,153,34,0.08)] p-3 text-xs text-[var(--color-warning)]">Detached worktree: avoid commits here unless you intentionally want detached HEAD work.</p> : null}
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--color-border)] py-2 text-sm text-[var(--color-accent)]" disabled={openRepository.isPending} onClick={() => handleOpenWorktree(selectedWorktree.path)}><TerminalSquare className="h-4 w-4" /> Open</button>
                    <button className="rounded-md border border-[var(--color-border)] py-2 text-sm" disabled={isWorktreeMutating} onClick={() => handleMoveWorktree(selectedWorktree)}>Move</button>
                    <button className="rounded-md border border-[var(--color-border)] py-2 text-sm" disabled={isWorktreeMutating} onClick={() => selectedWorktree.isLocked ? handleUnlockWorktree(selectedWorktree) : handleLockWorktree(selectedWorktree)}>{selectedWorktree.isLocked ? "Unlock" : "Lock"}</button>
                    <button className="rounded-md border border-[var(--color-border)] py-2 text-sm" disabled={isWorktreeMutating} onClick={() => handleRepairWorktree(selectedWorktree)}>Repair</button>
                    <button className="rounded-md border border-[var(--color-border)] py-2 text-sm" disabled={repairWorktreeDryRun.isPending} onClick={() => handlePreviewRepair(selectedWorktree)}>Preview repair</button>
                    <button className="rounded-md border border-[var(--color-border)] py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50" disabled={selectedWorktree.isCurrent || removeWorktreeDryRun.isPending || removeWorktree.isPending} onClick={() => void handleRemoveWorktree(selectedWorktree, false)}>Remove</button>
                    <button className="rounded-md border border-[color:rgba(248,81,73,0.45)] py-2 text-sm text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-50" disabled={selectedWorktree.isCurrent || removeWorktreeDryRun.isPending || removeWorktree.isPending} onClick={() => void handleRemoveWorktree(selectedWorktree, true)}>Force remove</button>
                  </div>
                  {prunePreviewPaths.length > 0 || repairPreviewLines.length > 0 ? (
                    <div className="mt-5 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3">
                      <h4 className="text-sm font-semibold">Preview detail</h4>
                      {prunePreviewPaths.length > 0 ? <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] p-2 text-xs text-[var(--color-text-secondary)]">{previewList(prunePreviewPaths)}</pre> : null}
                      {repairPreviewLines.length > 0 ? <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] p-2 text-xs text-[var(--color-text-secondary)]">{repairPreviewPath ? `Repair preview for ${repairPreviewPath}\n` : ""}{previewList(repairPreviewLines)}</pre> : null}
                    </div>
                  ) : null}
                </>
              ) : <p className="mt-4 text-sm text-[var(--color-text-muted)]">No worktree selected.</p>}
            </>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-[var(--color-text-secondary)]">Selected Submodule</h3>
              {selectedSubmodule ? (
                <>
                  <div className="mt-4 flex items-center gap-2 text-lg font-semibold"><HardDrive className="h-5 w-5" /> {selectedSubmodule.name}</div>
                  <p className="mt-2 break-all text-sm text-[var(--color-text-secondary)]">{selectedSubmodule.url}</p>
                  <div className="mt-4 space-y-2 text-sm">
                    <p className="flex justify-between">Pinned <span className="font-mono">{selectedSubmodule.pinnedCommit}{selectedSubmodule.pinnedVersion ? ` (${selectedSubmodule.pinnedVersion})` : ""}</span></p>
                    <p className="flex justify-between">Current <span className="font-mono">{selectedSubmodule.currentCommit}</span></p>
                    <p className="flex justify-between">Branch <span>{selectedSubmodule.branch}</span></p>
                    <p className="flex justify-between">Status <span>{selectedSubmodule.status}</span></p>
                    <p className="flex justify-between">Ahead / Behind <span>{selectedSubmodule.ahead}/{selectedSubmodule.behind}</span></p>
                    <p className="flex justify-between">Nested recursive <span>{selectedSubmodule.recursive}</span></p>
                  </div>
                  {selectedSubmodule.behind > 0 ? <p className="mt-4 rounded-md border border-[color:rgba(210,153,34,0.35)] bg-[color:rgba(210,153,34,0.08)] p-3 text-xs text-[var(--color-warning)]"><AlertCircle className="mr-2 inline h-4 w-4" /> {selectedSubmodule.name} is {selectedSubmodule.behind} commits behind its tracked branch.</p> : null}
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--color-border)] py-2 text-sm text-[var(--color-accent)]" disabled={openRepository.isPending} onClick={() => handleOpenSubmodule(selectedSubmodule.path)}><GitCommitHorizontal className="h-4 w-4" /> Open</button>
                    <button className="rounded-md border border-[var(--color-border)] py-2 text-sm" disabled={isSubmoduleMutating} onClick={() => handleSetSubmoduleBranch(selectedSubmodule)}>Track branch</button>
                    <button className="rounded-md border border-[var(--color-border)] py-2 text-sm" disabled={isSubmoduleMutating} onClick={() => handleSubmoduleInitUpdate(selectedSubmodule.path, !selectedSubmodule.isInitialized)}>Init/update</button>
                    <button className="rounded-md border border-[var(--color-border)] py-2 text-sm" disabled={isSubmoduleMutating} onClick={() => handlePinnedSubmoduleUpdate(selectedSubmodule)}>Pinned update</button>
                    <button className="rounded-md border border-[var(--color-border)] py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50" disabled={isSubmoduleMutating || selectedSubmodule.behind <= 0} onClick={() => handleBumpSubmodule(selectedSubmodule)}>Bump parent</button>
                  </div>
                  <div className="mt-5 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3 text-xs text-[var(--color-text-secondary)]">
                    <div className="font-semibold text-[var(--color-text-primary)]">Recursive workflow</div>
                    <p className="mt-2">Use the toolbar for repository-wide recursive update, URL sync, and foreach refresh. Row actions stay limited to open and update.</p>
                  </div>
                </>
              ) : <p className="mt-4 text-sm text-[var(--color-text-muted)]">No submodule selected.</p>}
            </>
          )}
        </aside>
      </div>
      {isCreateWorktreeOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-6 backdrop-blur-sm">
          <form
            onSubmit={handleCreateWorktree}
            className="w-full max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-2xl"
          >
            <div className="border-b border-[var(--color-border-muted)] px-6 py-5">
              <p className="text-xs uppercase tracking-wide text-[var(--color-accent)]">
                Git worktree add
              </p>
              <h2 className="mt-1 text-xl font-semibold">Create worktree</h2>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                Add another working directory for an existing branch, commit, or a new branch.
              </p>
            </div>
            <div className="grid gap-4 px-6 py-5">
              <label className="grid gap-2 text-sm">
                <span className="font-medium">Worktree path</span>
                <input
                  autoFocus
                  value={createWorktreeForm.path}
                  onChange={(event) =>
                    setCreateWorktreeForm((form) => ({
                      ...form,
                      path: event.target.value,
                    }))
                  }
                  placeholder="../feature-worktree"
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="font-medium">Branch or commit</span>
                <input
                  value={createWorktreeForm.branch}
                  onChange={(event) =>
                    setCreateWorktreeForm((form) => ({
                      ...form,
                      branch: event.target.value,
                    }))
                  }
                  placeholder="feature/my-work (optional)"
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
                />
              </label>
              <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3 text-sm text-[var(--color-text-secondary)]">
                <input
                  type="checkbox"
                  checked={createWorktreeForm.createBranch}
                  disabled={!createWorktreeForm.branch.trim()}
                  onChange={(event) =>
                    setCreateWorktreeForm((form) => ({
                      ...form,
                      createBranch: event.target.checked,
                    }))
                  }
                />
                Create branch if it does not exist
              </label>
              <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3 text-xs text-[var(--color-text-secondary)]">
                <div className="font-semibold text-[var(--color-text-primary)]">
                  Command preview
                </div>
                <code className="mt-2 block break-all">
                  git worktree add{" "}
                  {createWorktreeForm.createBranch &&
                  createWorktreeForm.branch.trim()
                    ? `-b ${createWorktreeForm.branch.trim()} `
                    : ""}
                  {createWorktreeForm.path.trim() || "<path>"}
                  {!createWorktreeForm.createBranch &&
                  createWorktreeForm.branch.trim()
                    ? ` ${createWorktreeForm.branch.trim()}`
                    : ""}
                </code>
              </div>
              {actionError ? (
                <div className="rounded-lg border border-[color:rgba(248,81,73,0.35)] bg-[color:rgba(248,81,73,0.08)] p-3 text-sm text-[var(--color-danger)]">
                  {actionError}
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-between border-t border-[var(--color-border-muted)] px-6 py-4">
              <p className="text-xs text-[var(--color-text-muted)]">
                Path is required. Branch or commit is optional.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeCreateWorktreeDialog}
                  disabled={createWorktree.isPending}
                  className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    createWorktree.isPending || !createWorktreeForm.path.trim()
                  }
                  className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createWorktree.isPending ? "Creating…" : "Create worktree"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
      {isAddSubmoduleOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-6 backdrop-blur-sm">
          <form
            onSubmit={handleAddSubmodule}
            className="w-full max-w-2xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-2xl"
          >
            <div className="border-b border-[var(--color-border-muted)] px-6 py-5">
              <p className="text-xs uppercase tracking-wide text-[var(--color-accent)]">
                Git submodule add
              </p>
              <h2 className="mt-1 text-xl font-semibold">Add submodule</h2>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                Link another repository into this workspace and commit the generated .gitmodules entry.
              </p>
            </div>
            <div className="grid gap-4 px-6 py-5">
              <label className="grid gap-2 text-sm">
                <span className="font-medium">Repository URL</span>
                <input
                  autoFocus
                  value={addSubmoduleForm.url}
                  onChange={(event) =>
                    setAddSubmoduleForm((form) => ({
                      ...form,
                      url: event.target.value,
                    }))
                  }
                  placeholder="https://github.com/org/repo.git"
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="grid gap-2 text-sm">
                  <span className="font-medium">Relative path</span>
                  <input
                    value={addSubmoduleForm.path}
                    onChange={(event) =>
                      setAddSubmoduleForm((form) => ({
                        ...form,
                        path: event.target.value,
                      }))
                    }
                    placeholder="libs/ui-kit"
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="font-medium">Branch to track</span>
                  <input
                    value={addSubmoduleForm.branch}
                    onChange={(event) =>
                      setAddSubmoduleForm((form) => ({
                        ...form,
                        branch: event.target.value,
                      }))
                    }
                    placeholder="main (optional)"
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
                  />
                </label>
              </div>
              <label className="grid gap-2 text-sm">
                <span className="font-medium">Display name</span>
                <input
                  value={addSubmoduleForm.name}
                  onChange={(event) =>
                    setAddSubmoduleForm((form) => ({
                      ...form,
                      name: event.target.value,
                    }))
                  }
                  placeholder="ui-kit (optional)"
                  className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]"
                />
              </label>
              <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3 text-xs text-[var(--color-text-secondary)]">
                <div className="font-semibold text-[var(--color-text-primary)]">
                  Command preview
                </div>
                <code className="mt-2 block break-all">
                  git submodule add
                  {addSubmoduleForm.branch.trim()
                    ? ` --branch ${addSubmoduleForm.branch.trim()}`
                    : ""}
                  {addSubmoduleForm.name.trim()
                    ? ` --name ${addSubmoduleForm.name.trim()}`
                    : ""}{" "}
                  -- {addSubmoduleForm.url.trim() || "<repository-url>"}{" "}
                  {addSubmoduleForm.path.trim() || "<relative-path>"}
                </code>
              </div>
              {actionError ? (
                <div className="rounded-lg border border-[color:rgba(248,81,73,0.35)] bg-[color:rgba(248,81,73,0.08)] p-3 text-sm text-[var(--color-danger)]">
                  {actionError}
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-between border-t border-[var(--color-border-muted)] px-6 py-4">
              <p className="text-xs text-[var(--color-text-muted)]">
                URL and path are required. Branch and display name are optional.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeAddSubmoduleDialog}
                  disabled={addSubmodule.isPending}
                  className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    addSubmodule.isPending ||
                    !addSubmoduleForm.url.trim() ||
                    !addSubmoduleForm.path.trim()
                  }
                  className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addSubmodule.isPending ? "Adding…" : "Add submodule"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
