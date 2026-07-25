import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, FolderOpen, GitBranch, HardDrive, RefreshCw, ShieldCheck } from "lucide-react";
import { gitApi } from "../../lib/tauri-api";
import type { ToolchainStatus } from "../../types/app";

export const TOOLCHAIN_QUERY_KEY = ["toolchain-status"] as const;
const LFS_DISMISS_KEY = "giteye:lfs-onboarding-dismissed";

export function ToolchainGate({ children }: { children: React.ReactNode }) {
  const [lfsDismissed, setLfsDismissed] = useState(
    () => window.localStorage.getItem(LFS_DISMISS_KEY) === "true",
  );
  const statusQuery = useQuery({
    queryKey: TOOLCHAIN_QUERY_KEY,
    queryFn: gitApi.getToolchainStatus,
    retry: false,
    staleTime: 30_000,
  });

  if (statusQuery.isLoading) {
    return <ToolchainLoading />;
  }
  if (statusQuery.error) {
    return (
      <ToolchainShell>
        <div className="mx-auto max-w-lg text-center">
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Tool detection failed</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{String(statusQuery.error)}</p>
          <button type="button" onClick={() => statusQuery.refetch()} className="giteye-btn giteye-btn-primary mt-5">Retry detection</button>
        </div>
      </ToolchainShell>
    );
  }

  const status = statusQuery.data;
  const needsGit = !status?.git.installed;
  const needsLfs = Boolean(status?.git.installed && (!status.lfs.installed || !status.lfsEnabled));
  if (status && (needsGit || (needsLfs && !lfsDismissed))) {
    return (
      <ToolchainShell>
        <ToolchainSetup
          status={status}
          onboarding
          onDeferLfs={needsGit ? undefined : () => {
            window.localStorage.setItem(LFS_DISMISS_KEY, "true");
            setLfsDismissed(true);
          }}
        />
      </ToolchainShell>
    );
  }
  return children;
}

export function ToolchainSettings() {
  const statusQuery = useQuery({
    queryKey: TOOLCHAIN_QUERY_KEY,
    queryFn: gitApi.getToolchainStatus,
    retry: false,
  });
  if (statusQuery.isLoading) return <div className="p-4 text-xs text-[var(--color-text-muted)]">Detecting Git tools...</div>;
  if (!statusQuery.data) return <div className="p-4 text-xs text-[var(--color-danger)]">{String(statusQuery.error)}</div>;
  return <ToolchainSetup status={statusQuery.data} />;
}

