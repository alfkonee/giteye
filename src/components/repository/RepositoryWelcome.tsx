import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Bell,
  CheckCircle2,
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
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { useAppStore } from "../../stores/app-store";
import { cn } from "../../lib/cn";
import { openCommandPalette } from "../../lib/command-palette";
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
  const queryClient = useQueryClient();
  const setActiveRepoPath = useAppStore((s) => s.setActiveRepoPath);
  const openRepoPaths = useAppStore((s) => s.openRepoPaths);
  const openMutation = useMutation(gitMutations.openRepository(queryClient, setActiveRepoPath));
  const initMutation = useMutation(gitMutations.initRepository(queryClient, setActiveRepoPath));
  const cloneMutation = useMutation(gitMutations.cloneRepository(queryClient, setActiveRepoPath));
  const { data: recents, isLoading: recentsLoading } = useQuery(gitQueries.recentRepositories());
  const { data: favorites, isLoading: favoritesLoading } = useQuery(gitQueries.favoriteRepositories());
  const favoriteMutation = useMutation(gitMutations.setRepositoryFavorite(queryClient));
  const [showAllRecents, setShowAllRecents] = useState(false);
  const recentRepos = recents ?? [];
  const displayedRecentRepos = showAllRecents ? recentRepos : recentRepos.slice(0, 5);
  const favoriteRepos = favorites ?? [];
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
        <aside className="flex w-[264px] shrink-0 flex-col border-r border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/80">
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <button className="flex h-9 w-full items-center gap-3 rounded-lg bg-[var(--color-bg-selected)]/15 px-3 text-left text-sm font-semibold text-[var(--color-text-primary)] ring-1 ring-[var(--color-accent)]/20">
            <Home className="h-4 w-4 text-[var(--color-accent)]" />
            Repo Hub
          </button>
          <button className="mt-1 flex h-9 w-full items-center justify-between rounded-lg px-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]">
            <span className="inline-flex items-center gap-3">
              <Search className="h-4 w-4" />
              Search
            </span>
            <kbd className="rounded bg-[var(--color-bg-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">⌘K</kbd>
          </button>
          <button className="mt-1 flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]">
            <Bell className="h-4 w-4" />
            Notifications
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
            <div className="mt-2 rounded-lg border border-dashed border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)]/60 p-3 text-xs text-[var(--color-text-secondary)]">
              <p className="font-medium text-[var(--color-text-primary)]">No repository sessions yet</p>
              <p className="mt-1 leading-5">Open a repository to begin organizing local work.</p>
            </div>
          )}

          <div className="my-5 h-px bg-[var(--color-border-muted)]" />
          <SectionLabel>Accounts</SectionLabel>
          <div className="mt-2 rounded-lg border border-dashed border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)]/60 p-3 text-xs text-[var(--color-text-secondary)]">
            <div className="flex items-center gap-2 text-[var(--color-text-primary)]">
              <GitBranch className="h-4 w-4" />
              <span className="font-medium">No provider connected</span>
            </div>
            <p className="mt-1 leading-5">Connect an account when provider data is available.</p>
            <button disabled className="mt-3 flex h-8 w-full cursor-not-allowed items-center gap-2 rounded-md px-2 text-left text-[var(--color-text-muted)] opacity-60" title="Provider connection is unavailable in the current backend.">
              <Plus className="h-4 w-4" />
              Add Account
            </button>
          </div>
        </nav>

        <div className="border-t border-[var(--color-border-muted)] px-4 py-3 text-xs text-[var(--color-text-secondary)]">
          <GitBranch className="mr-2 inline h-3.5 w-3.5" />
          {openRepoPaths.length === 0 ? "No repository open" : `${openRepoPaths.length} repository session${openRepoPaths.length === 1 ? "" : "s"} open`}
        </div>
      </aside>

        <main className="flex min-w-0 flex-1 flex-col">
        <RepositoryTabs />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <section className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="mx-auto max-w-[980px]">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-[30px] font-semibold leading-none tracking-[-0.035em] text-[var(--color-text-primary)]">Repo Hub</h1>
                  <p className="mt-2 text-sm text-[var(--color-text-secondary)]">All your code. One place to start.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] shadow-[var(--shadow-panel)] hover:bg-[var(--color-bg-hover)]">
                    <Clock className="h-4 w-4" />
                  </button>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
                    <input
                      value=""
                      readOnly
                      onFocus={openCommandPalette}
                      onClick={openCommandPalette}
                      placeholder="Search repos..."
                      className="h-9 w-64 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] pl-9 pr-11 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-focus-ring)]/20"
                      aria-label="Open command palette"
                    />
                    <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-[var(--color-bg-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">⌘K</kbd>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <MetricCard label="Recent repositories" value={String(recentCount)} detail={recentCount === 1 ? "1 local repository opened" : `${recentCount} local repositories opened`} icon={FolderGit2} />
                <MetricCard label="Local paths" value={String(recentCount)} detail={recentCount === 1 ? "1 distinct recent path" : `${recentCount} distinct recent paths`} icon={FolderOpen} />
                <MetricCard label="Latest opened" value={latestRecent ? formatRelativeTime(latestRecent.lastOpenedAt) : "—"} detail={latestRecent?.name ?? "Open a repository to start"} icon={Clock} />
              </div>

              <section className="mt-4 overflow-hidden rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] p-5 shadow-[var(--shadow-panel)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">Welcome to Repo Hub</h2>
                    <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Open a local Git repository to populate this workspace with real project context.</p>
                    <p className="mt-3 text-xs text-[var(--color-text-secondary)]">
                      Tip: Press <kbd className="rounded bg-[var(--color-bg-surface)] px-1 py-0.5 text-[10px]">⌘K</kbd> to quickly search once repository data is available.
                    </p>
                  </div>
                  <div className="relative hidden h-28 w-56 shrink-0 overflow-hidden rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-elevated)] lg:block">
                    <div className="flex h-5 items-center gap-1 border-b border-[var(--color-border-muted)] px-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-danger)]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
                    </div>
                    <div className="space-y-2 p-4">
                      <div className="h-1.5 w-28 rounded-full bg-[var(--color-accent)]/70" />
                      <div className="ml-4 h-1.5 w-36 rounded-full bg-[var(--color-success)]/70" />
                      <div className="h-1.5 w-32 rounded-full bg-[var(--color-warning)]/70" />
                      <div className="ml-8 h-1.5 w-24 rounded-full bg-purple-300/70" />
                      <div className="h-1.5 w-40 rounded-full bg-[var(--color-text-muted)]/60" />
                    </div>
                    <Sparkles className="absolute right-5 top-8 h-6 w-6 rotate-12 text-[var(--color-success)]" />
                  </div>
                </div>
              </section>

              <div className="mt-4 grid grid-cols-2 gap-4">
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
                />
                <FavoriteList
                  loading={favoritesLoading}
                  repos={favoriteRepos}
                  onOpen={(repoPath) => openMutation.mutate(repoPath)}
                  onSetFavorite={handleSetFavorite}
                />
              </div>

              <section className="mt-4 rounded-lg border border-dashed border-[var(--color-accent)]/45 bg-[var(--color-bg-secondary)] p-5 shadow-[var(--shadow-panel)]">
                <div className="grid grid-cols-[minmax(220px,0.8fr)_minmax(280px,1.2fr)] gap-4">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Open a repository</h2>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Choose a local Git repository to begin.</p>
                    <div className="mt-3 flex gap-3">
                      <button
                        type="button"
                        onClick={handleCloneRepository}
                        disabled={actionPending}
                        className="h-9 rounded-lg bg-[var(--color-bg-selected)] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {cloneMutation.isPending ? "Cloning…" : "Clone Repository"}
                      </button>
                      <button
                        type="button"
                        onClick={handleInitRepository}
                        disabled={actionPending}
                        className="h-9 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-4 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {initMutation.isPending ? "Creating…" : "New Repository"}
                      </button>
                    </div>
                  </div>
                  <div className="border-l border-[var(--color-border-muted)] pl-5">
                    <label className="block text-xs text-[var(--color-text-secondary)]">Open a repository from path</label>
                    <div className="mt-2 flex gap-3">
                      <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
                        <input
                          value={path}
                          onChange={(event) => setPath(event.target.value)}
                          onKeyDown={(event) => event.key === "Enter" && handleOpen()}
                          placeholder="/path/to/git/repository"
                          className="h-9 w-full rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] pl-9 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-focus-ring)]/20"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleBrowse}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                        aria-label="Browse for repository folder"
                      >
                        <FolderOpen className="h-4 w-4" />
                        Browse
                      </button>
                      <button
                        type="button"
                        onClick={handleOpen}
                        disabled={!path.trim() || actionPending}
                        className="inline-flex h-9 items-center rounded-lg bg-[var(--color-bg-selected)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {openMutation.isPending ? "Opening…" : "Open"}
                      </button>
                    </div>
                    {actionError && <p className="mt-2 text-xs text-[var(--color-danger)]">{String(actionError)}</p>}
                  </div>
                </div>
              </section>

              <section className="mt-4 overflow-hidden rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] p-3.5 shadow-[var(--shadow-panel)]">
                <SectionHeader title="Team Workspaces" />
                <div className="mt-3 rounded-lg border border-dashed border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)]/60 p-5 text-center">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">No team workspace data</p>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Connect a provider or open a repository with workspace metadata to show shared context here.</p>
                </div>
              </section>
            </div>
          </section>

          <ActivityFeed />
        </div>

        <footer className="giteye-statusbar flex h-7 shrink-0 items-center justify-between border-t border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-5 text-xs text-[var(--color-text-secondary)]">
          <span className="inline-flex items-center gap-2">
            <GitBranch className="h-3.5 w-3.5" />
            No repository open
          </span>
          <span className="flex items-center gap-4">
            <Shortcut keys="⌘K" label="Search" />
            <Shortcut keys="⌘N" label="New Repo" />
            <Shortcut keys="⌘O" label="Open Repo" />
            <Shortcut keys="⌘/" label="Shortcuts" />
          </span>
          <span className="inline-flex items-center gap-2 text-[var(--color-success)]">
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
    <article className="h-[100px] rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] p-3.5 shadow-[var(--shadow-panel)]">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-bg-surface)] text-[var(--color-accent)]">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate whitespace-nowrap text-xs text-[var(--color-text-secondary)]">{label}</span>
          <span className="mt-1 block truncate text-2xl font-semibold leading-none text-[var(--color-text-primary)]">{value}</span>
          <span className="mt-2 block truncate text-xs text-[var(--color-text-secondary)]">{detail}</span>
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
}) {
  const canToggle = totalCount > 5;

  return (
    <section className="h-[276px] min-w-0 overflow-hidden rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] p-3.5 shadow-[var(--shadow-panel)]">
      <div className="flex items-center justify-between">
        <SectionHeader title={title} />
        {canToggle && (
          <button
            type="button"
            onClick={onToggleShowAll}
            className="rounded-md border border-[var(--color-border-muted)] px-2 py-1 text-[11px] font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-bg-hover)]"
          >
            {showAll ? "Show less" : `View all ${totalCount}`}
          </button>
        )}
      </div>
      <div className="mt-3 h-[220px] overflow-y-auto divide-y divide-[var(--color-border-muted)] pr-1">
        {loading ? (
          <div className="flex h-[220px] items-center justify-center">
            <LoadingSpinner size="sm" />
          </div>
        ) : repos.length === 0 ? (
          <div className="flex h-[220px] flex-col items-center justify-center px-5 text-center">
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
                className="group grid w-full grid-cols-[minmax(0,1fr)_92px_56px] items-center gap-3 py-2 text-left hover:bg-[var(--color-bg-hover)]"
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
                  <MoreHorizontal className="h-4 w-4 text-[var(--color-text-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
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
    <section className="h-[276px] min-w-0 overflow-hidden rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] p-3.5 shadow-[var(--shadow-panel)]">
      <SectionHeader title="Favorite Repositories" />
      <div className="mt-3 h-[220px] overflow-y-auto divide-y divide-[var(--color-border-muted)] pr-1">
        {loading ? (
          <div className="flex h-[220px] items-center justify-center">
            <LoadingSpinner size="sm" />
          </div>
        ) : repos.length === 0 ? (
          <div className="flex h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)]/60 px-5 text-center">
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
              className="group grid w-full grid-cols-[minmax(0,1fr)_32px] items-center gap-3 py-2 text-left hover:bg-[var(--color-bg-hover)]"
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
      <div className="space-y-4">
        <section className="rounded-lg border border-dashed border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)]/60 p-5 text-center">
          <Clock className="mx-auto mb-2 h-6 w-6 text-[var(--color-text-muted)]" />
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">No activity data</p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Repository pushes, reviews, and checks will appear when live provider data is connected.</p>
        </section>
        <section className="rounded-lg border border-dashed border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)]/60 p-5 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-[var(--color-text-muted)]" />
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">No check data</p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">CI status requires live repository provider data.</p>
        </section>
      </div>
    </aside>
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <kbd className="rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-secondary)]">{keys}</kbd>
      {label}
    </span>
  );
}

function basename(path: string) {
  const normalizedEnd = path.endsWith("/") ? path.length - 1 : path.length;
  const slashIndex = path.lastIndexOf("/", normalizedEnd - 1);
  return path.slice(slashIndex + 1, normalizedEnd);
}
