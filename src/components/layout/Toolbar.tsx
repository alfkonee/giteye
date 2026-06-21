import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { ReactNode } from "react";
import {
  Bell,
  ChevronDown,
  Circle,
  Cloud,
  Download,
  FolderGit2,
  GitBranch,
  GitMerge,
  Home,
  RefreshCw,
  Search,
  Settings,
  Star,
  Upload,
  Zap,
} from "lucide-react";
import { cn } from "../../lib/cn";
import { formatDryRunPreview } from "../../lib/git-preview";
import { useAppStore } from "../../stores/app-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries, invalidateGitState } from "../../lib/git-data";
import { useNoticeStore } from "../../stores/notice-store";
import type { Branch, FavoriteRepo, RecentRepo, RepositoryParent } from "../../types/git";
import type { CheckoutBranchStrategy } from "../../lib/tauri-api";
import { BranchSwitchDialog } from "../branches/BranchSwitchDialog";
import { BranchContextMenu } from "../branches/BranchContextMenu";

interface ToolbarProps {
  repoName?: string;
  currentBranch?: string;
  isClean?: boolean;
  submoduleParent?: RepositoryParent | null;
}

type RepositorySwitchItem = {
  path: string;
  name: string;
  isFavorite: boolean;
};

type CommandItem = {
  label: string;
  detail: string;
  disabled?: boolean;
  run: () => void;
};

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


