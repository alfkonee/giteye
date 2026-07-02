import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FileText, KeyRound, Monitor, Moon, ShieldCheck, Sun, User } from "lucide-react";
import { useAppStore } from "../../stores/app-store";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { cn } from "../../lib/cn";
import type { SshKey } from "../../types/git";

export function SettingsPlaceholder() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const diffMode = useAppStore((s) => s.diffMode);
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const queryClient = useQueryClient();
  const { data: gitIdentity, isLoading: identityLoading, error: identityError } = useQuery(gitQueries.gitIdentity(activeRepoPath));
  const setGitIdentity = useMutation(gitMutations.setGitIdentity(queryClient, activeRepoPath));
  const { data: credentialConfig, isLoading: credentialLoading, error: credentialError } = useQuery(gitQueries.gitCredentialConfig(activeRepoPath));
  const saveCredentialHelperMutation = useMutation(gitMutations.setGitCredentialHelper(queryClient, activeRepoPath));
  const { data: sshStatus, isLoading: sshLoading, error: sshError } = useQuery(gitQueries.sshStatus());
  const generateSshKey = useMutation(gitMutations.generateSshKey(queryClient));
  const addSshKeyToAgent = useMutation(gitMutations.addSshKeyToAgent(queryClient));
  const [localName, setLocalName] = useState("");
  const [localEmail, setLocalEmail] = useState("");
  const [credentialHelper, setCredentialHelperInput] = useState("");
  const [sshKeyName, setSshKeyName] = useState("id_giteye");
  const [sshKeyComment, setSshKeyComment] = useState("");
  const [copiedSshKey, setCopiedSshKey] = useState<string | null>(null);
  const setDiffMode = useAppStore((s) => s.setDiffMode);

  const isDark = theme === "dark";
  const identityPending = identityLoading || setGitIdentity.isPending;
  const identityErrorText = identityError ?? setGitIdentity.error;
  const credentialPending = credentialLoading || saveCredentialHelperMutation.isPending;
  const credentialErrorText = credentialError ?? saveCredentialHelperMutation.error;
  const sshPending = sshLoading || generateSshKey.isPending || addSshKeyToAgent.isPending;
  const sshErrorText = sshError ?? generateSshKey.error ?? addSshKeyToAgent.error;

  useEffect(() => {
    setLocalName(gitIdentity?.localName ?? "");
    setLocalEmail(gitIdentity?.localEmail ?? "");
  }, [gitIdentity?.localEmail, gitIdentity?.localName]);

  useEffect(() => {
    setCredentialHelperInput(credentialConfig?.localHelpers[0] ?? "");
  }, [credentialConfig?.localHelpers]);

  const saveIdentity = () => {
    setGitIdentity.mutate({ name: localName.trim() || null, email: localEmail.trim() || null });
  };

  const clearIdentity = () => {
    setLocalName("");
    setLocalEmail("");
    setGitIdentity.mutate({ name: null, email: null });
  };

  const saveCredentialHelper = () => {
    saveCredentialHelperMutation.mutate(credentialHelper.trim() || null);
  };

  const clearCredentialHelper = () => {
    setCredentialHelperInput("");
    saveCredentialHelperMutation.mutate(null);
  };

  const createSshKey = () => {
    generateSshKey.mutate({ name: sshKeyName.trim(), comment: sshKeyComment.trim() || null });
  };

  const copyPublicSshKey = (key: SshKey) => {
    if (!key.publicKey) {
      return;
    }
    void navigator.clipboard.writeText(key.publicKey).then(() => setCopiedSshKey(key.name));
  };

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-primary)]">
      <div className="flex h-11 items-center border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4">
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Settings</h2>
          <p className="text-[11px] text-[var(--color-text-muted)]">Application preferences</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-2xl space-y-5">
          <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
            <SettingsHeader
              icon={<Monitor className="h-4 w-4" />}
              title="Appearance"
              description="Tune the desktop shell for your environment. Theme and diff mode are saved automatically."
            />
            <div className="divide-y divide-[var(--color-border-muted)]">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-bg-surface)] text-[var(--color-text-muted)]">
                    {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-[var(--color-text-primary)]">Theme</div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">
                      {isDark ? "Dark interface enabled" : "Light interface enabled"}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-0.5">
                  <ThemeButton active={theme === "light"} onClick={() => setTheme("light")} icon={<Sun className="h-3.5 w-3.5" />}>
                    Light
                  </ThemeButton>
                  <ThemeButton active={theme === "dark"} onClick={() => setTheme("dark")} icon={<Moon className="h-3.5 w-3.5" />}>
                    Dark
                  </ThemeButton>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <div className="text-[13px] font-medium text-[var(--color-text-primary)]">Diff Mode</div>
                  <div className="text-[11px] text-[var(--color-text-muted)]">Default viewer presentation</div>
                </div>
                <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-0.5">
                  <ThemeButton active={diffMode === "unified"} onClick={() => setDiffMode("unified")} icon={<FileText className="h-3.5 w-3.5" />}>
                    Unified
                  </ThemeButton>
                  <ThemeButton active={diffMode === "split"} onClick={() => setDiffMode("split")} icon={<Monitor className="h-3.5 w-3.5" />}>
                    Split
                  </ThemeButton>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
            <SettingsHeader
              icon={<User className="h-4 w-4" />}
              title="Identity"
              description="Git author information for commits."
            />
            <div className="space-y-4 px-4 py-3 text-[12px]">
              {!activeRepoPath ? (
                <p className="text-[var(--color-text-muted)]">Open a repository to inspect and edit its local Git identity.</p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">Local user.name</span>
                      <input value={localName} onChange={(event) => setLocalName(event.target.value)} placeholder={gitIdentity?.globalName ?? "Global name not set"} className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2 py-1.5 text-[12px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">Local user.email</span>
                      <input value={localEmail} onChange={(event) => setLocalEmail(event.target.value)} placeholder={gitIdentity?.globalEmail ?? "Global email not set"} className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2 py-1.5 text-[12px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]" />
                    </label>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
                    Effective author: <span className="text-[var(--color-text-secondary)]">{gitIdentity?.effectiveName ?? "unset"}</span> · <span className="text-[var(--color-text-secondary)]">{gitIdentity?.effectiveEmail ?? "unset"}</span>
                  </div>
                  {identityErrorText ? <p className="text-[var(--color-danger)]">{String(identityErrorText)}</p> : null}
                  <div className="flex justify-end gap-2">
                    <button disabled={identityPending} onClick={clearIdentity} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50">Use global</button>
                    <button disabled={identityPending} onClick={saveIdentity} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Save local identity</button>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
            <SettingsHeader
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Credential Helper"
              description="Git credential helper config for HTTPS remotes."
            />
            <div className="space-y-4 px-4 py-3 text-[12px]">
              {!activeRepoPath ? (
                <p className="text-[var(--color-text-muted)]">Open a repository to inspect and edit its local credential helper.</p>
              ) : (
                <>
                  <label className="space-y-1">
                    <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">Local credential.helper</span>
                    <input value={credentialHelper} onChange={(event) => setCredentialHelperInput(event.target.value)} placeholder={credentialConfig?.globalHelpers[0] ?? "cache --timeout=3600"} className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2 py-1.5 text-[12px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]" />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {["cache --timeout=3600", "store", "libsecret", "manager-core"].map((helper) => (
                      <button key={helper} type="button" onClick={() => setCredentialHelperInput(helper)} className="rounded-full border border-[var(--color-border-muted)] px-2 py-1 font-mono text-[11px] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)]">
                        {helper}
                      </button>
                    ))}
                  </div>
                  <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
                    Effective helper: <span className="font-mono text-[var(--color-text-secondary)]">{credentialConfig?.effectiveHelpers.join(", ") || "unset"}</span>
                    <span className="mx-2">·</span>
                    Global: <span className="font-mono text-[var(--color-text-secondary)]">{credentialConfig?.globalHelpers.join(", ") || "unset"}</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)]">Shell-command helpers beginning with <span className="font-mono">!</span> are rejected. GitEye does not display or store credential secrets.</p>
                  {credentialErrorText ? <p className="text-[var(--color-danger)]">{String(credentialErrorText)}</p> : null}
                  <div className="flex justify-end gap-2">
                    <button disabled={credentialPending} onClick={clearCredentialHelper} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50">Use global</button>
                    <button disabled={credentialPending} onClick={saveCredentialHelper} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Save helper</button>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
            <SettingsHeader
              icon={<KeyRound className="h-4 w-4" />}
              title="SSH Keys"
              description="Local keys used by git remotes and GitHub SSH authentication."
            />
            <div className="space-y-4 px-4 py-3 text-[12px]">
              <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
                Directory: <span className="text-[var(--color-text-secondary)]">{sshStatus?.sshDir ?? "~/.ssh"}</span>
                <span className="mx-2">·</span>
                ssh-keygen: <span className={sshStatus?.sshKeygenAvailable ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}>{sshStatus?.sshKeygenAvailable ? "available" : "missing"}</span>
                <span className="mx-2">·</span>
                agent: <span className={sshStatus?.agentAvailable ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}>{sshStatus?.agentAvailable ? `${sshStatus.agentIdentities.length} loaded` : "unavailable"}</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <label className="space-y-1">
                  <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">Key filename</span>
                  <input value={sshKeyName} onChange={(event) => setSshKeyName(event.target.value)} placeholder="id_giteye" className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2 py-1.5 text-[12px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]" />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">Comment</span>
                  <input value={sshKeyComment} onChange={(event) => setSshKeyComment(event.target.value)} placeholder="name@example.com" className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2 py-1.5 text-[12px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]" />
                </label>
                <button disabled={sshPending || !sshStatus?.sshKeygenAvailable || !sshKeyName.trim()} onClick={createSshKey} className="self-end rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Generate</button>
              </div>

              {sshStatus?.agentError ? <p className="text-[var(--color-warning)]">{sshStatus.agentError}</p> : null}
              {sshErrorText ? <p className="text-[var(--color-danger)]">{String(sshErrorText)}</p> : null}

              <div className="space-y-2">
                {sshLoading ? <p className="text-[var(--color-text-muted)]">Inspecting SSH keys…</p> : null}
                {!sshLoading && sshStatus?.keys.length === 0 ? <p className="text-[var(--color-text-muted)]">No public SSH keys found.</p> : null}
                {sshStatus?.keys.map((key) => (
                  <SshKeyCard
                    key={key.publicKeyPath}
                    keyItem={key}
                    pending={sshPending}
                    copied={copiedSshKey === key.name}
                    onAddToAgent={() => addSshKeyToAgent.mutate(key.name)}
                    onCopyPublicKey={() => copyPublicSshKey(key)}
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
            <SettingsHeader
              icon={<FileText className="h-4 w-4" />}
              title="Git"
              description="Command-line integration."
            />
            <div className="px-4 py-3 text-[12px] text-[var(--color-text-muted)]">
              GitEye uses git from your system PATH.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SshKeyCard({
  keyItem,
  pending,
  copied,
  onAddToAgent,
  onCopyPublicKey,
}: {
  keyItem: SshKey;
  pending: boolean;
  copied: boolean;
  onAddToAgent: () => void;
  onCopyPublicKey: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px] font-semibold text-[var(--color-text-primary)]">{keyItem.name}</span>
            {keyItem.loadedInAgent ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-success)]">
                <ShieldCheck className="h-3 w-3" />
                agent
              </span>
            ) : null}
            {keyItem.keyType ? <span className="text-[10px] uppercase text-[var(--color-text-muted)]">{keyItem.keyType}</span> : null}
          </div>
          <div className="mt-1 truncate text-[11px] text-[var(--color-text-muted)]">{keyItem.fingerprint ?? "Fingerprint unavailable"}</div>
          <div className="truncate text-[11px] text-[var(--color-text-muted)]">{keyItem.comment ?? keyItem.publicKeyPath}</div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button disabled={pending || !keyItem.hasPrivateKey || keyItem.loadedInAgent} onClick={onAddToAgent} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50">
            Add to agent
          </button>
          <button disabled={!keyItem.publicKey} onClick={onCopyPublicKey} className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50">
            <Copy className="h-3 w-3" />
            {copied ? "Copied" : "Copy public key"}
          </button>
        </div>
      </div>
      {keyItem.publicKey ? (
        <textarea readOnly value={keyItem.publicKey} rows={2} className="w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-2 py-1.5 font-mono text-[11px] text-[var(--color-text-muted)] outline-none" />
      ) : null}
    </div>
  );
}

function SettingsHeader({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--color-border-muted)] px-4 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-bg-surface)] text-[var(--color-accent)]">
        {icon}
      </div>
      <div>
        <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)]">{title}</h3>
        <p className="text-[11px] text-[var(--color-text-muted)]">{description}</p>
      </div>
    </div>
  );
}

function ThemeButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
        active
          ? "bg-[var(--color-accent)] text-white shadow-sm"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      )}
    >
      {icon}
      {children}
    </button>
  );
}
