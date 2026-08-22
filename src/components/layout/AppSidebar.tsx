import { type ReactNode, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Bell, Circle, FolderGit2, GitBranch, Home, Plus, Search, Settings, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { useAppStore } from "../../stores/app-store";
import { useNoticeStore } from "../../stores/notice-store";
import { cn } from "../../lib/cn";
import { formatRelativeTime } from "../../lib/format";
import { openCommandPalette } from "../../lib/command-palette";
import { getShortcutBinding } from "../../lib/shortcuts";

export function AppSidebar({ children }: { children?: ReactNode }) {
  const queryClient = useQueryClient();
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const openRepoPaths = useAppStore((s) => s.openRepoPaths);
  const setActiveRepoPath = useAppStore((s) => s.setActiveRepoPath);
  const setGlobalView = useAppStore((s) => s.setGlobalView);
  const route = useAppStore((s) => s.route);
  const operationTranscript = useNoticeStore((s) => s.operationTranscript);
  const [showNotifications, setShowNotifications] = useState(false);
  const initMutation = useMutation(gitMutations.initRepository(queryClient, setActiveRepoPath));
  const { data: identity } = useQuery(gitQueries.gitIdentity(activeRepoPath));
  const globalView = route.area === "global" ? route.view : "repo-hub";
  const displayName = identity?.effectiveName ?? "GitEye";
  const displayEmail = identity?.effectiveEmail ?? "No identity configured";
  const initials =
    displayName
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "GE";

  const handleInitRepository = async () => {
    const selected = await open({ directory: true, multiple: false, title: "Choose folder for new Git repository" });
    if (selected && typeof selected === "string") {
      initMutation.mutate(selected);
    }
  };

  return (
    <>
      <aside className="giteye-sidebar flex shrink-0 flex-col border-r border-[var(--color-border-muted)]">
        <div className="flex items-center gap-2.5 px-4 pb-4 pt-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--color-accent)] text-white">
            <GitBranch className="h-[18px] w-[18px]" />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-text-primary)]">GitEye</span>
        </div>

        <div className="px-3 pb-4">
          <select
            className="giteye-select"
            value={activeRepoPath ?? ""}
            onChange={(event) => {
              if (event.target.value) setActiveRepoPath(event.target.value);
            }}
            aria-label="Active workspace"
          >
            <option value="" disabled>
              {openRepoPaths.length > 0 ? "Select workspace" : "No workspace open"}
            </option>
            {openRepoPaths.map((repoPath) => (
              <option key={repoPath} value={repoPath}>
                {basename(repoPath)}
              </option>
            ))}
          </select>
        </div>

        <nav className="space-y-1 px-3 pb-2">
          <button
            type="button"
            onClick={() => setGlobalView("repo-hub")}
            aria-current={route.area === "global" && globalView === "repo-hub" ? "page" : undefined}
            className="giteye-side-nav"
          >
            <Home className={cn("h-4 w-4", route.area === "global" && globalView === "repo-hub" && "text-[var(--color-accent)]")} />
            Repo Hub
          </button>
          <button
            type="button"
            onClick={() => setGlobalView("settings")}
            aria-current={route.area === "global" && globalView === "settings" ? "page" : undefined}
            className="giteye-side-nav"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
          <button
            type="button"
            onClick={() => setShowNotifications((visible) => !visible)}
            aria-expanded={showNotifications}
            className={cn("giteye-side-nav", showNotifications && "bg-[var(--color-bg-selected-muted)] text-[var(--color-text-primary)]")}
          >
            <Bell className="h-4 w-4" />
            Notifications
            {operationTranscript.length > 0 && (
              <span className="ml-auto giteye-chip h-4 min-w-4 justify-center px-1 text-[9px] text-[var(--color-accent)]">
                {Math.min(operationTranscript.length, 99)}
              </span>
            )}
          </button>
        </nav>

        {children ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        ) : (
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
            <div className="my-4 h-px bg-[var(--color-border-muted)]" />
            <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Workspaces</div>
            {openRepoPaths.length > 0 ? (
              <div className="mt-2 space-y-1">
                {openRepoPaths.map((repoPath) => (
                  <button
                    key={repoPath}
                    type="button"
                    onClick={() => setActiveRepoPath(repoPath)}
                    className="giteye-side-nav min-h-8 text-xs"
                    title={repoPath}
                  >
                    <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
                    <span className="truncate">{basename(repoPath)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="giteye-card mt-2 space-y-2 p-3 text-xs text-[var(--color-text-secondary)]">
                <span className="giteye-chip">No sessions</span>
                <p>Open or clone a repository to start a workspace.</p>
              </div>
            )}
            <div className="my-4 h-px bg-[var(--color-border-muted)]" />
            <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Accounts</div>
            <div className="giteye-card mt-2 space-y-2 p-3 text-xs text-[var(--color-text-secondary)]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="giteye-chip">
                  <GitBranch className="h-3 w-3" />
                  GitHub via gh
                </span>
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
        )}

        <div className="space-y-3 border-t border-[var(--color-border-muted)] px-3 py-3">
          <button type="button" className="giteye-side-nav" onClick={() => void handleInitRepository()}>
            <Plus className="h-4 w-4" />
            New Repository
          </button>
          <div className="flex items-center gap-2.5 px-1">
            <span className="giteye-avatar h-8 w-8">{initials}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-[var(--color-text-primary)]">{displayName}</span>
              <span className="block truncate text-[11px] text-[var(--color-text-muted)]">{displayEmail}</span>
            </span>
            <button
              type="button"
              className="giteye-topbar-btn h-7 w-7"
              onClick={() => setGlobalView("settings")}
              aria-label="Open settings"
              title="Settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {showNotifications && (
        <aside className="flex w-[320px] shrink-0 flex-col border-r border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border-muted)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Notifications</h2>
            <button
              type="button"
              onClick={() => setShowNotifications(false)}
              aria-label="Close notifications"
              className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {operationTranscript.length === 0 ? (
              <div className="giteye-card p-4">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">No operations logged</p>
                <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">Git operations triggered while a repository is open will appear here.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {operationTranscript.slice(0, 20).map((entry) => (
                  <div key={entry.id} className="giteye-card p-3">
                    <div className="flex items-center gap-2">
                      <Circle
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 fill-current",
                          entry.status === "success" && "text-[var(--color-success)]",
                          entry.status === "error" && "text-[var(--color-danger)]",
                          entry.status === "info" && "text-[var(--color-accent)]",
                        )}
                      />
                      <span className="truncate text-xs font-medium text-[var(--color-text-primary)]">{entry.title}</span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-[var(--color-text-secondary)]">{entry.detail}</p>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
                      <span>{formatRelativeTime(new Date(entry.createdAt).toISOString())}</span>
                      {entry.repoPath && <span className="truncate">{basename(entry.repoPath)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
}

export function useAppChromeSlots() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const { data: repoInfo } = useQuery(gitQueries.repositoryInfo(activeRepoPath));
  const paletteKeys = getShortcutBinding("command-palette").replace("Mod+", "⌘");

  return {
    leading: repoInfo ? (
      <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-semibold text-[var(--color-text-primary)]">
        <FolderGit2 className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
        <span className="max-w-[180px] truncate">{repoInfo.name}</span>
        <span className="text-[var(--color-text-muted)]">/</span>
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
        <span className="max-w-[160px] truncate font-medium text-[var(--color-text-secondary)]">{repoInfo.currentBranch}</span>
      </span>
    ) : (
      <span className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--color-text-primary)]">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-accent)] text-white">
          <GitBranch className="h-3.5 w-3.5" />
        </span>
        GitEye
      </span>
    ),
    trailing: (
      <button
        type="button"
        onClick={openCommandPalette}
        className="giteye-input flex h-8 w-56 items-center gap-2 px-2.5 text-left text-[12px] text-[var(--color-text-muted)]"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Search commands…</span>
        <kbd className="giteye-kbd">{paletteKeys}</kbd>
      </button>
    ),
  };
}


function basename(path: string) {
  const normalizedEnd = path.endsWith("/") ? path.length - 1 : path.length;
  const slashIndex = path.lastIndexOf("/", normalizedEnd - 1);
  return path.slice(slashIndex + 1, normalizedEnd);
}
