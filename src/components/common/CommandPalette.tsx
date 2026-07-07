import { useEffect, useMemo, useCallback } from "react";
import { Command } from "cmdk";
import { useAppStore } from "../../stores/app-store";
import { useNoticeStore } from "../../stores/notice-store";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { gitMutations, invalidateGitState } from "../../lib/git-data";

type CommandItem = {
  label: string;
  detail: string;
  disabled?: boolean;
  run: () => void;
};

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const diffMode = useAppStore((s) => s.diffMode);
  const setDiffMode = useAppStore((s) => s.setDiffMode);
  const setTranscriptOpen = useNoticeStore((s) => s.setTranscriptOpen);
  const queryClient = useQueryClient();
  const fetchMutation = useMutation(gitMutations.fetch(queryClient, activeRepoPath));
  const pullMutation = useMutation(gitMutations.pull(queryClient, activeRepoPath));
  const pushMutation = useMutation(gitMutations.push(queryClient, activeRepoPath));
  const isRemoteOperationPending =
    fetchMutation.isPending || pullMutation.isPending || pushMutation.isPending;

  const commandItems = useMemo<CommandItem[]>(() => {
    const navigate = (view: Parameters<typeof setActiveView>[0]) => () => setActiveView(view);
    const disabled = !activeRepoPath;
    return [
      { label: "Open Working Tree", detail: "Show staged and unstaged changes", disabled, run: navigate("working-tree") },
      { label: "Open History", detail: "Show commit history", disabled, run: navigate("history") },
      { label: "Open Branches", detail: "Rename, track, push, and delete local or remote branches", disabled, run: navigate("branches") },
      { label: "Open Remotes", detail: "Add, edit, prune, delete, fetch, pull, and push remotes", disabled, run: navigate("remotes") },
      { label: "Open Stashes", detail: "Create and apply stashes", disabled, run: navigate("stashes") },
      { label: "Open Git LFS", detail: "Manage large-file tracking patterns", disabled, run: navigate("lfs") },
      { label: "Open Tags", detail: "Create, push, and delete local or remote tags", disabled, run: navigate("tags") },
      { label: "Open Worktrees", detail: "Manage linked worktrees", disabled, run: navigate("worktrees") },
      { label: "Open Submodules", detail: "Sync and update submodules", disabled, run: navigate("submodules") },
      { label: "Open Search & Archaeology", detail: "Search commits, files, blame, grep, pickaxe, reflog, and lost commits", disabled, run: navigate("archaeology") },
      { label: "Open Diagnostics & Bisect", detail: "Run fsck, maintenance/gc, signature checks, and guided git bisect", disabled, run: navigate("diagnostics") },
      { label: "Open Custom Command", detail: "Run arbitrary git commands", disabled, run: navigate("custom-command") },
      { label: "Open Rebase Resolver", detail: "Inspect rebase todo and conflicts", disabled, run: navigate("rebase-conflicts") },
      { label: "Open Settings", detail: "Application settings", run: navigate("settings") },
      { label: "Open Operation Transcript", detail: "Show completed Git actions and recovery hints", run: () => { setTranscriptOpen(true); onClose(); } },
      { label: "Refresh Repository", detail: "Invalidate live Git data", disabled, run: () => void invalidateGitState(queryClient, activeRepoPath) },
      { label: "Fetch Remotes", detail: "git fetch", disabled: disabled || isRemoteOperationPending, run: () => { fetchMutation.mutate(undefined); onClose(); } },
      { label: "Pull Current Branch", detail: "git pull", disabled: disabled || isRemoteOperationPending, run: () => { pullMutation.mutate({}); onClose(); } },
      { label: "Push Current Branch", detail: "git push", disabled: disabled || isRemoteOperationPending, run: () => { pushMutation.mutate({}); onClose(); } },
      { label: "Toggle Diff Mode", detail: diffMode === "split" ? "Switch to unified diff" : "Switch to split diff", disabled, run: () => setDiffMode(diffMode === "split" ? "unified" : "split") },
    ];
  }, [activeRepoPath, diffMode, fetchMutation, isRemoteOperationPending, pullMutation, pushMutation, queryClient, setActiveView, setDiffMode, setTranscriptOpen, onClose]);

  const runCommand = useCallback(
    (command: CommandItem) => {
      if (command.disabled) return;
      command.run();
    },
    [],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        if (open) {
          onClose();
        }
      }
      if (event.key === "Escape" && open) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Command
      label="Command Palette"
      shouldFilter
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]"
    >
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
        <div className="flex items-center border-b border-[var(--color-border-muted)] px-4">
          <Command.Input
            autoFocus
            placeholder="Type a command or search..."
            className="h-12 w-full bg-transparent text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
          />
        </div>
        <Command.List className="max-h-[320px] overflow-y-auto p-2">
          <Command.Empty className="px-4 py-8 text-center text-xs text-[var(--color-text-muted)]">
            No commands found.
          </Command.Empty>
          {commandItems.map((cmd) => (
            <Command.Item
              key={cmd.label}
              value={`${cmd.label} ${cmd.detail}`}
              disabled={cmd.disabled}
              onSelect={() => runCommand(cmd)}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-[var(--color-text-primary)] aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-selected:bg-[var(--color-bg-hover)]"
            >
              <span className="truncate">{cmd.label}</span>
              <span className="truncate text-xs text-[var(--color-text-muted)]">{cmd.detail}</span>
            </Command.Item>
          ))}
        </Command.List>
        <div className="border-t border-[var(--color-border-muted)] px-4 py-2 text-[10px] text-[var(--color-text-muted)]">
          <span>Type to filter · Esc to close · Enter to select</span>
        </div>
      </div>
    </Command>
  );
}
