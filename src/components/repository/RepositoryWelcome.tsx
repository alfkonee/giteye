import { useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Bell,
  CheckCircle2,
  Circle,
  Clock,
  FolderGit2,
  FolderOpen,
  GitBranch,
  Home,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { useAppStore } from "../../stores/app-store";
import { useNoticeStore } from "../../stores/notice-store";
import { cn } from "../../lib/cn";
import { formatRelativeTime } from "../../lib/format";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { AppChrome } from "../layout/AppChrome";
import { RepositoryTabs } from "../layout/RepositoryTabs";

type RepositoryCard = {
  name: string;
  path: string;
  lastOpenedAt?: string;
  favoritedAt?: string;
};

export function RepositoryWelcome() {
  const [path, setPath] = useState("");
  const [repoSearch, setRepoSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const queryClient = useQueryClient();
  const setActiveRepoPath = useAppStore((s) => s.setActiveRepoPath);
  const openRepoPaths = useAppStore((s) => s.openRepoPaths);
  const operationTranscript = useNoticeStore((s) => s.operationTranscript);
  const openMutation = useMutation(gitMutations.openRepository(queryClient, setActiveRepoPath));
  const initMutation = useMutation(gitMutations.initRepository(queryClient, setActiveRepoPath));
  const cloneMutation = useMutation(gitMutations.cloneRepository(queryClient, setActiveRepoPath));
  const { data: recents, isLoading: recentsLoading } = useQuery(gitQueries.recentRepositories());
  const { data: favorites, isLoading: favoritesLoading } = useQuery(gitQueries.favoriteRepositories());
  const favoriteMutation = useMutation(gitMutations.setRepositoryFavorite(queryClient));
  const removeRecentMutation = useMutation(gitMutations.removeRecentRepository(queryClient));
  const [showAllRecents, setShowAllRecents] = useState(false);
  const repoSearchLower = repoSearch.trim().toLowerCase();
  const recentRepos = (recents ?? []).filter(
    (repo) => !repoSearchLower || repo.name.toLowerCase().includes(repoSearchLower) || repo.path.toLowerCase().includes(repoSearchLower),
  );
  const displayedRecentRepos = showAllRecents ? recentRepos : recentRepos.slice(0, 5);
  const favoriteRepos = (favorites ?? []).filter(
    (repo) => !repoSearchLower || repo.name.toLowerCase().includes(repoSearchLower) || repo.path.toLowerCase().includes(repoSearchLower),
  );
  const favoritePaths = new Set(favoriteRepos.map((repo) => repo.path));
  const recentCount = recentRepos.length;
  const latestRecent = recentRepos[0];

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

  const handleCloneRepository = () => {
    const url = window.prompt("Repository URL to clone");
    if (!url?.trim()) return;

    const destination = window.prompt("Destination path for cloned repository");
    if (!destination?.trim()) return;

    cloneMutation.mutate({ url: url.trim(), destination: destination.trim() });
  };

  const handleSetFavorite = (repo: RepositoryCard, favorite: boolean) => {
    favoriteMutation.mutate({ repoPath: repo.path, name: repo.name, favorite });
  };

  const actionPending = openMutation.isPending || initMutation.isPending || cloneMutation.isPending;
  const actionError = openMutation.error ?? initMutation.error ?? cloneMutation.error;

  return (
    <AppChrome title="GitEye · Repo Hub" subtitle="No repository open">
      <div className="flex h-full min-h-0 w-full overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
        <aside className="flex w-[248px] shrink-0 flex-col border-r border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/80">
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <button className="giteye-nav-active flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold">
              <Home className="h-4 w-4 text-[var(--color-accent)]" />
              Repo Hub
            </button>
            <button
              type="button"
              onClick={() => searchInputRef.current?.focus()}
              className="mt-1 flex h-9 w-full items-center justify-between rounded-lg px-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            >
              <span className="inline-flex items-center gap-3">
                <Search className="h-4 w-4" />
                Search
              </span>
              <kbd className="giteye-kbd">⌘K</kbd>
            </button>
            <button
              type="button"
              onClick={() => setShowNotifications((v) => !v)}
              className={cn(
                "mt-1 flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]",
                showNotifications && "giteye-nav-active text-[var(--color-text-primary)]",
              )}
            >
              <Bell className="h-4 w-4" />
              Notifications
              {operationTranscript.length > 0 && (
                <span className="ml-auto giteye-chip h-4 min-w-4 justify-center px-1 text-[9px] text-[var(--color-accent)]">
                  {Math.min(operationTranscript.length, 99)}
                </span>
              )}
            </button>

            <div className="my-5 h-px bg-[var(--color-border-muted)]" />
            <SectionLabel>Workspaces</SectionLabel>
            {openRepoPaths.length > 0 ? (
              <div className="mt-2 space-y-1">
                {openRepoPaths.map((repoPath) => (
                  <button
                    key={repoPath}
                    type="button"
                    onClick={() => setActiveRepoPath(repoPath)}
                    className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                    title={repoPath}
                  >
                    <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
                    <span className="truncate">{basename(repoPath)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-2 space-y-2 rounded-lg bg-[var(--color-bg-tertiary)]/40 p-3 text-xs text-[var(--color-text-secondary)]">
                <span className="giteye-chip">No sessions</span>
                <p>Open or clone a repository to start a workspace.</p>
              </div>
            )}

            <div className="my-5 h-px bg-[var(--color-border-muted)]" />
            <SectionLabel>Accounts</SectionLabel>
            <div className="mt-2 space-y-2 rounded-lg bg-[var(--color-bg-tertiary)]/40 p-3 text-xs text-[var(--color-text-secondary)]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="giteye-chip">
                  <GitBranch className="h-3 w-3" />
                  GitHub via gh
                </span>
                <span className="giteye-chip">GitLab later</span>
              </div>
              <p>Authenticate with gh, then open a repository for provider features.</p>
              <button
                disabled
                className="giteye-btn giteye-btn-ghost giteye-btn-sm w-full cursor-not-allowed justify-start opacity-60"
                title="GitHub accounts are detected automatically when gh CLI is authenticated. GitLab and Bitbucket support is planned for a future release."
              >
                <Plus className="h-3.5 w-3.5" />
                Add Account
              </button>
            </div>
          </nav>

          <div className="border-t border-[var(--color-border-muted)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
            <GitBranch className="mr-2 inline h-3.5 w-3.5" />
            {openRepoPaths.length === 0 ? "No repository open" : `${openRepoPaths.length} session${openRepoPaths.length === 1 ? "" : "s"}`}
          </div>
        </aside>

        {showNotifications && (
          <aside className="flex w-[320px] shrink-0 flex-col border-r border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border-muted)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Notifications</h2>
              <button
                type="button"
                onClick={() => setShowNotifications(false)}
                className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {operationTranscript.length === 0 ? (
                <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)]/45 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-bg-surface)] text-[var(--color-accent)]">
                      <Bell className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">No operations logged</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">Git operations triggered while a repository is open will appear here.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {operationTranscript.slice(0, 20).map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] p-3"
                    >
                      <div className="flex items-center gap-2">
                        <Circle
                          className={cn(
                            "h-2.5 w-2.5 shrink-0 fill-current",
                            entry.status === "success" && "text-[var(--color-success)]",
                            entry.status === "error" && "text-[var(--color-danger)]",
                            entry.status === "info" && "text-[var(--color-accent)]",
                          )}
                        />
                        <span className="truncate text-xs font-medium text-[var(--color-text-primary)]">
                          {entry.title}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-[var(--color-text-secondary)]">
                        {entry.detail}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
                        <span>{formatRelativeTime(new Date(entry.createdAt).toISOString())}</span>
                        {entry.repoPath && (
                          <span className="truncate">{basename(entry.repoPath)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}

        <main className="flex min-w-0 flex-1 flex-col">
          <RepositoryTabs />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <section className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="mx-auto max-w-[1020px]">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-[30px] font-semibold leading-none tracking-[-0.035em] text-[var(--color-text-primary)]">Repo Hub</h1>
                    <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Open, clone, or revisit a repository from one calm starting point.</p>
                  </div>
                  <div className="relative shrink-0">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
                    <input
                      ref={searchInputRef}
                      value={repoSearch}
                      onChange={(event) => setRepoSearch(event.target.value)}
                      placeholder="Search repositories"
                      className="giteye-input h-9 w-64 pl-9 pr-12"
                    />
                    <kbd className="giteye-kbd absolute right-2 top-1/2 -translate-y-1/2">⌘K</kbd>
                  </div>
                </div>

                <section className="giteye-surface rounded-xl p-4 shadow-[var(--shadow-panel)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Start with a repository</h2>
                      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Browse for a local repo, paste a path, clone, or initialize a new repository.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCloneRepository}
                        disabled={actionPending}
                        className="giteye-btn giteye-btn-secondary giteye-btn-sm disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {cloneMutation.isPending ? "Cloning…" : "Clone"}
                      </button>
                      <button
                        type="button"
                        onClick={handleInitRepository}
                        disabled={actionPending}
                        className="giteye-btn giteye-btn-secondary giteye-btn-sm disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {initMutation.isPending ? "Creating…" : "New"}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
                      <input
                        value={path}
                        onChange={(event) => setPath(event.target.value)}
                        onKeyDown={(event) => event.key === "Enter" && handleOpen()}
                        placeholder="/path/to/git/repository"
                        className="giteye-input h-9 w-full pl-9"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleBrowse}
                      className="giteye-btn giteye-btn-secondary giteye-btn-sm shrink-0"
                      aria-label="Browse for repository folder"
                    >
                      <FolderOpen className="h-4 w-4" />
                      Browse
                    </button>
                    <button
                      type="button"
                      onClick={handleOpen}
                      disabled={!path.trim() || actionPending}
                      className="giteye-btn giteye-btn-primary giteye-btn-sm shrink-0 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {openMutation.isPending ? "Opening…" : "Open"}
                    </button>
                  </div>
                  {actionError && <p className="mt-2 text-xs text-[var(--color-danger)]">{String(actionError)}</p>}
                </section>

                <div className="mt-4">
                  <RepositoryList
                    title="Recent Repositories"
                    loading={recentsLoading}
                    repos={displayedRecentRepos}
                    totalCount={recentCount}
                    showAll={showAllRecents}
                    onToggleShowAll={() => setShowAllRecents((value) => !value)}
                    favoritePaths={favoritePaths}
                    onOpen={(repoPath) => openMutation.mutate(repoPath)}
                    onSetFavorite={handleSetFavorite}
                    onRemoveRecent={(repoPath) => removeRecentMutation.mutate(repoPath)}
                  />
                </div>

                <div className="mt-4 grid grid-cols-[minmax(0,1fr)_320px] gap-4">
                  <FavoriteList
                    loading={favoritesLoading}
                    repos={favoriteRepos}
                    onOpen={(repoPath) => openMutation.mutate(repoPath)}
                    onSetFavorite={handleSetFavorite}
                  />

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-2">
                      <MetricCard label="Recent" value={String(recentCount)} detail={recentCount === 1 ? "1 repo opened" : `${recentCount} repos opened`} icon={FolderGit2} />
                      <MetricCard label="Paths" value={String(recentCount)} detail={recentCount === 1 ? "1 local path" : `${recentCount} local paths`} icon={FolderOpen} />
                      <MetricCard label="Latest" value={latestRecent ? formatRelativeTime(latestRecent.lastOpenedAt) : "—"} detail={latestRecent?.name ?? "Open a repository"} icon={Clock} />
                    </div>

                    <section className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/80 p-3 shadow-[var(--shadow-panel)]">
                      <div className="flex items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                          <Sparkles className="h-4 w-4" />
                        </span>
                        <div>
                          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Welcome to Repo Hub</h2>
                          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Repository context appears here after you open a local project.</p>
                          <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
                            Press <kbd className="giteye-kbd">⌘K</kbd> to filter recents.
                          </p>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/70 p-3 shadow-[var(--shadow-panel)]">
                      <SectionHeader title="Team Workspaces" />
                      <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Open a repository with workspace metadata to show shared context.</p>
                    </section>
                  </div>
                </div>
              </div>
            </section>

            <ActivityFeed />
          </div>

        <footer className="flex h-7 shrink-0 items-center justify-between border-t border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/90 px-5 text-[11px] text-[var(--color-text-muted)]">
          <span className="inline-flex items-center gap-2">
            <GitBranch className="h-3.5 w-3.5" />
            No repository open
          </span>
          <span className="flex items-center gap-3">
            <Shortcut keys="⌘K" label="Search" />
            <Shortcut keys="⌘N" label="New Repo" />
            <Shortcut keys="⌘O" label="Open Repo" />
            <Shortcut keys="⌘/" label="Shortcuts" />
          </span>
          <span className="giteye-chip" data-tone="success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Ready
          </span>
        </footer>
      </main>
      </div>
    </AppChrome>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <div className="px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{children}</div>;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof FolderGit2;
}) {
  return (
    <article className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/70 px-3 py-2 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-bg-surface)] text-[var(--color-accent)]">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate whitespace-nowrap text-xs text-[var(--color-text-secondary)]">{label}</span>
          <span className="mt-0.5 block truncate text-lg font-semibold leading-none text-[var(--color-text-primary)]">{value}</span>
          <span className="mt-1 block truncate text-[11px] text-[var(--color-text-muted)]">{detail}</span>
        </span>
      </div>
    </article>
  );
}

function RepositoryList({
  title,
  loading,
  repos,
  totalCount,
  showAll,
  onToggleShowAll,
  favoritePaths,
  onOpen,
  onSetFavorite,
  onRemoveRecent,
}: {
  title: string;
  loading: boolean;
  repos: RepositoryCard[];
  totalCount: number;
  showAll: boolean;
  onToggleShowAll: () => void;
  favoritePaths: Set<string>;
  onOpen: (path: string) => void;
  onSetFavorite: (repo: RepositoryCard, favorite: boolean) => void;
  onRemoveRecent: (path: string) => void;
}) {
  const [menuRepo, setMenuRepo] = useState<RepositoryCard | null>(null);
  const canToggle = totalCount > 5;

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] p-3.5 shadow-[var(--shadow-panel)]">
      <div className="flex items-center justify-between">
        <SectionHeader title={title} />
        {canToggle && (
          <button
            type="button"
            onClick={onToggleShowAll}
            className="giteye-btn giteye-btn-ghost giteye-btn-sm text-[var(--color-accent)]"
          >
            {showAll ? "Show less" : `View all ${totalCount}`}
          </button>
        )}
      </div>
      <div className="mt-3 h-[264px] overflow-y-auto divide-y divide-[var(--color-border-muted)] pr-1">
        {loading ? (
          <div className="flex h-[264px] items-center justify-center">
            <LoadingSpinner size="sm" />
          </div>
        ) : repos.length === 0 ? (
          <div className="flex h-[264px] flex-col items-center justify-center px-5 text-center">
            <GitBranch className="mb-2 h-6 w-6 text-[var(--color-text-muted)]" />
            <p className="text-sm font-medium text-[var(--color-text-primary)]">No recent repositories</p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Open a local Git repository to pin it here.</p>
          </div>
        ) : (
          repos.map((repo) => {
            const isFavorite = favoritePaths.has(repo.path);

            return (
              <button
                key={repo.path}
                type="button"
                onClick={() => onOpen(repo.path)}
                className="group relative grid w-full grid-cols-[minmax(0,1fr)_96px_56px] items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-[var(--color-bg-hover)]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-bg-surface)] text-[var(--color-accent)]">
                    <FolderGit2 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--color-text-primary)]">{repo.name}</span>
                    <span className="block truncate text-[11px] text-[var(--color-text-secondary)]">{repo.path}</span>
                  </span>
                </span>
                <span className="text-right text-[11px] text-[var(--color-text-secondary)]">{repo.lastOpenedAt ? formatRelativeTime(repo.lastOpenedAt) : "—"}</span>
                <span className="flex justify-end gap-1">
                  <span
                    role="button"
                    tabIndex={0}
                    title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSetFavorite(repo, !isFavorite);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onSetFavorite(repo, !isFavorite);
                      }
                    }}
                    className="rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-warning)]"
                  >
                    <Star className={cn("h-4 w-4", isFavorite && "fill-current text-[var(--color-warning)]")} />
                  </span>
                  <button
                    type="button"
                    title="More actions"
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuRepo(menuRepo?.path === repo.path ? null : repo);
                    }}
                    className="rounded-md p-1 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {menuRepo?.path === repo.path && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuRepo(null)} />
                      <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] py-1 shadow-[var(--shadow-elevated)]">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMenuRepo(null);
                            void navigator.clipboard.writeText(repo.path);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
                        >
                          Copy Path
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMenuRepo(null);
                            onRemoveRecent(repo.path);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--color-danger)] hover:bg-[var(--color-bg-hover)]"
                        >
                          Remove from Recents
                        </button>
                      </div>
                    </>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

