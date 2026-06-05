import { useState } from "react";
import { useAppStore } from "../../stores/app-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { cn } from "../../lib/cn";
import { GitBranch, Plus, Trash2, Check } from "lucide-react";
import { LoadingSpinner } from "../common/LoadingSpinner";

export function BranchList() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const queryClient = useQueryClient();
  const { data: branches, isLoading } = useQuery(gitQueries.branches(activeRepoPath));
  const checkoutMutation = useMutation(gitMutations.checkoutBranch(queryClient, activeRepoPath));
  const createMutation = useMutation(gitMutations.createBranch(queryClient, activeRepoPath));
  const deleteMutation = useMutation(gitMutations.deleteBranch(queryClient, activeRepoPath));

  const [newBranchName, setNewBranchName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const localBranches = branches?.filter((b) => !b.isRemote) ?? [];
  const remoteBranches = branches?.filter((b) => b.isRemote) ?? [];
  const branchMutationError = checkoutMutation.error ?? createMutation.error ?? deleteMutation.error;
  const branchMutationPending = checkoutMutation.isPending || createMutation.isPending || deleteMutation.isPending;

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
            onClick={() => {
              if (!branch.isCurrent) {
                checkoutMutation.mutate(branch.shortName);
              }
            }}
          >
            <GitBranch
              className={cn("w-3.5 h-3.5 shrink-0", branch.isCurrent ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]")}
            />
            <span className={cn("text-xs truncate flex-1", branch.isCurrent ? "text-[var(--color-text-primary)] font-medium" : "text-[var(--color-text-secondary)]")}>
              {branch.shortName}
            </span>
            {branch.isCurrent && (
              <Check className="w-3.5 h-3.5 text-[var(--color-accent)] shrink-0" />
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
              >
                <GitBranch className="w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0" />
                <span className="truncate">{branch.shortName}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
