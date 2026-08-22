import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Clock, GitBranch, Globe, Settings2, ShieldCheck, Trash2 } from "lucide-react";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { useAppStore } from "../../stores/app-store";
import { appDialog } from "../common/AppDialogProvider";
import { RemotesView } from "./LocalGitViews";
import { CollaborationConnect } from "../collaboration/CollaborationConnect";
import { cn } from "../../lib/cn";

type RepoSettingsTab = "general" | "remotes" | "hooks" | "security" | "integrations";

function prefsKey(repoPath: string) {
  return `giteye.repo-prefs:${repoPath}`;
}

function loadPrefs(repoPath: string) {
  try {
    const raw = localStorage.getItem(prefsKey(repoPath));
    if (!raw) return { linearHistory: false, deleteHeadBranches: false };
    return JSON.parse(raw) as { linearHistory: boolean; deleteHeadBranches: boolean };
  } catch {
    return { linearHistory: false, deleteHeadBranches: false };
  }
}

export function RepositorySettings() {
  const queryClient = useQueryClient();
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const closeRepoPath = useAppStore((s) => s.closeRepoPath);
  const { data: repoInfo } = useQuery(gitQueries.repositoryInfo(activeRepoPath));
  const { data: remotes } = useQuery(gitQueries.remotes(activeRepoPath));
  const { data: lfsStatus } = useQuery(gitQueries.lfsStatus(activeRepoPath));
  const removeRecent = useMutation(gitMutations.removeRecentRepository(queryClient));
  const [tab, setTab] = useState<RepoSettingsTab>("general");
  const [prefs, setPrefs] = useState(() => (activeRepoPath ? loadPrefs(activeRepoPath) : { linearHistory: false, deleteHeadBranches: false }));

  const tabs: { id: RepoSettingsTab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "remotes", label: "Remotes" },
    { id: "hooks", label: "Git Hooks" },
    { id: "security", label: "Security" },
    { id: "integrations", label: "Integrations" },
  ];

  const remoteCount = remotes?.length ?? 0;
  const visibilityLabel = remoteCount > 0 ? "Connected remotes" : "Local only";
  const visibilityDetail = remoteCount > 0 ? `${remoteCount} remote${remoteCount === 1 ? "" : "s"} configured` : "This copy is not published through GitEye remotes.";

  const persistPrefs = (next: typeof prefs) => {
    setPrefs(next);
    if (activeRepoPath) localStorage.setItem(prefsKey(activeRepoPath), JSON.stringify(next));
  };

  const removeFromGitEye = async (destructive: boolean) => {
    if (!activeRepoPath) return;
    const confirmed = await appDialog.confirm(
      destructive
        ? `Remove "${repoInfo?.name ?? activeRepoPath}" from GitEye recents and close it? Files on disk are not deleted.`
        : `Close "${repoInfo?.name ?? activeRepoPath}" in GitEye? Files on disk are not changed.`,
      destructive ? "Remove repository from GitEye?" : "Close workspace?",
      destructive ? "danger" : "default",
    );
    if (!confirmed) return;
    if (destructive) await removeRecent.mutateAsync(activeRepoPath);
    closeRepoPath(activeRepoPath);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)]">
      <div className="border-b border-[var(--color-border-muted)] px-6 pb-0 pt-5">
        <div className="flex items-start gap-3">
          <span className="giteye-icon-tile" data-tone="accent" data-size="lg">
            <Settings2 className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">{repoInfo?.name ?? "Repository"}</h1>
              <span className="giteye-chip">{visibilityLabel}</span>
            </div>
            <p className="mt-1 text-[12.5px] text-[var(--color-text-muted)]">Repository-level configuration and infrastructure settings.</p>
          </div>
        </div>
        <nav className="mt-4 flex items-center gap-1" role="tablist" aria-label="Repository settings">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "border-b-2 px-3 py-2.5 text-[13px] font-medium",
                tab === item.id
                  ? "border-[var(--color-accent)] text-[var(--color-text-primary)]"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-8">
          {tab === "general" && (
            <>
              <section>
                <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">Repository Appearance</h2>
                <p className="mt-1 text-[12.5px] text-[var(--color-text-muted)]">How this repository identifies itself in GitEye.</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="giteye-card p-4">
                    <div className="text-[13px] font-semibold">Display Name</div>
                    <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">Used in sidebar and navigation headers.</p>
                    <label className="mt-3 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Project name</label>
                    <input readOnly value={repoInfo?.name ?? ""} className="giteye-input mt-1.5 h-9" />
                  </div>
                  <div className="giteye-card p-4">
                    <div className="text-[13px] font-semibold">Repository Visibility</div>
                    <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">Remote connectivity for this working copy.</p>
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] px-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <Globe className="h-4 w-4 text-[var(--color-accent)]" />
                        <span>
                          <span className="block text-[13px] font-medium">{visibilityLabel}</span>
                          <span className="block text-[11px] text-[var(--color-text-muted)]">{visibilityDetail}</span>
                        </span>
                      </span>
                      <button type="button" className="giteye-btn giteye-btn-secondary giteye-btn-sm" onClick={() => setTab("remotes")}>
                        Change
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">Development Workflow</h2>
                <p className="mt-1 text-[12.5px] text-[var(--color-text-muted)]">Configure branch naming, merging strategies, and default behavior.</p>
                <div className="giteye-card mt-4 divide-y divide-[var(--color-border-muted)]">
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <div>
                      <div className="text-[13px] font-semibold">Default Branch</div>
                      <p className="text-[12px] text-[var(--color-text-muted)]">Base branch for comparisons in this workspace.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="giteye-chip giteye-mono">
                        <GitBranch className="h-3 w-3" />
                        {repoInfo?.currentBranch ?? "—"}
                      </span>
                      <button type="button" className="giteye-link" onClick={() => setActiveView("branches")}>
                        Update
                      </button>
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
                    <span>
                      <span className="block text-[13px] font-semibold">Linear History Requirement</span>
                      <span className="block text-[12px] text-[var(--color-text-muted)]">GitEye reminder to rebase before merging. Not enforced by git itself.</span>
                    </span>
                    <input
                      type="checkbox"
                      className="h-5 w-9 accent-[var(--color-accent)]"
                      checked={prefs.linearHistory}
                      onChange={(event) => persistPrefs({ ...prefs, linearHistory: event.target.checked })}
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
                    <span>
                      <span className="block text-[13px] font-semibold">Delete Head Branches</span>
                      <span className="block text-[12px] text-[var(--color-text-muted)]">GitEye reminder to delete feature branches after merge.</span>
                    </span>
                    <input
                      type="checkbox"
                      className="h-5 w-9 accent-[var(--color-accent)]"
                      checked={prefs.deleteHeadBranches}
                      onChange={(event) => persistPrefs({ ...prefs, deleteHeadBranches: event.target.checked })}
                    />
                  </label>
                </div>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-[var(--color-text-primary)]">Danger Zone</h2>
                <p className="mt-1 text-[12.5px] text-[var(--color-text-muted)]">These actions change GitEye’s workspace, not the files on disk.</p>
                <div className="mt-4 space-y-3 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[13px] font-semibold">Close Workspace</div>
                      <p className="text-[12px] text-[var(--color-text-muted)]">Remove this repository from the open session. No further GitEye operations until reopened.</p>
                    </div>
                    <button type="button" className="giteye-btn giteye-btn-secondary" onClick={() => void removeFromGitEye(false)}>
                      <Archive className="h-4 w-4" />
                      Close
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[13px] font-semibold">Remove from GitEye</div>
                      <p className="text-[12px] text-[var(--color-text-muted)]">Drop recents/favorites entries. The working tree on disk is not deleted.</p>
                    </div>
                    <button type="button" className="giteye-btn giteye-btn-danger" onClick={() => void removeFromGitEye(true)}>
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {tab === "remotes" && <RemotesView />}
          {tab === "hooks" && (
            <section className="giteye-card p-4">
              <h2 className="text-[15px] font-semibold">Git Hooks</h2>
              <p className="mt-1 text-[12.5px] text-[var(--color-text-muted)]">
                GitEye does not edit hook scripts. LFS hook status for this repository:{" "}
                <span className="text-[var(--color-text-secondary)]">{lfsStatus?.hooksInstalled ? "installed" : "not installed"}</span>.
              </p>
            </section>
          )}
          {tab === "security" && (
            <section className="giteye-card p-4">
              <div className="flex items-center gap-2 text-[15px] font-semibold">
                <ShieldCheck className="h-4 w-4" />
                Repository security
              </div>
              <p className="mt-2 text-[12.5px] text-[var(--color-text-muted)]">
                SSH keys and credential helpers live in global Settings → Security. Open that pane to inspect keys, helpers, and auth tests for this machine.
              </p>
              <button type="button" className="giteye-btn giteye-btn-secondary mt-4" onClick={() => useAppStore.getState().setGlobalView("settings")}>
                Open Security settings
              </button>
            </section>
          )}
          {tab === "integrations" && <CollaborationConnect />}
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--color-border-muted)] px-6 py-3 text-[12px] text-[var(--color-text-muted)]">
        <span className="inline-flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" />
          Workflow reminders are stored locally in this session.
        </span>
      </footer>
    </div>
  );
}
