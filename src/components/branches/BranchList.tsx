import { useState, type MouseEvent } from "react";
import { useAppStore } from "../../stores/app-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitActionErrorMessage, gitMutations, gitQueries } from "../../lib/git-data";
import { cn } from "../../lib/cn";
import { runBranchPushFlow } from "../../lib/branch-push";
import { formatDryRunPreview } from "../../lib/git-preview";
import {
  ArrowRight,
  Check,
  FastForward,
  GitBranch,
  GitMerge,
  LayoutGrid,
  List,
  Plus,
  Tag,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { formatRelativeTime, stalenessTone } from "../../lib/format";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { BranchSwitchDialog } from "./BranchSwitchDialog";
import { BranchContextMenu } from "./BranchContextMenu";
import { BranchPruneButton } from "./BranchPruneDialog";
import { BranchDeleteDialog } from "./BranchDeleteDialog";
import { appDialog } from "../common/AppDialogProvider";
import { CreatePullRequestDialog } from "../repository/CreatePullRequestDialog";
import { findTrackingLocalBranch, describeBranchActivation, useBranchActivation } from "../../lib/branch-activation";
import type { Branch } from "../../types/git";

function remoteNamesFromBranches(branches: Branch[]) {
  return Array.from(
    new Set(
      branches
        .filter((branch) => branch.isRemote)
        .map((branch) => branch.shortName.split("/", 1)[0])
        .filter(Boolean),
    ),
  );
}

function splitRemoteBranch(branch: Branch) {
  const separator = branch.shortName.indexOf("/");
  if (separator < 1) return null;
  return {
    remote: branch.shortName.slice(0, separator),
    branch: branch.shortName.slice(separator + 1),
  };
}

type BranchViewMode = "list" | "grid";

const BRANCH_VIEW_MODE_KEY = "giteye.branches.viewMode";

function initialBranchViewMode(): BranchViewMode {
  try {
    return localStorage.getItem(BRANCH_VIEW_MODE_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

/** Staleness chip for a ref's last commit date; neutral when unknown. */
function StalenessChip({ date, label }: { date?: string | null; label: string }) {
  const staleness = stalenessTone(date);
  const title = staleness
    ? `${label} ${staleness.days === 0 ? "today" : `${staleness.days} day${staleness.days === 1 ? "" : "s"} ago`}`
    : `${label}: unknown`;
  return (
    <span
      className="giteye-chip shrink-0 tabular-nums"
      data-tone={
        staleness
          ? staleness.tone === "fresh"
            ? "success"
            : staleness.tone === "recent"
              ? "accent"
              : staleness.tone === "aging"
                ? "warning"
                : "danger"
          : undefined
      }
      title={title}
    >
      {staleness ? formatRelativeTime(date!) : "no commits"}
    </span>
  );
}

interface BranchCardProps {
  branch: Branch;
  trackedBy?: string | null;
  activationTitle: string;
  activationPending?: boolean;
  onActivate: () => void;
  onContextMenu: (event: MouseEvent, branch: Branch) => void;
  onMerge?: () => void;
  onPush?: () => void;
  onDelete?: () => void;
}

/**
 * Card in the branches grid view: name, tracking state, last-commit details,
 * created/staleness info, and the same hover actions as the list rows.
 */
function BranchCard({
  branch,
  trackedBy,
  activationTitle,
  activationPending,
  onActivate,
  onContextMenu,
  onMerge,
  onPush,
  onDelete,
}: BranchCardProps) {
  const ahead = branch.ahead ?? 0;
  const behind = branch.behind ?? 0;

  return (
    <div
      className={cn(
        "group flex flex-col gap-2 rounded-lg border p-2.5 transition-colors",
        branch.isCurrent
          ? "border-[var(--color-accent)]/40 bg-[var(--color-bg-hover)]"
          : "border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/60 hover:bg-[var(--color-bg-surface)]",
      )}
      onDoubleClick={onActivate}
      onContextMenu={(event) => onContextMenu(event, branch)}
      title={activationTitle}
    >
      <div className="flex min-w-0 items-center gap-2">
        <GitBranch
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            branch.isCurrent ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]",
          )}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-xs",
            branch.isCurrent
              ? "font-medium text-[var(--color-text-primary)]"
              : "text-[var(--color-text-secondary)]",
          )}
        >
          {branch.shortName}
        </span>
        {branch.isCurrent && (
          <Check className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" aria-label="Current branch" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <StalenessChip
          date={branch.lastCommitDate}
          label={branch.isRemote ? "Updated" : "Last commit"}
        />
        {branch.upstream && (ahead > 0 || behind > 0) && (
          <span className="giteye-chip shrink-0 tabular-nums" data-tone={behind > 0 ? "warning" : "accent"}>
            {ahead > 0 ? `${ahead}↑` : ""}
            {behind > 0 ? `${behind}↓` : ""}
          </span>
        )}
      </div>

      {branch.lastCommitSubject && (
        <p className="min-w-0 truncate text-[11px] text-[var(--color-text-secondary)]" title={branch.lastCommitSubject}>
          {branch.lastCommitSubject}
        </p>
      )}
      <p className="min-w-0 truncate text-[10px] text-[var(--color-text-muted)]">
        {[
          branch.lastCommitAuthor,
          branch.lastCommitDate ? formatRelativeTime(branch.lastCommitDate) : null,
          !branch.isRemote && branch.createdAt
            ? `created ${formatRelativeTime(branch.createdAt)}`
            : null,
          branch.isRemote && trackedBy ? `tracked by ${trackedBy}` : null,
          branch.isRemote ? null : branch.upstream ? `tracks ${branch.upstream}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "\u00A0"}
      </p>

      {(onMerge || onPush || onDelete) && (
        <div className="mt-auto flex items-center gap-1 border-t border-[var(--color-border-muted)] pt-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {onMerge && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onMerge();
              }}
              disabled={activationPending}
              className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-accent)]"
              title="Merge into current branch"
            >
              <GitMerge className="h-3 w-3" />
            </button>
          )}
          {onPush && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPush();
              }}
              disabled={activationPending}
              className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-accent)]"
              title="Push branch"
            >
              <UploadCloud className="h-3 w-3" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              disabled={activationPending}
              className="ml-auto rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)]"
              title={branch.isRemote ? "Delete remote branch" : "Delete local branch"}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}


export function BranchList() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setPendingAdvancedBranchName = useAppStore((s) => s.setPendingAdvancedBranchName);
  const setSelectedCommitHash = useAppStore((s) => s.setSelectedCommitHash);
  const queryClient = useQueryClient();
  const { data: branches, isLoading } = useQuery(gitQueries.branches(activeRepoPath));
  const { data: snapshot } = useQuery(gitQueries.repositorySnapshot(activeRepoPath));
  const { data: tags = [] } = useQuery(gitQueries.tags(activeRepoPath));
  const createMutation = useMutation(gitMutations.createBranch(queryClient, activeRepoPath));
  const fastForwardMutation = useMutation(gitMutations.fastForwardBranch(queryClient, activeRepoPath));
  const mergeMutation = useMutation(gitMutations.mergeBranch(queryClient, activeRepoPath));
  const renameMutation = useMutation(gitMutations.renameBranch(queryClient, activeRepoPath));
  const upstreamMutation = useMutation(gitMutations.setBranchUpstream(queryClient, activeRepoPath));
  const pushBranchMutation = useMutation(gitMutations.pushBranch(queryClient, activeRepoPath));
  const pushBranchDryRunMutation = useMutation(gitMutations.pushBranchDryRun(activeRepoPath));
  const deleteRemoteBranchMutation = useMutation(gitMutations.deleteRemoteBranch(queryClient, activeRepoPath));
  const deleteRemoteBranchDryRunMutation = useMutation(gitMutations.deleteRemoteBranchDryRun(activeRepoPath));
  const branchActivation = useBranchActivation({
    repoPath: activeRepoPath,
    branches: branches ?? [],
    onAdvancedIntegrate: (ref) => {
      setPendingAdvancedBranchName(ref);
      setActiveView("workspace");
    },
  });

  const [newBranchName, setNewBranchName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [viewMode, setViewMode] = useState<BranchViewMode>(initialBranchViewMode);
  const switchViewMode = (mode: BranchViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(BRANCH_VIEW_MODE_KEY, mode);
    } catch {
      // Storage may be unavailable; the in-memory mode still works.
    }
  };
  const [contextBranch, setContextBranch] = useState<{ branch: Branch; x: number; y: number } | null>(null);
  // Local deletion is owned by BranchDeleteDialog so it can optionally delete
  // the configured tracking remote in the same reviewed flow.
  const [deleteBranchTarget, setDeleteBranchTarget] = useState<Branch | null>(null);
  const [prBranch, setPrBranch] = useState<Branch | null>(null);

  const localBranches = branches?.filter((branch) => !branch.isRemote) ?? [];
  const remoteBranches = branches?.filter((branch) => branch.isRemote) ?? [];
  const remoteNames = remoteNamesFromBranches(branches ?? []);
  const branchMutationError =
    branchActivation.error ??
    createMutation.error ??
    renameMutation.error ??
    upstreamMutation.error ??
    fastForwardMutation.error ??
    mergeMutation.error ??
    pushBranchMutation.error ??
    pushBranchDryRunMutation.error ??
    deleteRemoteBranchMutation.error ??
    deleteRemoteBranchDryRunMutation.error;
  const branchMutationPending =
    branchActivation.isPending ||
    createMutation.isPending ||
    renameMutation.isPending ||
    upstreamMutation.isPending ||
    fastForwardMutation.isPending ||
    mergeMutation.isPending ||
    pushBranchMutation.isPending ||
    pushBranchDryRunMutation.isPending ||
    deleteRemoteBranchMutation.isPending ||
    deleteRemoteBranchDryRunMutation.isPending;
  const isClean = snapshot?.repositoryInfo.isClean ?? true;

  const handleCreate = () => {
    if (!newBranchName.trim()) return;
    createMutation.mutate(
      { name: newBranchName.trim(), checkout: true },
      {
        onSuccess: () => {
          setNewBranchName("");
          setShowCreate(false);
        },
      }
    );
  };

  const trackedByLocal = (branch: Branch): string | null =>
    findTrackingLocalBranch(branch, branches ?? [])?.shortName ?? null;

  const openBranchContextMenu = (event: MouseEvent, branch: Branch) => {
    event.preventDefault();
    setContextBranch({ branch, x: event.clientX, y: event.clientY });
  };

  const createBranchFrom = async (branch: Branch) => {
    const name = await appDialog.prompt(
      `Create a new branch from ${branch.shortName}.`,
      "",
      "New branch name",
    );
    const trimmedName = name?.trim();
    if (!trimmedName) return;
    createMutation.mutate({ name: trimmedName, checkout: false, startPoint: branch.shortName });
  };
  const fastForwardBranch = (branch: Branch) => {
    if (!branch.upstream) return;
    fastForwardMutation.mutate({ branchName: branch.shortName, upstream: branch.upstream });
  };

  const mergeBranch = async (branch: Branch) => {
    if (branch.isCurrent) return;
    if (!(await appDialog.confirm(
      `Merge "${branch.shortName}" into the current branch? Your working tree must be clean.`,
      "Merge branch?",
    ))) return;
    mergeMutation.mutate(branch.shortName);
  };
  const deleteBranch = (branch: Branch) => {
    if (branch.isCurrent || branch.isRemote) return;
    setDeleteBranchTarget(branch);
  };

  const renameBranch = async (branch: Branch) => {
    if (branch.isRemote) return;
    const newName = (await appDialog.prompt(
      `Rename "${branch.shortName}" to:`,
      branch.shortName,
      "Rename branch",
    ))?.trim();
    if (!newName || newName === branch.shortName) return;
    renameMutation.mutate({ oldName: branch.shortName, newName });
  };

  const setBranchUpstream = async (branch: Branch) => {
    if (branch.isRemote) return;
    const defaultUpstream = branch.upstream ?? (remoteNames[0] ? `${remoteNames[0]}/${branch.shortName}` : "");
    const upstream = await appDialog.prompt(
      `Set the upstream for "${branch.shortName}" as remote/branch. Leave empty to clear tracking.`,
      defaultUpstream,
      "Set tracking upstream",
    );
    if (upstream === null) return;
    upstreamMutation.mutate({ branchName: branch.shortName, upstream: upstream.trim() || null });
  };

  const pushBranch = async (branch: Branch, forceWithLease: boolean) => {
    if (branch.isRemote) return;
    await runBranchPushFlow({
      branch,
      remoteNames,
      forceWithLease,
      dryRunPreview: (request) => pushBranchDryRunMutation.mutateAsync(request),
      submitPush: (request) => pushBranchMutation.mutate(request),
    });
  };

  const deleteRemoteBranch = async (branch: Branch) => {
    if (!branch.isRemote) return;
    const parsed = splitRemoteBranch(branch);
    if (!parsed) return;
    const target = `${parsed.remote}/${parsed.branch}`;
    let previewText: string;
    try {
      previewText = formatDryRunPreview(
        await deleteRemoteBranchDryRunMutation.mutateAsync(parsed),
        "Git did not report a ref deletion for this remote branch dry run.",
      );
    } catch (error) {
      await appDialog.alert(
        `Unable to preview remote branch deletion for ${target}: ${error instanceof Error ? error.message : String(error)}`,
        "Remote deletion preview failed",
      );
      return;
    }
    if (!(await appDialog.confirm(
      `Delete remote branch "${target}"?\n\nPreview:\n${previewText}\n\nThis removes it from the remote repository. Recovery: recreate it by pushing any local branch or reflog commit that still points at the deleted tip.`,
      "Delete remote branch?",
      "danger",
    ))) return;
    deleteRemoteBranchMutation.mutate(parsed);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Branches & tags</h2>
          <p className="truncate text-[10.5px] text-[var(--color-text-muted)]">
            Double-click to activate a branch or inspect a tag.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <BranchPruneButton repoPath={activeRepoPath} />
          <div
            className="flex items-center overflow-hidden rounded-md border border-[var(--color-border-muted)]"
            role="group"
            aria-label="Branch layout"
          >
            <button
              type="button"
              onClick={() => switchViewMode("list")}
              aria-pressed={viewMode === "list"}
              title="List view"
              className={cn(
                "p-1.5 transition-colors",
                viewMode === "list"
                  ? "bg-[var(--color-bg-hover)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
              )}
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => switchViewMode("grid")}
              aria-pressed={viewMode === "grid"}
              title="Card grid view with branch details"
              className={cn(
                "p-1.5 transition-colors",
                viewMode === "grid"
                  ? "bg-[var(--color-bg-hover)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="giteye-btn giteye-btn-ghost giteye-btn-sm giteye-btn-icon"
            title="Create branch"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="border-b border-[var(--color-border)] px-4 py-1.5 text-[11px] text-[var(--color-text-muted)]">
        Right-click branches for rename, upstream tracking, force-with-lease push, and remote deletion.
      </div>

      {(branchMutationPending || branchMutationError) && (
        <div className={cn("border-b border-[var(--color-border)] px-3 py-2 text-xs", branchMutationError ? "text-[var(--color-danger)]" : "text-[var(--color-text-muted)]")}>
          {branchMutationError
            ? gitActionErrorMessage(branchMutationError)
            : "Updating branches…"}
        </div>
      )}
      {showCreate && (
        <div className="px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <input
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="New branch name..."
            className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded px-2 py-1 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
            autoFocus
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        <div className="flex items-center gap-2 px-3 py-1 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase">
          <span>Local</span>
          <span className="tabular-nums normal-case">{localBranches.length}</span>
        </div>
        {viewMode === "grid" ? (
          <div className="grid gap-2 px-3 py-2 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
            {localBranches.map((branch) => (
              <BranchCard
                key={branch.name}
                branch={branch}
                activationTitle={describeBranchActivation(branch, branches ?? [])}
                activationPending={branchActivation.isPending}
                onActivate={() => branchActivation.activateBranch(branch)}
                onContextMenu={openBranchContextMenu}
                onMerge={!branch.isCurrent ? () => void mergeBranch(branch) : undefined}
                onPush={() => pushBranch(branch, false)}
                onDelete={!branch.isCurrent ? () => deleteBranch(branch) : undefined}
              />
            ))}
          </div>
        ) : (
          localBranches.map((branch) => (
          <div
            key={branch.name}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 group cursor-pointer transition-colors",
              branch.isCurrent
                ? "bg-[var(--color-bg-hover)]"
                : "hover:bg-[var(--color-bg-surface)]"
            )}
            onDoubleClick={() => branchActivation.activateBranch(branch)}
            onContextMenu={(event) => openBranchContextMenu(event, branch)}
            title={branch.isCurrent ? "Current branch" : "Double-click to switch branch, right-click for branch actions"}
          >
            <GitBranch
              className={cn("w-3.5 h-3.5 shrink-0", branch.isCurrent ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]")}
            />
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-xs", branch.isCurrent ? "text-[var(--color-text-primary)] font-medium" : "text-[var(--color-text-secondary)]")}>
                {branch.shortName}
              </span>
              {branch.upstream && (
                <span className="block truncate text-[10px] text-[var(--color-text-muted)]">
                  tracks {branch.upstream}
                  {branch.ahead ? ` · ${branch.ahead} ahead` : ""}
                  {branch.behind ? ` · ${branch.behind} behind` : ""}
                </span>
              )}
            </span>
            {branch.isCurrent && (
              <Check className="w-3.5 h-3.5 text-[var(--color-accent)] shrink-0" />
            )}
            {!branch.isCurrent && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  mergeBranch(branch);
                }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-all"
                title="Merge into current branch"
              >
                <GitMerge className="w-3 h-3" />
              </button>
            )}
            {!branch.isRemote && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  pushBranch(branch, false);
                }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-all"
                title="Push branch"
              >
                <UploadCloud className="w-3 h-3" />
              </button>
            )}
            {!branch.isCurrent && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteBranch(branch);
                }}
                className="rounded p-0.5 text-[var(--color-text-muted)] opacity-0 transition-all hover:text-[var(--color-danger)] group-focus-within:opacity-100 group-hover:opacity-100"
                title="Delete local branch"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        )))}

        {remoteBranches.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-3 pt-3 pb-1 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase">
              <span>Remote</span>
              <span className="tabular-nums normal-case">{remoteBranches.length}</span>
            </div>
            {remoteBranches.map((branch) => {
              const trackedBy = trackedByLocal(branch);
              return (
              <div
                key={branch.name}
                className="group flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-bg-surface)] cursor-pointer text-xs text-[var(--color-text-secondary)]"
                onDoubleClick={() => branchActivation.activateBranch(branch)}
                onContextMenu={(event) => openBranchContextMenu(event, branch)}
                title={trackedBy ? `Double-click to fast-forward "${trackedBy}" to ${branch.shortName}` : `Double-click to create a local branch tracking ${branch.shortName}`}
              >
                <GitBranch className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
                <span className="min-w-0 flex-1 truncate">{branch.shortName}</span>
                {trackedBy && (
                  <span className="hidden shrink-0 truncate text-[10px] text-[var(--color-accent)] xl:inline" title={`Tracked by ${trackedBy}`}>
                    {trackedBy}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    branchActivation.activateBranch(branch);
                  }}
                  disabled={branchActivation.isPending}
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-accent)] opacity-0 transition-all hover:bg-[var(--color-bg-surface)] group-focus-within:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed"
                  title={trackedBy ? `Fast-forward "${trackedBy}" to this remote branch` : "Create a tracking local branch and check it out"}
                >
                  {trackedBy ? <FastForward className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteRemoteBranch(branch);
                  }}
                  className="rounded p-0.5 text-[var(--color-text-muted)] opacity-0 transition-all hover:text-[var(--color-danger)] group-focus-within:opacity-100 group-hover:opacity-100"
                  title="Delete remote branch"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              );
            })}
          </>
        )}

        {tags.length > 0 ? (
          <>
            <div className="flex items-center gap-2 px-3 pb-1 pt-3 text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
              <span>Tags</span>
              <span className="tabular-nums normal-case">{tags.length}</span>
            </div>
            {tags.map((tag) => (
              <button
                key={tag.name}
                type="button"
                onDoubleClick={() => {
                  setSelectedCommitHash(tag.commitHash);
                  setActiveView("workspace");
                }}
                onClick={() => setSelectedCommitHash(tag.commitHash)}
                className="group flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]"
                title={`Tag ${tag.name} · ${tag.shortHash} · double-click to inspect commit`}
              >
                <Tag className="h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" />
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-muted)]">
                  {tag.shortHash}
                </span>
              </button>
            ))}
          </>
        ) : null}
      </div>

      <BranchSwitchDialog
        branch={branchActivation.switchBranch}
        isClean={isClean}
        isPending={branchActivation.switchPending}
        followUpNote={branchActivation.switchFollowUp}
        onCancel={branchActivation.cancelSwitch}
        onConfirm={branchActivation.confirmSwitch}
      />
      <BranchContextMenu
        branch={contextBranch?.branch ?? null}
        x={contextBranch?.x ?? 0}
        y={contextBranch?.y ?? 0}
        repoPath={activeRepoPath}
        onRename={renameBranch}
        onSetUpstream={setBranchUpstream}
        onPushBranch={(branch) => pushBranch(branch, false)}
        onForcePushBranch={(branch) => pushBranch(branch, true)}
        onDeleteRemoteBranch={deleteRemoteBranch}
        onCreateFromBranch={createBranchFrom}
        onFastForward={fastForwardBranch}
        onMerge={mergeBranch}
        onAdvancedMergeRebase={(branch) => {
          setPendingAdvancedBranchName(branch.shortName);
          setActiveView("workspace");
        }}
        onCreatePullRequest={setPrBranch}
        onDelete={deleteBranch}
        onClose={() => setContextBranch(null)}
      />
      <CreatePullRequestDialog
        branch={prBranch}
        repoPath={activeRepoPath}
        onClose={() => setPrBranch(null)}
      />
      <BranchDeleteDialog
        branch={deleteBranchTarget}
        repoPath={activeRepoPath}
        onClose={() => setDeleteBranchTarget(null)}
      />
    </div>
  );
}
