import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  CheckCircle2,
  Clock,
  Code2,
  FolderOpen,
  GitBranch,
  GitFork,
  History,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
} from "lucide-react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { useAppStore } from "../../stores/app-store";
import { useNoticeStore } from "../../stores/notice-store";
import { cn } from "../../lib/cn";
import { formatRelativeTime } from "../../lib/format";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { appDialog } from "../common/AppDialogProvider";
import { getShortcutBinding } from "../../lib/shortcuts";
import { AppChrome } from "../layout/AppChrome";
import { AppSidebar, useAppChromeSlots } from "../layout/AppSidebar";
import { SettingsPlaceholder } from "../settings/SettingsPlaceholder";
import { Input } from "../ui/Input";

type RepositoryCard = {
  name: string;
  path: string;
  lastOpenedAt?: string;
  favoritedAt?: string;
  parentPath?: string | null;
  parentName?: string | null;
  relationshipKind?: "submodule" | "worktree" | null;
  currentBranch?: string | null;
};

function groupRelatedRepositories<T extends RepositoryCard>(repositories: T[]) {
  const repositoriesByPath = new Map(repositories.map((repository) => [repository.path, repository]));
  const childrenByParent = new Map<string, T[]>();
  for (const repository of repositories) {
    if (!repository.parentPath) continue;
    const children = childrenByParent.get(repository.parentPath) ?? [];
    children.push(repository);
    childrenByParent.set(repository.parentPath, children);
  }

  const grouped: T[] = [];
  const included = new Set<string>();

  const appendRepository = (repository: T) => {
    if (included.has(repository.path)) return;
    grouped.push(repository);
    included.add(repository.path);
    for (const child of childrenByParent.get(repository.path) ?? []) {
      appendRepository(child);
    }
  };

  for (const repository of repositories) {
    if (repository.parentPath && repositoriesByPath.has(repository.parentPath)) continue;
    appendRepository(repository);
  }

  // Cyclic or malformed metadata should not make an entry disappear.
  for (const repository of repositories) {
    appendRepository(repository);
  }
  return grouped;
}