function ToolchainSetup({ status, onboarding = false, onDeferLfs }: { status: ToolchainStatus; onboarding?: boolean; onDeferLfs?: () => void }) {
  const queryClient = useQueryClient();
  const [version, setVersion] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const updateStatus = (nextStatus: ToolchainStatus, nextMessage?: string) => {
    queryClient.setQueryData(TOOLCHAIN_QUERY_KEY, nextStatus);
    setMessage(nextMessage ?? null);
  };
  const installGit = useMutation({
    mutationFn: () => gitApi.installGitToolchain(version.trim() || null),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      updateStatus(result.status, result.message);
    },
  });
  const installLfs = useMutation({
    mutationFn: gitApi.installAndEnableLfs,
    onSuccess: (result) => {
      window.localStorage.removeItem(LFS_DISMISS_KEY);
      updateStatus(result.status, result.message);
    },
  });
  const selectGit = useMutation({
    mutationFn: gitApi.selectGitExecutable,
    onSuccess: (nextStatus) => {
      void queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      updateStatus(nextStatus, "Git executable selection updated.");
    },
  });
  const pending = installGit.isPending || installLfs.isPending || selectGit.isPending;
  const error = installGit.error ?? installLfs.error ?? selectGit.error;

  const chooseGit = async () => {
    const selected = await open({
      title: "Choose a Git executable",
      directory: false,
      multiple: false,
    });
    if (typeof selected === "string") selectGit.mutate(selected);
  };

  return (
    <div className={onboarding ? "mx-auto w-full max-w-4xl" : "p-4"}>
      {onboarding ? (
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"><GitBranch className="h-7 w-7" /></div>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-accent)]">GitEye setup</p>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">Prepare your Git toolchain</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--color-text-muted)]">GitEye detected missing tools. Install isolated copies for this user, or connect a portable Git build you already trust.</p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <ToolCard
          icon={<GitBranch className="h-5 w-5" />}
          title="Git"
          ready={status.git.installed}
          detail={status.git.version ?? "Required for repository operations"}
        >
          <div className="space-y-3">
            <label className="block space-y-1"><span className="text-[11px] font-medium text-[var(--color-text-secondary)]">Version</span><input value={version} onChange={(event) => setVersion(event.target.value)} disabled={pending || !status.canInstallGit} placeholder="Latest, or e.g. 2.50.1" className="giteye-input w-full text-xs" /></label>
            <p className="text-[10px] leading-relaxed text-[var(--color-text-muted)]">Installed through {status.installProvider ?? "a portable executable"} into <span className="font-mono">{status.userToolsDirectory}</span>. No administrator access is used.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending || !status.canInstallGit} onClick={() => installGit.mutate()} className="giteye-btn giteye-btn-primary"><Download className="h-3.5 w-3.5" />{status.git.installed ? "Install another version" : "Install Git"}</button>
              <button type="button" disabled={pending} onClick={chooseGit} className="giteye-btn"><FolderOpen className="h-3.5 w-3.5" />Choose portable Git</button>
              {status.git.executablePath ? <button type="button" disabled={pending} onClick={() => selectGit.mutate(null)} className="giteye-btn">Use system Git</button> : null}
            </div>
          </div>
        </ToolCard>

        <ToolCard
          icon={<HardDrive className="h-5 w-5" />}
          title="Git LFS"
          ready={status.lfs.installed && status.lfsEnabled}
          detail={status.lfs.version ?? "Optional large-file support"}
        >
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">Downloads the official Git LFS archive for {platformLabel(status.platform)} into the same user-only tools directory, then runs <span className="font-mono">git lfs install</span>.</p>
            <button type="button" disabled={pending || !status.git.installed} onClick={() => installLfs.mutate()} className="giteye-btn giteye-btn-primary"><ShieldCheck className="h-3.5 w-3.5" />{status.lfs.installed ? "Enable Git LFS" : "Install and enable LFS"}</button>
          </div>
        </ToolCard>
      </div>

      {(message || error) ? <div className={`mt-4 rounded-lg border px-4 py-3 text-xs ${error ? "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--color-danger)]" : "border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-text-primary)]"}`}>{error ? String(error) : message}</div> : null}
      {pending ? <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[var(--color-text-muted)]"><span className="flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Installing into your user profile. This can take several minutes.</span>{installGit.isPending || installLfs.isPending ? <button type="button" onClick={() => void gitApi.cancelToolchainInstall()} className="giteye-btn">Cancel</button> : null}</div> : null}
      {onDeferLfs ? <div className="mt-6 text-center"><button type="button" disabled={pending} onClick={onDeferLfs} className="text-xs text-[var(--color-text-muted)] underline-offset-4 hover:text-[var(--color-text-primary)] hover:underline">Continue without Git LFS</button></div> : null}
    </div>
  );
}

function ToolCard({ icon, title, ready, detail, children }: { icon: React.ReactNode; title: string; ready: boolean; detail: string; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]"><header className="flex items-center gap-3 border-b border-[var(--color-border-muted)] px-4 py-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-bg-surface)] text-[var(--color-accent)]">{icon}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${ready ? "bg-[var(--color-success)]/10 text-[var(--color-success)]" : "bg-[var(--color-warning)]/10 text-[var(--color-warning)]"}`}>{ready ? <Check className="h-2.5 w-2.5" /> : null}{ready ? "Ready" : "Missing"}</span></div><p className="truncate text-[11px] text-[var(--color-text-muted)]">{detail}</p></div></header><div className="p-4">{children}</div></section>;
}

function ToolchainShell({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_top,var(--color-bg-surface),var(--color-bg-primary)_55%)] px-5 py-10 text-[var(--color-text-primary)]">{children}</main>;
}

function ToolchainLoading() {
  return <ToolchainShell><div className="text-center"><RefreshCw className="mx-auto h-6 w-6 animate-spin text-[var(--color-accent)]" /><p className="mt-3 text-sm text-[var(--color-text-muted)]">Checking Git and Git LFS...</p></div></ToolchainShell>;
}

function platformLabel(platform: string) {
  if (platform === "windows") return "Windows";
  if (platform === "macos") return "macOS";
  if (platform === "linux") return "Linux";
  return platform;
}