export function Toolbar({ repoName, currentBranch, isClean, submoduleParent }: ToolbarProps) {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setActiveRepoPath = useAppStore((s) => s.setActiveRepoPath);
  const diffMode = useAppStore((s) => s.diffMode);
  const setDiffMode = useAppStore((s) => s.setDiffMode);
  const queryClient = useQueryClient();
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [repoMenuOpen, setRepoMenuOpen] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");
  const [commandValue, setCommandValue] = useState("");
  const [branchToSwitch, setBranchToSwitch] = useState<Branch | null>(null);
  const [contextBranch, setContextBranch] = useState<{ branch: Branch; x: number; y: number } | null>(null);
  const notices = useNoticeStore((s) => s.notices);
  const operationTranscript = useNoticeStore((s) => s.operationTranscript);
  const transcriptOpen = useNoticeStore((s) => s.transcriptOpen);
  const toggleTranscriptOpen = useNoticeStore((s) => s.toggleTranscriptOpen);
  const setTranscriptOpen = useNoticeStore((s) => s.setTranscriptOpen);
  const branchMenuRef = useRef<HTMLDivElement>(null);
  const repoMenuRef = useRef<HTMLDivElement>(null);
  const { data: branches } = useQuery(gitQueries.branches(activeRepoPath, branchMenuOpen));
  const { data: recentRepos } = useQuery(gitQueries.recentRepositories());
  const { data: favoriteRepos } = useQuery(gitQueries.favoriteRepositories());
  const checkoutBranch = useMutation(gitMutations.checkoutBranch(queryClient, activeRepoPath));
  const createBranch = useMutation(gitMutations.createBranch(queryClient, activeRepoPath));
  const fastForwardBranchMutation = useMutation(gitMutations.fastForwardBranch(queryClient, activeRepoPath));
  const mergeBranchMutation = useMutation(gitMutations.mergeBranch(queryClient, activeRepoPath));
  const deleteBranchMutation = useMutation(gitMutations.deleteBranch(queryClient, activeRepoPath));
  const renameBranchMutation = useMutation(gitMutations.renameBranch(queryClient, activeRepoPath));
  const upstreamMutation = useMutation(gitMutations.setBranchUpstream(queryClient, activeRepoPath));
  const pushBranchMutation = useMutation(gitMutations.pushBranch(queryClient, activeRepoPath));
  const pushBranchDryRunMutation = useMutation(gitMutations.pushBranchDryRun(activeRepoPath));
  const deleteRemoteBranchMutation = useMutation(gitMutations.deleteRemoteBranch(queryClient, activeRepoPath));
  const deleteRemoteBranchDryRunMutation = useMutation(gitMutations.deleteRemoteBranchDryRun(activeRepoPath));
  const openRepository = useMutation(gitMutations.openRepository(queryClient, setActiveRepoPath));
  const setFavorite = useMutation(gitMutations.setRepositoryFavorite(queryClient));
  const fetchMutation = useMutation(gitMutations.fetch(queryClient, activeRepoPath));
  const pullMutation = useMutation(gitMutations.pull(queryClient, activeRepoPath));
  const pushMutation = useMutation(gitMutations.push(queryClient, activeRepoPath));

  const localBranches = branches?.filter((branch) => !branch.isRemote) ?? [];
  const remoteBranches = branches?.filter((branch) => branch.isRemote) ?? [];
  const workingTreeState = isClean ? "Clean" : "Uncommitted changes";
  const remoteNames = remoteNamesFromBranches(branches ?? []);
  const isRemoteOperationPending =
    fetchMutation.isPending ||
    pullMutation.isPending ||
    pushMutation.isPending ||
    pushBranchMutation.isPending ||
    pushBranchDryRunMutation.isPending ||
    deleteRemoteBranchMutation.isPending ||
    deleteRemoteBranchDryRunMutation.isPending;
  const pendingNoticeCount = notices.filter((notice) => notice.status === "pending").length;
  const latestTranscriptEntry = operationTranscript[0] ?? null;
  const activeNotice = notices.find((notice) => notice.status === "pending") ?? notices[0] ?? latestTranscriptEntry;
  const transcriptBadgeCount = pendingNoticeCount || Math.min(operationTranscript.length, 99);

  const repoSwitchItems = useMemo(
    () => buildRepositorySwitchItems(recentRepos ?? [], favoriteRepos ?? [], repoSearch),
    [favoriteRepos, recentRepos, repoSearch],
  );

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
      { label: "Open Rebase Resolver", detail: "Inspect rebase todo and conflicts", disabled, run: navigate("rebase-conflicts") },
      { label: "Open Settings", detail: "Application settings", run: navigate("settings") },
      { label: "Open Operation Transcript", detail: "Show completed Git actions and recovery hints", run: () => setTranscriptOpen(true) },
      { label: "Refresh Repository", detail: "Invalidate live Git data", disabled, run: () => void invalidateGitState(queryClient, activeRepoPath) },
      { label: "Fetch Remotes", detail: "git fetch", disabled: disabled || isRemoteOperationPending, run: () => fetchMutation.mutate(undefined) },
      { label: "Pull Current Branch", detail: "git pull", disabled: disabled || isRemoteOperationPending, run: () => pullMutation.mutate({}) },
      { label: "Push Current Branch", detail: "git push", disabled: disabled || isRemoteOperationPending, run: () => pushMutation.mutate({}) },
      { label: "Toggle Diff Mode", detail: diffMode === "split" ? "Switch to unified diff" : "Switch to split diff", disabled, run: () => setDiffMode(diffMode === "split" ? "unified" : "split") },
    ];
  }, [activeRepoPath, diffMode, fetchMutation, isRemoteOperationPending, pullMutation, pushMutation, queryClient, setActiveView, setDiffMode, setTranscriptOpen]);

  const visibleCommands = useMemo(() => {
    const query = commandValue.trim().toLowerCase();
    if (!query) return [];
    return commandItems
      .filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(query))
      .slice(0, 6);
  }, [commandItems, commandValue]);

  const runCommand = (command: CommandItem) => {
    if (command.disabled) return;
    command.run();
    setCommandValue("");
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (branchMenuRef.current && !branchMenuRef.current.contains(target)) {
        setBranchMenuOpen(false);
      }
      if (repoMenuRef.current && !repoMenuRef.current.contains(target)) {
        setRepoMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSync = () => {
    if (!activeRepoPath || isRemoteOperationPending) return;

    pullMutation.mutate(
      {},
      {
        onSuccess: () => {
          pushMutation.mutate({});
        },
      },
    );
  };

  const openRepo = (path: string) => {
    openRepository.mutate(path, {
      onSuccess: () => {
        setRepoMenuOpen(false);
        setRepoSearch("");
      },
    });
  };

  const requestBranchSwitch = (branch: Branch) => {
    if (branch.isCurrent) return;
    setBranchToSwitch(branch);
    setBranchMenuOpen(false);
  };

  const confirmBranchSwitch = (strategy: CheckoutBranchStrategy) => {
    if (!branchToSwitch) return;
    checkoutBranch.mutate(
      { branchName: branchToSwitch.shortName, strategy },
      { onSuccess: () => setBranchToSwitch(null) },
    );
  };

  const openBranchContextMenu = (event: ReactMouseEvent, branch: Branch) => {
    event.preventDefault();
    setContextBranch({ branch, x: event.clientX, y: event.clientY });
  };

  const createBranchFrom = (branch: Branch) => {
    const name = window.prompt(`New branch name from ${branch.shortName}`);
    const trimmedName = name?.trim();
    if (!trimmedName) return;
    createBranch.mutate({ name: trimmedName, checkout: false, startPoint: branch.shortName });
  };

  const fastForwardBranch = (branch: Branch) => {
    if (!branch.upstream) return;
    fastForwardBranchMutation.mutate({ branchName: branch.shortName, upstream: branch.upstream });
  };
  const mergeBranch = (branch: Branch) => {
    if (branch.isCurrent) return;
    if (!window.confirm(`Merge "${branch.shortName}" into the current branch? Your working tree must be clean.`)) return;
    mergeBranchMutation.mutate(branch.shortName);
  };

  const deleteBranch = (branch: Branch) => {
    if (branch.isCurrent || branch.isRemote) return;
    if (!window.confirm(`Delete local branch "${branch.shortName}"?`)) return;
    deleteBranchMutation.mutate(branch.shortName);
  };

  const renameBranch = (branch: Branch) => {
    if (branch.isRemote) return;
    const newName = window.prompt(`Rename "${branch.shortName}" to`, branch.shortName)?.trim();
    if (!newName || newName === branch.shortName) return;
    renameBranchMutation.mutate({ oldName: branch.shortName, newName });
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


  return (
    <div className="giteye-toolbar flex h-11 shrink-0 select-none items-center gap-1.5 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2.5 shadow-[var(--shadow-panel)]">
      <div className="flex min-w-0 shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => setActiveRepoPath(null)}
          className="flex h-7 w-8 items-center justify-center rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="Repo Hub"
        >
          <Home className="h-4 w-4" />
        </button>

        <div className="relative" ref={repoMenuRef}>
          <button
            type="button"
            onClick={() => setRepoMenuOpen((open) => !open)}
            className="flex h-7 max-w-[560px] items-center gap-1.5 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] px-2 text-[13px] font-semibold text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-hover)]"
            title={
              submoduleParent
                ? `${repoName ?? "Repository"} is submodule ${submoduleParent.submodulePath} of parent repository ${submoduleParent.name} (${submoduleParent.path})`
                : "Switch repository"
            }
          >
            <FolderGit2 className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
            <span className="max-w-[180px] shrink-0 truncate">{repoName ?? "GitEye"}</span>
            {submoduleParent ? (
              <span
                className="flex min-w-0 max-w-[330px] items-center gap-1 rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)]"
                title={`Parent repo: ${submoduleParent.name} (${submoduleParent.path}); submodule path: ${submoduleParent.submodulePath}`}
              >
                <span className="shrink-0 uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Parent repo</span>
                <span className="min-w-0 truncate text-[var(--color-text-primary)]">{submoduleParent.name}</span>
                <span className="shrink-0 text-[var(--color-text-muted)]">→</span>
                <span className="shrink-0 uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Submodule</span>
                <span className="min-w-0 truncate">{submoduleParent.submodulePath}</span>
              </span>
            ) : null}
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform", repoMenuOpen && "rotate-180")} />
          </button>

          {repoMenuOpen && (
            <div className="absolute left-0 top-full z-50 mt-1.5 w-[360px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-2 shadow-[var(--shadow-elevated)]">
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  value={repoSearch}
                  onChange={(event) => setRepoSearch(event.target.value)}
                  placeholder="Search recent and favorite repositories…"
                  className="h-8 w-full rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] pl-7 pr-2 text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {repoSwitchItems.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-[var(--color-text-muted)]">No repositories match your search.</div>
                ) : (
                  repoSwitchItems.map((repo) => (
                    <button
                      key={repo.path}
                      type="button"
                      onClick={() => openRepo(repo.path)}
                      className={cn(
                        "grid w-full grid-cols-[minmax(0,1fr)_28px] items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--color-bg-hover)]",
                        activeRepoPath === repo.path && "bg-[var(--color-bg-selected)]/30",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-[var(--color-text-primary)]">{repo.name}</span>
                        <span className="block truncate text-[11px] text-[var(--color-text-secondary)]">{repo.path}</span>
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        title={repo.isFavorite ? "Remove from favorites" : "Add to favorites"}
                        onClick={(event) => {
                          event.stopPropagation();
                          setFavorite.mutate({ repoPath: repo.path, name: repo.name, favorite: !repo.isFavorite });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            setFavorite.mutate({ repoPath: repo.path, name: repo.name, favorite: !repo.isFavorite });
                          }
                        }}
                        className="rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-warning)]"
                      >
                        <Star className={cn("h-4 w-4", repo.isFavorite && "fill-current text-[var(--color-warning)]")} />
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {currentBranch && (
          <div className="relative" ref={branchMenuRef}>
            <button
              onClick={() => setBranchMenuOpen((open) => !open)}
              className="flex h-7 max-w-[200px] items-center gap-1.5 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] px-2 text-[13px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]"
              title="Checkout branch; right-click branch rows for rename, tracking, push, and delete actions"
            >
              <GitBranch className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
              <span className="truncate">{currentBranch}</span>
              <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", branchMenuOpen && "rotate-180")} />
            </button>

            {branchMenuOpen && (
              <div className="absolute left-0 top-full z-50 mt-1.5 max-h-80 w-80 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] py-1 shadow-[var(--shadow-elevated)]">
                <div className="border-b border-[var(--color-border-muted)] px-2.5 py-1.5 text-[11px] text-[var(--color-text-muted)]">
                  Right-click any branch for rename, tracking, push, and delete tools.
                </div>
                <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  <span>Local Branches</span>
                  <span>{localBranches.length}</span>
                </div>
                {localBranches.map((branch) => (
                  <button
                    key={branch.name}
                    onClick={() => requestBranchSwitch(branch)}
                    onContextMenu={(event) => openBranchContextMenu(event, branch)}
                    title={branch.isCurrent ? "Current branch · right-click for branch actions" : "Click to checkout · right-click for branch actions"}
                    className={cn(
                      "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] transition-colors",
                      branch.isCurrent
                        ? "bg-[var(--color-bg-selected)] text-white"
                        : "text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]",
                    )}
                  >
                    <GitBranch className={cn("h-4 w-4 shrink-0", branch.isCurrent ? "text-white" : "text-[var(--color-text-muted)]")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{branch.shortName}</span>
                      {branch.upstream && (
                        <span className={cn("block truncate text-[10px]", branch.isCurrent ? "text-white/75" : "text-[var(--color-text-muted)]")}>
                          {trackingLabel(branch)}
                        </span>
                      )}
                    </span>
                    {branch.isCurrent && <span className="text-[11px] opacity-80">current</span>}
                  </button>
                ))}
                {remoteBranches.length > 0 && (
                  <>
                    <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      <span>Remote Branches</span>
                      <span>{remoteBranches.length}</span>
                    </div>
                    {remoteBranches.map((branch) => (
                      <button
                        key={branch.name}
                        onClick={() => requestBranchSwitch(branch)}
                        onContextMenu={(event) => openBranchContextMenu(event, branch)}
                        title="Click to checkout remote branch · right-click for remote branch actions"
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-hover)]"
                      >
                        <GitBranch className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
                        <span className="truncate">{branch.shortName}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mx-0.5 h-6 w-px shrink-0 bg-[var(--color-border-muted)]" />

      <div className="flex shrink-0 items-center gap-0.5">
        <ToolbarButton
          icon={<Download className="h-4 w-4" />}
          label="Fetch"
          title="Fetch from remote"
          disabled={!activeRepoPath || isRemoteOperationPending}
          onClick={() => fetchMutation.mutate(undefined)}
        />
        <ToolbarButton
          icon={<GitMerge className="h-4 w-4" />}
          label="Pull"
          title="Pull from remote"
          disabled={!activeRepoPath || isRemoteOperationPending}
          onClick={() => pullMutation.mutate({})}
        />
        <ToolbarButton
          icon={<Upload className="h-4 w-4" />}
          label="Push"
          title="Push to remote"
          disabled={!activeRepoPath || isRemoteOperationPending}
          onClick={() => pushMutation.mutate({})}
        />
        <ToolbarButton
          icon={<Zap className="h-4 w-4" />}
          label="Sync"
          title="Pull then push"
          disabled={!activeRepoPath || isRemoteOperationPending}
          onClick={handleSync}
        />
      </div>

      <div className="flex min-w-[160px] flex-1 justify-center px-1">
        <div className="relative w-full max-w-xl">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={commandValue}
            onChange={(event) => setCommandValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && visibleCommands[0]) {
                event.preventDefault();
                runCommand(visibleCommands[0]);
              }
              if (event.key === "Escape") {
                setCommandValue("");
              }
            }}
            placeholder="Search files, branches, commands..."
            className="h-7 w-full rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] pl-8 pr-2.5 text-[13px] text-[var(--color-text-primary)] shadow-[var(--shadow-panel)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
          />
          {visibleCommands.length > 0 && (
            <div className="absolute left-0 right-0 top-9 z-50 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
              {visibleCommands.map((command) => (
                <button
                  key={command.label}
                  type="button"
                  disabled={command.disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => runCommand(command)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="truncate">{command.label}</span>
                  <span className="truncate text-xs text-[var(--color-text-muted)]">{command.detail}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {activeNotice && (
        <div
          className={cn(
            "hidden max-w-[240px] items-center gap-1.5 truncate rounded-md border px-2 py-1 text-[11px] xl:flex",
            activeNotice.status === "error"
              ? "border-[var(--color-danger)]/30 text-[var(--color-danger)]"
              : activeNotice.status === "success"
                ? "border-[var(--color-success)]/30 text-[var(--color-success)]"
                : "border-[var(--color-accent)]/30 text-[var(--color-accent)]",
          )}
          title={activeNotice.detail}
        >
          <Circle className={cn("h-2 w-2 shrink-0 fill-current", activeNotice.status === "pending" && "animate-pulse")} />
          <span className="truncate">{activeNotice.title}</span>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-0.5">
        {isClean !== undefined && currentBranch && (
          <div className={cn("hidden h-7 items-center gap-1.5 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] px-2 text-[12px] xl:flex", isClean ? "text-[var(--color-success)]" : "text-[var(--color-warning)]")}>
            <Circle className="h-2.5 w-2.5 fill-current" />
            <span>{workingTreeState}</span>
          </div>
        )}
        <ToolbarButton
          icon={<RefreshCw className="h-4 w-4" />}
          title="Refresh"
          onClick={() => void invalidateGitState(queryClient, activeRepoPath)}
          disabled={!activeRepoPath}
        />
        <ToolbarButton icon={<Cloud className="h-4 w-4" />} title="Remote status" onClick={() => setActiveView("remotes")} disabled={!activeRepoPath} />
        <ToolbarButton
          icon={<GitMerge className="h-4 w-4" />}
          label={diffMode === "split" ? "Split" : "Unified"}
          title="Toggle diff layout"
          onClick={() => setDiffMode(diffMode === "split" ? "unified" : "split")}
          disabled={!activeRepoPath}
        />
        <ToolbarButton
          icon={
            <span className="relative">
              <Bell className="h-4 w-4" />
              {transcriptBadgeCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-[var(--color-accent)] px-0.5 text-[8px] font-bold leading-none text-white">
                  {transcriptBadgeCount}
                </span>
              )}
            </span>
          }
          title={pendingNoticeCount > 0 ? `${pendingNoticeCount} action${pendingNoticeCount === 1 ? "" : "s"} running · open operation transcript` : transcriptOpen ? "Hide operation transcript" : "Show operation transcript"}
          onClick={toggleTranscriptOpen}
        />
        <ToolbarButton
          icon={<Settings className="h-4 w-4" />}
          title="Settings"
          onClick={() => setActiveView("settings")}
        />
      </div>
      <BranchSwitchDialog
        branch={branchToSwitch}
        isClean={isClean ?? true}
        isPending={checkoutBranch.isPending}
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
        onDelete={deleteBranch}
        onClose={() => setContextBranch(null)}
      />
    </div>
  );
}
function trackingLabel(branch: Branch) {
  const divergence = [
    branch.ahead ? `${branch.ahead} ahead` : null,
    branch.behind ? `${branch.behind} behind` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return divergence ? `${branch.upstream} · ${divergence}` : `tracks ${branch.upstream}`;
}


function buildRepositorySwitchItems(
  recentRepos: RecentRepo[],
  favoriteRepos: FavoriteRepo[],
  search: string,
): RepositorySwitchItem[] {
  const favoritePaths = new Set(favoriteRepos.map((repo) => repo.path));
  const merged = new Map<string, RepositorySwitchItem>();

  for (const repo of favoriteRepos) {
    merged.set(repo.path, { path: repo.path, name: repo.name, isFavorite: true });
  }

  for (const repo of recentRepos) {
    if (!merged.has(repo.path)) {
      merged.set(repo.path, { path: repo.path, name: repo.name, isFavorite: favoritePaths.has(repo.path) });
    }
  }

  const query = search.trim().toLowerCase();
  const items = Array.from(merged.values());
  if (!query) return items;

  return items.filter((repo) => repo.name.toLowerCase().includes(query) || repo.path.toLowerCase().includes(query));
}

function ToolbarButton({
  icon,
  label,
  title,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label?: string;
  title?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title ?? label}
      disabled={disabled}
      className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
      {label && <span className="hidden lg:inline">{label}</span>}
    </button>
  );
}