export function RepositoryWelcome() {
  const [path, setPath] = useState("");
  const [repoSearch, setRepoSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const handledStalePathsRef = useRef(new Set<string>());
  const stalePromptBusyRef = useRef(false);
  const [showOpenPanel, setShowOpenPanel] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showAllFavorites, setShowAllFavorites] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const queryClient = useQueryClient();
  const setActiveRepoPath = useAppStore((s) => s.setActiveRepoPath);
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const route = useAppStore((s) => s.route);
  const openRepoPaths = useAppStore((s) => s.openRepoPaths);
  const operationTranscript = useNoticeStore((s) => s.operationTranscript);
  const openMutation = useMutation(gitMutations.openRepository(queryClient, setActiveRepoPath));
  const initMutation = useMutation(gitMutations.initRepository(queryClient, setActiveRepoPath));
  const cloneMutation = useMutation(gitMutations.cloneRepository(queryClient, setActiveRepoPath));
  const { data: recents, isLoading: recentsLoading } = useQuery(gitQueries.recentRepositories());
  const { data: favorites, isLoading: favoritesLoading } = useQuery(gitQueries.favoriteRepositories());
  const favoriteMutation = useMutation(gitMutations.setRepositoryFavorite(queryClient));
  const removeRecentMutation = useMutation(gitMutations.removeRecentRepository(queryClient));
  const { data: activeRepoInfo } = useQuery(gitQueries.repositoryInfo(activeRepoPath));
  const { data: toolchain } = useQuery(gitQueries.toolchainStatus());
  const openRepoInfos = useQueries({ queries: openRepoPaths.map((repoPath) => gitQueries.repositoryInfo(repoPath)) });
  const openRemotes = useQueries({ queries: openRepoPaths.map((repoPath) => gitQueries.remotes(repoPath)) });
  const hubScrollerRef = useRef<HTMLDivElement | null>(null);
  const [showAllRecents, setShowAllRecents] = useState(false);
  const toggleShowAllRecents = () => {
    const collapsing = showAllRecents;
    setShowAllRecents(!showAllRecents);
    if (collapsing) {
      requestAnimationFrame(() => {
        if (hubScrollerRef.current) hubScrollerRef.current.scrollTop = 0;
      });
    }
  };

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const repoSearchLower = repoSearch.trim().toLowerCase();
  const allFavoritePaths = new Set((favorites ?? []).map((repo) => repo.path));
  const recentRepos = (recents ?? []).filter(
    (repo) => !repoSearchLower || repo.name.toLowerCase().includes(repoSearchLower) || repo.path.toLowerCase().includes(repoSearchLower),
  );
  const filteredRecentRepos = favoritesOnly ? recentRepos.filter((repo) => allFavoritePaths.has(repo.path)) : recentRepos;
  const groupedRecentRepos = groupRelatedRepositories(filteredRecentRepos);
  const displayedRecentRepos = showAllRecents ? groupedRecentRepos : groupedRecentRepos.slice(0, 5);
  const favoriteRepos = groupRelatedRepositories((favorites ?? []).filter(
    (repo) => !repoSearchLower || repo.name.toLowerCase().includes(repoSearchLower) || repo.path.toLowerCase().includes(repoSearchLower),
  ));
  const favoritePaths = new Set(favoriteRepos.map((repo) => repo.path));
  const uncommittedCount = openRepoInfos.filter((result) => result.data && result.data.isClean === false).length;
  const totalRemotes = openRemotes.reduce((sum, result) => sum + (result.data?.length ?? 0), 0);
  const activityPaths = useMemo(
    () => (recents ?? []).filter((repo) => !repo.isStale).slice(0, 10).map((repo) => repo.path),
    [recents],
  );
  const { data: hubActivity } = useQuery(gitQueries.hubActivity(activityPaths));
  const commitsThisWeek = (hubActivity ?? []).reduce((sum, entry) => sum + entry.commitsThisWeek, 0);

  const handleOpen = () => {
    const trimmed = path.trim();
    if (trimmed) {
      openMutation.mutate(trimmed);
    }
  };

  const handleBrowse = async () => {
    const selected = await open({ directory: true, multiple: false, title: "Open Git Repository" });
    if (selected && typeof selected === "string") {
      setPath(selected);
      openMutation.mutate(selected);
    }
  };

  const handleInitRepository = async () => {
    const selected = await open({ directory: true, multiple: false, title: "Choose folder for new Git repository" });
    if (selected && typeof selected === "string") {
      setPath(selected);
      initMutation.mutate(selected);
    }
  };

  const handleCloneRepository = async () => {
    const url = await appDialog.prompt("Enter the repository URL to clone.", "", "Clone repository");
    if (!url?.trim()) return;

    const destination = await appDialog.prompt(
      "Enter the destination path for the cloned repository.",
      "",
      "Clone destination",
    );
    if (!destination?.trim()) return;

    cloneMutation.mutate({ url: url.trim(), destination: destination.trim() });
  };

  const handleSetFavorite = (repo: RepositoryCard, favorite: boolean) => {
    favoriteMutation.mutate({ repoPath: repo.path, name: repo.name, favorite });
  };

  const actionPending = openMutation.isPending || initMutation.isPending || cloneMutation.isPending;
  const actionError = openMutation.error ?? initMutation.error ?? cloneMutation.error;
  const globalView = route.area === "global" ? route.view : "repo-hub";

  useEffect(() => {
    if (globalView !== "repo-hub") return;
    // A removal round invalidates `recents` after every entry, re-running this effect
    // with a shrinking stale list; without this guard each round would re-prompt.
    if (stalePromptBusyRef.current) return;

    const currentStalePaths = new Set((recents ?? []).filter((repo) => repo.isStale).map((repo) => repo.path));
    for (const handledPath of handledStalePathsRef.current) {
      // Let an entry prompt again if it goes stale after being removed or dismissed.
      if (!currentStalePaths.has(handledPath)) handledStalePathsRef.current.delete(handledPath);
    }

    const staleRepositories = (recents ?? []).filter(
      (repo) => repo.isStale && !handledStalePathsRef.current.has(repo.path),
    );
    if (staleRepositories.length === 0) return;

    for (const repository of staleRepositories) {
      handledStalePathsRef.current.add(repository.path);
    }
    const preview = staleRepositories.slice(0, 5).map((repo) => `• ${repo.name}: ${repo.path}`).join("\n");
    const remaining = staleRepositories.length > 5 ? `\n…and ${staleRepositories.length - 5} more` : "";
    stalePromptBusyRef.current = true;
    void (async () => {
      try {
        const confirmed = await appDialog.confirm(
          `GitEye found ${staleRepositories.length} recent ${staleRepositories.length === 1 ? "repository" : "repositories"} that no longer exist at their saved paths:\n\n${preview}${remaining}\n\nRemove ${staleRepositories.length === 1 ? "this stale entry" : "these stale entries"} from Recents?`,
          "Remove stale recent repositories?",
        );
        if (!confirmed) return;
        for (const repository of staleRepositories) {
          await removeRecentMutation.mutateAsync(repository.path);
        }
      } finally {
        stalePromptBusyRef.current = false;
      }
    })();
  }, [globalView, recents, removeRecentMutation]);
  const paletteKeys = getShortcutBinding("command-palette").replace("Mod+", "⌘");
  const errorCount = operationTranscript.filter((entry) => entry.status === "error").length;

  const chrome = useAppChromeSlots();

  return (
    <AppChrome
      title={globalView === "settings" ? "GitEye · Settings" : "GitEye · Repo Hub"}
      subtitle={globalView === "settings" ? "Application preferences" : "No repository open"}
      leading={chrome.leading}
      trailing={chrome.trailing}
    >
      <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
        <AppSidebar />

        <main className="flex min-w-0 flex-1 flex-col">
          <div ref={hubScrollerRef} className="min-h-0 flex-1 overflow-y-auto">
            {globalView === "settings" ? (
              <SettingsPlaceholder />
            ) : (
              <div className="mx-auto flex max-w-[1160px] flex-col gap-6 px-6 py-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-text-primary)]">
                      Repository Hub
                    </h1>
                    <p className="mt-1 text-[12.5px] text-[var(--color-text-muted)]">
                      Manage your local workspaces and connected remote repositories.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowOpenPanel((visible) => !visible)}
                      aria-expanded={showOpenPanel}
                      className="giteye-btn giteye-btn-secondary"
                    >
                      <FolderOpen className="h-4 w-4" />
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleInitRepository()}
                      disabled={actionPending}
                      className="giteye-btn giteye-btn-secondary disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Plus className="h-4 w-4" />
                      {initMutation.isPending ? "Creating…" : "New Repo"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCloneRepository()}
                      disabled={actionPending}
                      className="giteye-btn giteye-btn-primary disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <GitFork className="h-4 w-4" />
                      {cloneMutation.isPending ? "Cloning…" : "Clone"}
                    </button>
                  </div>
                </div>

                {showOpenPanel && (
                  <div className="giteye-card p-3">
                    <div className="flex gap-2">
                      <div className="relative min-w-0 flex-1">
                        <Input
                          value={path}
                          onChange={(event) => setPath(event.target.value)}
                          onKeyDown={(event) => event.key === "Enter" && handleOpen()}
                          placeholder="/path/to/git/repository"
                          leadingIcon={<Search className="h-4 w-4" />}
                          className="h-9 w-full"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleBrowse()}
                        className="giteye-btn giteye-btn-secondary shrink-0"
                        aria-label="Browse for repository folder"
                      >
                        <FolderOpen className="h-4 w-4" />
                        Browse
                      </button>
                      <button
                        type="button"
                        onClick={handleOpen}
                        disabled={!path.trim() || actionPending}
                        className="giteye-btn giteye-btn-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {openMutation.isPending ? "Opening…" : "Open"}
                      </button>
                    </div>
                    {actionError && <p className="mt-2 text-xs text-[var(--color-danger)]">{String(actionError)}</p>}
                  </div>
                )}

                <div className="flex items-center gap-2 border-b border-[var(--color-border-muted)] pb-4">
                  <Input
                    ref={searchInputRef}
                    value={repoSearch}
                    onChange={(event) => setRepoSearch(event.target.value)}
                    placeholder="Filter repositories by name, path, or tag…"
                    leadingIcon={<Search className="h-4 w-4" />}
                    containerClassName="h-9 min-w-0 flex-1"
                    className="h-9 w-full"
                  />
                  <div className="giteye-segmented shrink-0" role="group" aria-label="Favorites layout">
                    <button
                      type="button"
                      data-state={viewMode === "grid" ? "active" : undefined}
                      onClick={() => setViewMode("grid")}
                      aria-label="Card view"
                      title="Card view"
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      data-state={viewMode === "list" ? "active" : undefined}
                      onClick={() => setViewMode("list")}
                      aria-label="List view"
                      title="List view"
                    >
                      <List className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      className="giteye-btn giteye-btn-secondary giteye-btn-icon"
                      aria-expanded={showFilterMenu}
                      aria-label="Filter repositories"
                      title="Filter repositories"
                      onClick={() => setShowFilterMenu((visible) => !visible)}
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </button>
                    {showFilterMenu && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowFilterMenu(false)} />
                        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2 shadow-[var(--shadow-elevated)]">
                          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]">
                            <input
                              type="checkbox"
                              checked={favoritesOnly}
                              onChange={(event) => setFavoritesOnly(event.target.checked)}
                              className="accent-[var(--color-accent)]"
                            />
                            Favorites only
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="giteye-section-title">
                      <Star className="h-4 w-4 text-[var(--color-star)]" />
                      Favorite Repositories
                    </h2>
                    {favoriteRepos.length > 0 && (
                      <button
                        type="button"
                        className="giteye-link"
                        onClick={() => setShowAllFavorites((visible) => !visible)}
                      >
                        {showAllFavorites ? "Show fewer favorites" : "View all favorites"}
                      </button>
                    )}
                  </div>
                  {favoritesLoading ? (
                    <div className="flex h-40 items-center justify-center">
                      <LoadingSpinner size="sm" />
                    </div>
                  ) : favoriteRepos.length === 0 ? (
                    <div className="giteye-card flex h-40 flex-col items-center justify-center px-5 text-center">
                      <Star className="mb-2 h-6 w-6 text-[var(--color-text-muted)]" />
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">No favorites yet</p>
                      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Star a repository to pin it here.</p>
                    </div>
                  ) : viewMode === "grid" ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {(showAllFavorites ? favoriteRepos : favoriteRepos.slice(0, 3)).map((repo) => (
                        <FavoriteCard key={repo.path} repo={repo} onOpen={(repoPath) => openMutation.mutate(repoPath)} onSetFavorite={handleSetFavorite} />
                      ))}
                    </div>
                  ) : (
                    <div className="giteye-card divide-y divide-[var(--color-border-muted)]">
                      {favoriteRepos.map((repo) => (
                        <FavoriteRow key={repo.path} repo={repo} onOpen={(repoPath) => openMutation.mutate(repoPath)} onSetFavorite={handleSetFavorite} />
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="giteye-section-title">
                      <History className="h-4 w-4 text-[var(--color-text-muted)]" />
                      Recent Workspaces
                    </h2>
                    <span className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full border-2 border-[var(--color-success)]" />
                        {openRepoPaths.length} Active
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full border-2 border-[var(--color-star)]" />
                        {uncommittedCount} Uncommitted
                      </span>
                    </span>
                  </div>
                  <div className="giteye-card divide-y divide-[var(--color-border-muted)]">
                    {recentsLoading ? (
                      <div className="flex h-40 items-center justify-center">
                        <LoadingSpinner size="sm" />
                      </div>
                    ) : displayedRecentRepos.length === 0 ? (
                      <div className="flex h-40 flex-col items-center justify-center px-5 text-center">
                        <GitBranch className="mb-2 h-6 w-6 text-[var(--color-text-muted)]" />
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">No recent repositories</p>
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Open a local Git repository to pin it here.</p>
                      </div>
                    ) : (
                      displayedRecentRepos.map((repo) => (
                        <RecentRow
                          key={repo.path}
                          repo={repo}
                          isFavorite={favoritePaths.has(repo.path) || allFavoritePaths.has(repo.path)}
                          onOpen={(repoPath) => openMutation.mutate(repoPath)}
                          onSetFavorite={handleSetFavorite}
                          onRemoveRecent={(repoPath) => removeRecentMutation.mutate(repoPath)}
                        />
                      ))
                    )}
                  </div>
                  {groupedRecentRepos.length > 5 && (
                    <div className="mt-4 flex justify-center">
                      <button
                        type="button"
                        className="giteye-link text-[var(--color-text-secondary)]"
                        onClick={toggleShowAllRecents}
                      >
                        {showAllRecents ? "Show fewer repositories" : "Show more repositories"}
                      </button>
                    </div>
                  )}
                </section>

                <div className="h-px bg-[var(--color-border-muted)]" />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="giteye-stat-card">
                    <span className="giteye-icon-tile" data-tone="accent">
                      <Code2 className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-[var(--color-text-primary)]">System Health</span>
                      <span className="giteye-mono block truncate text-[11px] text-[var(--color-text-muted)]">
                        {toolchain?.git.installed ? `Git v${(toolchain.git.version ?? "").replace(/^git version\s+/i, "") || "unknown"} Installed` : "Git not installed"}
                      </span>
                    </span>
                  </div>
                  <div className="giteye-stat-card">
                    <span className="giteye-icon-tile">
                      <GitFork className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-[var(--color-text-primary)]">Active Remotes</span>
                      <span className="giteye-mono block truncate text-[11px] text-[var(--color-text-muted)]">
                        {totalRemotes} Total Connections
                      </span>
                    </span>
                  </div>
                  <div className="giteye-stat-card">
                    <span className="giteye-icon-tile">
                      <History className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-[var(--color-text-primary)]">Commit Activity</span>
                      <span className="giteye-mono block truncate text-[11px] text-[var(--color-text-muted)]">
                        {commitsThisWeek} commits this week
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <footer className="giteye-statusbar flex shrink-0 items-center justify-between gap-3 border-t border-[var(--color-border-muted)] px-4 text-[11px] text-[var(--color-text-muted)]">
            <span className="flex min-w-0 items-center gap-2">
              <GitBranch className="h-3.5 w-3.5 shrink-0" />
              {activeRepoInfo ? (
                <>
                  <span className="giteye-mono truncate text-[var(--color-text-secondary)]">{activeRepoInfo.currentBranch}</span>
                  {(activeRepoInfo.ahead > 0 || activeRepoInfo.behind > 0) && (
                    <span className="giteye-mono shrink-0">↑{activeRepoInfo.ahead} ↓{activeRepoInfo.behind}</span>
                  )}
                </>
              ) : (
                <span className="truncate">No repository open</span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-3">
              {activeRepoInfo && (
                <span className="giteye-chip" data-tone={activeRepoInfo.isClean ? "success" : "warning"}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {activeRepoInfo.isClean ? "Synced" : "Uncommitted"}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", online ? "bg-[var(--color-success)]" : "bg-[var(--color-danger)]")} />
                {online ? "Online" : "Offline"}
              </span>
              {errorCount > 0 && (
                <span className="giteye-chip" data-tone="danger">
                  {errorCount} {errorCount === 1 ? "error" : "errors"}
                </span>
              )}
              <span className="giteye-hub-footer-shortcuts hidden items-center gap-3 lg:flex">
                <Shortcut keys={paletteKeys} label="Search" />
                <Shortcut keys={getShortcutBinding("toggle-command-log").replace("Mod+", "⌘")} label="Command log" />
              </span>
            </span>
          </footer>
        </main>
      </div>
    </AppChrome>
  );
}

function FavoriteCard({
  repo,
  onOpen,
  onSetFavorite,
}: {
  repo: RepositoryCard;
  onOpen: (path: string) => void;
  onSetFavorite: (repo: RepositoryCard, favorite: boolean) => void;
}) {
  const timestamp = repo.lastOpenedAt ?? repo.favoritedAt;
  return (
    <article className="giteye-card relative">
      <button type="button" onClick={() => onOpen(repo.path)} className="block w-full text-left">
        <RepoThumb seed={repo.path} />
        <span className="block p-4">
          <span className="block truncate text-[15px] font-semibold text-[var(--color-text-primary)]">
            {repo.parentName ? `${repo.parentName} | ${repo.name}` : repo.name}
          </span>
          <span className="giteye-mono mt-0.5 block truncate text-[11px] text-[var(--color-text-muted)]">{repo.path}</span>
          {(repo.relationshipKind || repo.parentName) && (
            <span className="mt-2.5 flex flex-wrap gap-1.5">
              {repo.relationshipKind && <span className="giteye-chip capitalize">{repo.relationshipKind}</span>}
              {repo.parentName && <span className="giteye-chip">{repo.parentName}</span>}
            </span>
          )}
          <span className="mt-3 flex items-center justify-between border-t border-[var(--color-border-muted)] pt-2.5 text-[11px] text-[var(--color-text-muted)]">
            <span className="giteye-mono flex min-w-0 items-center gap-1.5 text-[var(--color-accent)]">
              <GitBranch className="h-3 w-3 shrink-0" />
              <span className="truncate">{repo.currentBranch ?? "—"}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <Clock className="h-3 w-3" />
              {timestamp ? formatRelativeTime(timestamp) : "—"}
            </span>
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={`Remove ${repo.name} from favorites`}
        title="Remove from favorites"
        onClick={() => onSetFavorite(repo, false)}
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-bg-elevated)] text-[var(--color-star)] shadow-[var(--shadow-soft)] hover:opacity-80"
      >
        <Star className="h-3.5 w-3.5 fill-current" />
      </button>
    </article>
  );
}

function FavoriteRow({
  repo,
  onOpen,
  onSetFavorite,
}: {
  repo: RepositoryCard;
  onOpen: (path: string) => void;
  onSetFavorite: (repo: RepositoryCard, favorite: boolean) => void;
}) {
  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--color-bg-hover)]">
      <button type="button" onClick={() => onOpen(repo.path)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="giteye-icon-tile" data-tone="star">
          <Star className="h-4 w-4 fill-current" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
            {repo.parentName ? `${repo.parentName} | ${repo.name}` : repo.name}
          </span>
          <span className="giteye-mono block truncate text-[11px] text-[var(--color-text-muted)]">{repo.path}</span>
        </span>
      </button>
      <span className="giteye-mono hidden w-40 shrink-0 items-center gap-1.5 text-[11.5px] text-[var(--color-text-secondary)] sm:flex">
        <GitBranch className="h-3 w-3 shrink-0" />
        <span className="truncate">{repo.currentBranch ?? "—"}</span>
      </span>
      <button
        type="button"
        aria-label={`Remove ${repo.name} from favorites`}
        title="Remove from favorites"
        onClick={() => onSetFavorite(repo, false)}
        className="giteye-btn giteye-btn-ghost giteye-btn-icon giteye-btn-sm text-[var(--color-star)]"
      >
        <Star className="h-4 w-4 fill-current" />
      </button>
    </div>
  );
}

function RecentRow({
  repo,
  isFavorite,
  onOpen,
  onSetFavorite,
  onRemoveRecent,
}: {
  repo: RepositoryCard;
  isFavorite: boolean;
  onOpen: (path: string) => void;
  onSetFavorite: (repo: RepositoryCard, favorite: boolean) => void;
  onRemoveRecent: (path: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="group relative flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-bg-hover)]">
      <button type="button" onClick={() => onOpen(repo.path)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="giteye-icon-tile">
          <FolderOpen className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-[var(--color-text-primary)]">
            <span className="truncate">{repo.parentName ? `${repo.parentName} | ${repo.name}` : repo.name}</span>
            {isFavorite && <Star className="h-3.5 w-3.5 shrink-0 fill-current text-[var(--color-star)]" />}
          </span>
          <span className="giteye-mono block truncate text-[11px] text-[var(--color-text-muted)]">{repo.path}</span>
        </span>
      </button>
      <span className="hidden w-44 shrink-0 flex-col items-end sm:flex">
        <span className="giteye-mono flex max-w-full items-center gap-1.5 text-[11.5px] text-[var(--color-text-secondary)]">
          <GitBranch className="h-3 w-3 shrink-0" />
          <span className="truncate">{repo.currentBranch ?? "—"}</span>
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)]">Active branch</span>
      </span>
      <span className="hidden w-28 shrink-0 flex-col items-end md:flex">
        <span className="text-[11.5px] text-[var(--color-text-secondary)]">
          {repo.lastOpenedAt ? formatRelativeTime(repo.lastOpenedAt) : "—"}
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)]">Last opened</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={isFavorite ? `Remove ${repo.name} from favorites` : `Add ${repo.name} to favorites`}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          onClick={() => onSetFavorite(repo, !isFavorite)}
          className="giteye-btn giteye-btn-ghost giteye-btn-icon giteye-btn-sm text-[var(--color-text-muted)] hover:text-[var(--color-star)]"
        >
          <Star className={cn("h-4 w-4", isFavorite && "fill-current text-[var(--color-star)]")} />
        </button>
        <button
          type="button"
          aria-label={`More actions for ${repo.name}`}
          title="More actions"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((visible) => !visible)}
          className="giteye-btn giteye-btn-ghost giteye-btn-icon giteye-btn-sm text-[var(--color-text-muted)] opacity-70 hover:text-[var(--color-text-primary)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div role="menu" aria-label={`Actions for ${repo.name}`} className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-1 shadow-[var(--shadow-elevated)]">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void navigator.clipboard.writeText(repo.path);
                }}
                className="giteye-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              >
                Copy Path
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onRemoveRecent(repo.path);
                }}
                className="giteye-menu-item flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-danger)] hover:bg-[var(--color-bg-hover)]"
              >
                Remove from Recents
              </button>
            </div>
          </>
        )}
      </span>
    </div>
  );
}

