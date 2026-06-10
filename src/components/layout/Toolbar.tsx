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
import { useAppStore } from "../../stores/app-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries, invalidateGitState } from "../../lib/git-data";
import { useNoticeStore } from "../../stores/notice-store";
import type { Branch, FavoriteRepo, RecentRepo } from "../../types/git";
import type { CheckoutBranchStrategy } from "../../lib/tauri-api";
import { BranchSwitchDialog } from "../branches/BranchSwitchDialog";
import { BranchContextMenu } from "../branches/BranchContextMenu";

interface ToolbarProps {
  repoName?: string;
  currentBranch?: string;
  isClean?: boolean;
}

type RepositorySwitchItem = {
  path: string;
  name: string;
  isFavorite: boolean;
};

export function Toolbar({ repoName, currentBranch, isClean }: ToolbarProps) {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setActiveRepoPath = useAppStore((s) => s.setActiveRepoPath);
  const queryClient = useQueryClient();
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [repoMenuOpen, setRepoMenuOpen] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");
  const [commandValue, setCommandValue] = useState("");
  const [branchToSwitch, setBranchToSwitch] = useState<Branch | null>(null);
  const [contextBranch, setContextBranch] = useState<{ branch: Branch; x: number; y: number } | null>(null);
  const notices = useNoticeStore((s) => s.notices);
  const clearFinishedNotices = useNoticeStore((s) => s.clearFinished);
  const branchMenuRef = useRef<HTMLDivElement>(null);
  const repoMenuRef = useRef<HTMLDivElement>(null);
  const { data: branches } = useQuery(gitQueries.branches(activeRepoPath, branchMenuOpen));
  const { data: recentRepos } = useQuery(gitQueries.recentRepositories());
  const { data: favoriteRepos } = useQuery(gitQueries.favoriteRepositories());
  const checkoutBranch = useMutation(gitMutations.checkoutBranch(queryClient, activeRepoPath));
  const createBranch = useMutation(gitMutations.createBranch(queryClient, activeRepoPath));
  const openRepository = useMutation(gitMutations.openRepository(queryClient, setActiveRepoPath));
  const setFavorite = useMutation(gitMutations.setRepositoryFavorite(queryClient));
  const fetchMutation = useMutation(gitMutations.fetch(queryClient, activeRepoPath));
  const pullMutation = useMutation(gitMutations.pull(queryClient, activeRepoPath));
  const pushMutation = useMutation(gitMutations.push(queryClient, activeRepoPath));

  const localBranches = branches?.filter((branch) => !branch.isRemote) ?? [];
  const remoteBranches = branches?.filter((branch) => branch.isRemote) ?? [];
  const workingTreeState = isClean ? "Clean" : "Uncommitted changes";
  const isRemoteOperationPending = fetchMutation.isPending || pullMutation.isPending || pushMutation.isPending;
  const pendingNoticeCount = notices.filter((notice) => notice.status === "pending").length;
  const activeNotice = notices.find((notice) => notice.status === "pending") ?? notices[0] ?? null;

  const repoSwitchItems = useMemo(
    () => buildRepositorySwitchItems(recentRepos ?? [], favoriteRepos ?? [], repoSearch),
    [favoriteRepos, recentRepos, repoSearch],
  );

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
            className="flex h-7 max-w-[240px] items-center gap-1.5 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] px-2 text-[13px] font-semibold text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-hover)]"
            title="Switch repository"
          >
            <FolderGit2 className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
            <span className="truncate">{repoName ?? "GitEye"}</span>
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
              title="Checkout branch"
            >
              <GitBranch className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
              <span className="truncate">{currentBranch}</span>
              <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", branchMenuOpen && "rotate-180")} />
            </button>

            {branchMenuOpen && (
              <div className="absolute left-0 top-full z-50 mt-1.5 max-h-80 w-80 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] py-1 shadow-[var(--shadow-elevated)]">
                <div className="flex items-center justify-between px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  <span>Local Branches</span>
                  <span>{localBranches.length}</span>
                </div>
                {localBranches.map((branch) => (
                  <button
                    key={branch.name}
                    onClick={() => requestBranchSwitch(branch)}
                    onContextMenu={(event) => openBranchContextMenu(event, branch)}
                    className={cn(
                      "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] transition-colors",
                      branch.isCurrent
                        ? "bg-[var(--color-bg-selected)] text-white"
                        : "text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]",
                    )}
                  >
                    <GitBranch className={cn("h-4 w-4 shrink-0", branch.isCurrent ? "text-white" : "text-[var(--color-text-muted)]")} />
                    <span className="truncate">{branch.shortName}</span>
                    {branch.isCurrent && <span className="ml-auto text-[11px] opacity-80">current</span>}
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
            placeholder="Search files, branches, commands..."
            className="h-7 w-full rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] pl-8 pr-2.5 text-[13px] text-[var(--color-text-primary)] shadow-[var(--shadow-panel)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
          />
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
        <ToolbarButton icon={<Cloud className="h-4 w-4" />} title="Remote status" />
        <ToolbarButton
          icon={
            <span className="relative">
              <Bell className="h-4 w-4" />
              {pendingNoticeCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-[var(--color-accent)] px-0.5 text-[8px] font-bold leading-none text-white">
                  {pendingNoticeCount}
                </span>
              )}
            </span>
          }
          title={pendingNoticeCount > 0 ? `${pendingNoticeCount} action${pendingNoticeCount === 1 ? "" : "s"} running` : "Clear completed notices"}
          onClick={clearFinishedNotices}
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
        onCreateFromBranch={createBranchFrom}
        onClose={() => setContextBranch(null)}
      />
    </div>
  );
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
