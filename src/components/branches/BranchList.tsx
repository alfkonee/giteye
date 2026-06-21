import { useState, type MouseEvent } from "react";
import { useAppStore } from "../../stores/app-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { cn } from "../../lib/cn";
import { formatDryRunPreview } from "../../lib/git-preview";
import { GitBranch, GitMerge, Plus, Trash2, Check, UploadCloud } from "lucide-react";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { BranchSwitchDialog } from "./BranchSwitchDialog";
import { BranchContextMenu } from "./BranchContextMenu";
import type { Branch } from "../../types/git";
import type { CheckoutBranchStrategy } from "../../lib/tauri-api";

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


export function BranchList() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const queryClient = useQueryClient();
  const { data: branches, isLoading } = useQuery(gitQueries.branches(activeRepoPath));
  const { data: snapshot } = useQuery(gitQueries.repositorySnapshot(activeRepoPath));
  const checkoutMutation = useMutation(gitMutations.checkoutBranch(queryClient, activeRepoPath));
  const createMutation = useMutation(gitMutations.createBranch(queryClient, activeRepoPath));
  const deleteMutation = useMutation(gitMutations.deleteBranch(queryClient, activeRepoPath));
  const fastForwardMutation = useMutation(gitMutations.fastForwardBranch(queryClient, activeRepoPath));
  const mergeMutation = useMutation(gitMutations.mergeBranch(queryClient, activeRepoPath));
  const renameMutation = useMutation(gitMutations.renameBranch(queryClient, activeRepoPath));
  const upstreamMutation = useMutation(gitMutations.setBranchUpstream(queryClient, activeRepoPath));
  const pushBranchMutation = useMutation(gitMutations.pushBranch(queryClient, activeRepoPath));
  const pushBranchDryRunMutation = useMutation(gitMutations.pushBranchDryRun(activeRepoPath));
  const deleteRemoteBranchMutation = useMutation(gitMutations.deleteRemoteBranch(queryClient, activeRepoPath));
  const deleteRemoteBranchDryRunMutation = useMutation(gitMutations.deleteRemoteBranchDryRun(activeRepoPath));

  const [newBranchName, setNewBranchName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [branchToSwitch, setBranchToSwitch] = useState<Branch | null>(null);
  const [contextBranch, setContextBranch] = useState<{ branch: Branch; x: number; y: number } | null>(null);

  const localBranches = branches?.filter((branch) => !branch.isRemote) ?? [];
  const remoteBranches = branches?.filter((branch) => branch.isRemote) ?? [];
  const remoteNames = remoteNamesFromBranches(branches ?? []);
  const branchMutationError =
    checkoutMutation.error ??
    createMutation.error ??
    deleteMutation.error ??
    renameMutation.error ??
    upstreamMutation.error ??
    fastForwardMutation.error ??
    mergeMutation.error ??
    pushBranchMutation.error ??
    pushBranchDryRunMutation.error ??
    deleteRemoteBranchMutation.error ??
    deleteRemoteBranchDryRunMutation.error;
  const branchMutationPending =
    checkoutMutation.isPending ||
    createMutation.isPending ||
    deleteMutation.isPending ||
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

  const requestBranchSwitch = (branch: Branch) => {
    if (!branch.isCurrent) {
      setBranchToSwitch(branch);
    }
  };

  const confirmBranchSwitch = (strategy: CheckoutBranchStrategy) => {
    if (!branchToSwitch) return;
    checkoutMutation.mutate(
      { branchName: branchToSwitch.shortName, strategy },
      { onSuccess: () => setBranchToSwitch(null) },
    );
  };

  const openBranchContextMenu = (event: MouseEvent, branch: Branch) => {
    event.preventDefault();
    setContextBranch({ branch, x: event.clientX, y: event.clientY });
  };

  const createBranchFrom = (branch: Branch) => {
    const name = window.prompt(`New branch name from ${branch.shortName}`);
    const trimmedName = name?.trim();
    if (!trimmedName) return;
    createMutation.mutate({ name: trimmedName, checkout: false, startPoint: branch.shortName });
  };

  const fastForwardBranch = (branch: Branch) => {
    if (!branch.upstream) return;
    fastForwardMutation.mutate({ branchName: branch.shortName, upstream: branch.upstream });
  };
  const mergeBranch = (branch: Branch) => {
    if (branch.isCurrent) return;
    if (!window.confirm(`Merge "${branch.shortName}" into the current branch? Your working tree must be clean.`)) return;
    mergeMutation.mutate(branch.shortName);
  };

  const deleteBranch = (branch: Branch) => {
    if (branch.isCurrent || branch.isRemote) return;
    if (confirm(`Delete local branch "${branch.shortName}"?`)) {
      deleteMutation.mutate(branch.shortName);
    }
  };

  const renameBranch = (branch: Branch) => {
    if (branch.isRemote) return;
    const newName = window.prompt(`Rename "${branch.shortName}" to`, branch.shortName)?.trim();
    if (!newName || newName === branch.shortName) return;
    renameMutation.mutate({ oldName: branch.shortName, newName });
  };

  const setBranchUpstream = (branch: Branch) => {
    if (branch.isRemote) return;
    const defaultUpstream = branch.upstream ?? (remoteNames[0] ? `${remoteNames[0]}/${branch.shortName}` : "");
    const upstream = window.prompt(
      `Upstream for "${branch.shortName}" (remote/branch, empty clears tracking)`,
      defaultUpstream,
    );
    if (upstream === null) return;
    upstreamMutation.mutate({ branchName: branch.shortName, upstream: upstream.trim() || null });
  };

  const pushBranch = async (branch: Branch, forceWithLease: boolean) => {
    if (branch.isRemote) return;
    const remote = window.prompt("Push to remote", branch.upstream?.split("/", 1)[0] ?? remoteNames[0] ?? "origin")?.trim();
    if (!remote) return;
    const upstreamBranch = branch.upstream?.startsWith(`${remote}/`) ? branch.upstream.slice(remote.length + 1) : branch.shortName;
    const remoteBranch = window.prompt("Remote branch name", upstreamBranch)?.trim();
    if (remoteBranch === undefined) return;
    const target = `${remote}/${remoteBranch || branch.shortName}`;
    const setUpstream = !forceWithLease && window.confirm(`Set "${branch.shortName}" to track ${target} after push?`);
    const request = {
      remote,
      localBranch: branch.shortName,
      remoteBranch: remoteBranch || null,
      setUpstream,
      forceWithLease,
    };
    let previewText: string;
    try {
      previewText = formatDryRunPreview(
        await pushBranchDryRunMutation.mutateAsync(request),
        "Git did not report any ref updates for this push dry run.",
      );
    } catch (error) {
      window.alert(`Unable to preview push to ${target}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const forceWarning = forceWithLease
      ? "\n\nThis can rewrite the remote branch if your lease is current. Recovery: keep the old remote tip from a collaborator, reflog, or host audit log and push a recovery branch if this is wrong."
      : "";
    if (!window.confirm(`Push "${branch.shortName}" to ${target}?${forceWarning}\n\nPreview:\n${previewText}`)) return;
    pushBranchMutation.mutate(request);
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
      window.alert(`Unable to preview remote branch deletion for ${target}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!window.confirm(`Delete remote branch "${target}"?\n\nPreview:\n${previewText}\n\nThis removes it from the remote repository. Recovery: recreate it by pushing any local branch or reflog commit that still points at the deleted tip.`)) return;
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
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Branches</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="p-1 rounded hover:bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="border-b border-[var(--color-border)] px-4 py-1.5 text-[11px] text-[var(--color-text-muted)]">
        Right-click branches for rename, upstream tracking, force-with-lease push, and remote deletion.
      </div>

      {(branchMutationPending || branchMutationError) && (
        <div className={cn("border-b border-[var(--color-border)] px-3 py-2 text-xs", branchMutationError ? "text-[var(--color-danger)]" : "text-[var(--color-text-muted)]")}>
          {branchMutationError ? String(branchMutationError) : "Updating branches…"}
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
        <div className="px-3 py-1 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase">Local</div>
        {localBranches.map((branch) => (
          <div
            key={branch.name}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 group cursor-pointer transition-colors",
              branch.isCurrent
                ? "bg-[var(--color-bg-hover)]"
                : "hover:bg-[var(--color-bg-surface)]"
            )}
            onDoubleClick={() => requestBranchSwitch(branch)}
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
        ))}

        {remoteBranches.length > 0 && (
          <>
            <div className="px-3 pt-3 pb-1 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase">Remote</div>
            {remoteBranches.map((branch) => (
              <div
                key={branch.name}
                className="group flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-bg-surface)] cursor-pointer text-xs text-[var(--color-text-secondary)]"
                onDoubleClick={() => requestBranchSwitch(branch)}
                onContextMenu={(event) => openBranchContextMenu(event, branch)}
                title="Double-click to switch remote branch, right-click for branch actions"
              >
                <GitBranch className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
                <span className="min-w-0 flex-1 truncate">{branch.shortName}</span>
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
            ))}
          </>
        )}
      </div>

      <BranchSwitchDialog
        branch={branchToSwitch}
        isClean={isClean}
        isPending={checkoutMutation.isPending}
        onCancel={() => setBranchToSwitch(null)}
        onConfirm={confirmBranchSwitch}
      />
      <BranchContextMenu
        branch={contextBranch?.branch ?? null}
        x={contextBranch?.x ?? 0}
        y={contextBranch?.y ?? 0}
        onRename={renameBranch}
        onSetUpstream={setBranchUpstream}
        onPushBranch={(branch) => pushBranch(branch, false)}
        onForcePushBranch={(branch) => pushBranch(branch, true)}
        onDeleteRemoteBranch={deleteRemoteBranch}
        onCreateFromBranch={createBranchFrom}
        onFastForward={fastForwardBranch}
        onMerge={mergeBranch}
        onAdvancedMergeRebase={() => setActiveView("rebase-conflicts")}
        onDelete={deleteBranch}
        onClose={() => setContextBranch(null)}
      />
    </div>
  );
}