function FavoriteList({
  loading,
  repos,
  onOpen,
  onSetFavorite,
}: {
  loading: boolean;
  repos: RepositoryCard[];
  onOpen: (path: string) => void;
  onSetFavorite: (repo: RepositoryCard, favorite: boolean) => void;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] p-3.5 shadow-[var(--shadow-panel)]">
      <SectionHeader title="Favorite Repositories" />
      <div className="mt-3 h-[252px] overflow-y-auto divide-y divide-[var(--color-border-muted)] pr-1">
        {loading ? (
          <div className="flex h-[252px] items-center justify-center">
            <LoadingSpinner size="sm" />
          </div>
        ) : repos.length === 0 ? (
          <div className="flex h-[252px] flex-col items-center justify-center rounded-lg bg-[var(--color-bg-tertiary)]/35 px-5 text-center">
            <Star className="mb-2 h-6 w-6 text-[var(--color-text-muted)]" />
            <p className="text-sm font-medium text-[var(--color-text-primary)]">No favorites yet</p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Favorite repositories from the recent list or repo switcher to pin them here.</p>
          </div>
        ) : (
          repos.map((repo) => (
            <button
              key={repo.path}
              type="button"
              onClick={() => onOpen(repo.path)}
              className="group grid w-full grid-cols-[minmax(0,1fr)_32px] items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-[var(--color-bg-hover)]"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-bg-surface)] text-[var(--color-warning)]">
                  <Star className="h-4 w-4 fill-current" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[var(--color-text-primary)]">{repo.name}</span>
                  <span className="block truncate text-[11px] text-[var(--color-text-secondary)]">{repo.path}</span>
                </span>
              </span>
              <span
                role="button"
                tabIndex={0}
                title="Remove from favorites"
                onClick={(event) => {
                  event.stopPropagation();
                  onSetFavorite(repo, false);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onSetFavorite(repo, false);
                  }
                }}
                className="rounded-md p-1 text-[var(--color-warning)] transition-colors hover:bg-[var(--color-bg-surface)]"
              >
                <Star className="h-4 w-4 fill-current" />
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function ActivityFeed() {
  return (
    <aside className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/80 p-4 xl:block">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Activity Feed</h2>
      </div>
      <section className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)]/45 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-bg-surface)] text-[var(--color-accent)]">
            <Clock className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Provider activity appears here</p>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">Connect a provider after opening a repository to see pushes, reviews, and checks.</p>
          </div>
        </div>
      </section>
    </aside>
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <kbd className="giteye-kbd">{keys}</kbd>
      {label}
    </span>
  );
}

function basename(path: string) {
  const normalizedEnd = path.endsWith("/") ? path.length - 1 : path.length;
  const slashIndex = path.lastIndexOf("/", normalizedEnd - 1);
  return path.slice(slashIndex + 1, normalizedEnd);
}
