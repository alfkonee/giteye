import { useState, type MouseEvent } from "react";
import { useAppStore } from "../../stores/app-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { cn } from "../../lib/cn";
import { GitBranch, GitMerge, Plus, Trash2, Check } from "lucide-react";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { BranchSwitchDialog } from "./BranchSwitchDialog";
import { BranchContextMenu } from "./BranchContextMenu";
import type { Branch } from "../../types/git";
import type { CheckoutBranchStrategy } from "../../lib/tauri-api";

export function BranchList() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const queryClient = useQueryClient();
  const { data: branches, isLoading } = useQuery(gitQueries.branches(activeRepoPath));
  const { data: snapshot } = useQuery(gitQueries.repositorySnapshot(activeRepoPath));
  const checkoutMutation = useMutation(gitMutations.checkoutBranch(queryClient, activeRepoPath));
  const createMutation = useMutation(gitMutations.createBranch(queryClient, activeRepoPath));
  const deleteMutation = useMutation(gitMutations.deleteBranch(queryClient, activeRepoPath));
  const fastForwardMutation = useMutation(gitMutations.fastForwardBranch(queryClient, activeRepoPath));
  const mergeMutation = useMutation(gitMutations.mergeBranch(queryClient, activeRepoPath));

  const [newBranchName, setNewBranchName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [branchToSwitch, setBranchToSwitch] = useState<Branch | null>(null);
  const [contextBranch, setContextBranch] = useState<{ branch: Branch; x: number; y: number } | null>(null);

  const localBranches = branches?.filter((b) => !b.isRemote) ?? [];
  const remoteBranches = branches?.filter((b) => b.isRemote) ?? [];
  const branchMutationError = checkoutMutation.error ?? createMutation.error ?? deleteMutation.error ?? fastForwardMutation.error ?? mergeMutation.error;
  const branchMutationPending =
    checkoutMutation.isPending || createMutation.isPending || deleteMutation.isPending || fastForwardMutation.isPending || mergeMutation.isPending;
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete branch "${branch.shortName}"?`)) {
                  deleteMutation.mutate(branch.shortName);
                }
              }}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-all"
              title="Delete branch"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}

        {remoteBranches.length > 0 && (
          <>
            <div className="px-3 pt-3 pb-1 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase">Remote</div>
            {remoteBranches.map((branch) => (
              <div
                key={branch.name}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-bg-surface)] cursor-pointer text-xs text-[var(--color-text-secondary)]"
                onDoubleClick={() => requestBranchSwitch(branch)}
                onContextMenu={(event) => openBranchContextMenu(event, branch)}
                title="Double-click to switch remote branch, right-click for branch actions"
              >
                <GitBranch className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
                <span className="truncate">{branch.shortName}</span>
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
        onCreateFromBranch={createBranchFrom}
        onFastForward={fastForwardBranch}
        onMerge={mergeBranch}
        onClose={() => setContextBranch(null)}
      />
    </div>
  );
}