function RepoThumb({ seed }: { seed: string }) {
  const elements = useMemo(() => {
    const random = seededRandom(hashString(seed));
    const nodes = Array.from({ length: 7 }, () => ({
      x: 16 + Math.round(random() * 288),
      y: 12 + Math.round(random() * 72),
      tone: random() > 0.5 ? "accent" : "success",
      square: random() > 0.75,
    }));
    const links = nodes.slice(1).map((node, index) => {
      const previous = nodes[index];
      const midX = Math.round((previous.x + node.x) / 2);
      return `M ${previous.x} ${previous.y} H ${midX} V ${node.y} H ${node.x}`;
    });
    return { nodes, links };
  }, [seed]);

  return (
    <svg className="giteye-thumb" viewBox="0 0 320 96" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {elements.links.map((d, index) => (
        <path
          key={index}
          d={d}
          fill="none"
          stroke={index % 2 === 0 ? "var(--color-accent)" : "var(--color-success)"}
          strokeOpacity="0.3"
          strokeWidth="1"
        />
      ))}
      {elements.nodes.map((node, index) => {
        const stroke = node.tone === "accent" ? "var(--color-accent)" : "var(--color-success)";
        return node.square ? (
          <rect key={index} x={node.x - 3} y={node.y - 3} width="6" height="6" fill="none" stroke={stroke} strokeOpacity="0.55" />
        ) : (
          <circle key={index} cx={node.x} cy={node.y} r="3" fill="none" stroke={stroke} strokeOpacity="0.55" />
        );
      })}
    </svg>
  );
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}


function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <kbd className="giteye-kbd">{keys}</kbd>
      {label}
    </span>
  );
}

