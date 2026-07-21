import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Copy, FileText, KeyRound, Monitor, Moon, ShieldCheck, Sun, User, Trash2, Radio, Download, Upload } from "lucide-react";
import { useAppStore } from "../../stores/app-store";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { gitApi, type AiProvider } from "../../lib/tauri-api";
import { cn } from "../../lib/cn";
import type { SshKey } from "../../types/git";
import { AiModelCombobox } from "./AiModelCombobox";

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
  const { data: aiConfig, isLoading: aiLoading, error: aiError } = useQuery(gitQueries.aiConfig());
  const saveAiConfig = useMutation(gitMutations.saveAiConfig(queryClient));
  const generateSshKey = useMutation(gitMutations.generateSshKey(queryClient));
  const addSshKeyToAgent = useMutation(gitMutations.addSshKeyToAgent(queryClient));
  const [localName, setLocalName] = useState("");
  const [localEmail, setLocalEmail] = useState("");
  const [credentialHelper, setCredentialHelperInput] = useState("");
  const [aiProvider, setAiProvider] = useState<AiProvider>("openai");
  const [aiModel, setAiModel] = useState("");
  const [aiEndpoint, setAiEndpoint] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiApiKeyRevision, setAiApiKeyRevision] = useState(0);
  const [sshKeyName, setSshKeyName] = useState("id_giteye");
  const [sshKeyComment, setSshKeyComment] = useState("");
  const [copiedSshKey, setCopiedSshKey] = useState<string | null>(null);
  const [authTestResult, setAuthTestResult] = useState<{ success: boolean; remote: string; message: string } | null>(null);
  const setDiffMode = useAppStore((s) => s.setDiffMode);

  const testAuthMutation = useMutation({
    mutationFn: () => gitApi.testGitAuthentication(activeRepoPath!, null),
    onSuccess: (result) => setAuthTestResult(result),
    onError: () => setAuthTestResult({ success: false, remote: "origin", message: "Unable to test authentication. Check your network connection." }),
  });

  const clearCredentialCacheMutation = useMutation({
    mutationFn: () => gitApi.clearCredentialCache(activeRepoPath!, null),
    onSuccess: (message) => setAuthTestResult({ success: true, remote: "", message }),
  });

  const [exportImportMessage, setExportImportMessage] = useState<string | null>(null);
  const exportMutation = useMutation({
    mutationFn: async () => {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const filePath = await save({
        title: "Export GitEye Settings",
        defaultPath: "giteye-settings.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath) return;
      return gitApi.exportSettings(filePath, theme, diffMode);
    },
    onSuccess: (result) => setExportImportMessage(result ?? null),
    onError: (error) => setExportImportMessage(`Export failed: ${error}`),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        title: "Import GitEye Settings",
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });
      if (!selected) return null;
      const filePath = typeof selected === "string" ? selected : selected[0];
      const bundle = await gitApi.importSettings(filePath);
      return bundle;
    },
    onSuccess: (bundle) => {
      if (!bundle) return;
      if (bundle.theme) setTheme(bundle.theme as "dark" | "light");
      if (bundle.diffMode) setDiffMode(bundle.diffMode as "unified" | "split");
      void queryClient.invalidateQueries({ queryKey: ["git", "recent-repositories"] });
      void queryClient.invalidateQueries({ queryKey: ["git", "favorite-repositories"] });
      setExportImportMessage("Settings imported successfully. Restart any open repositories to apply all changes.");
    },
    onError: (error) => setExportImportMessage(`Import failed: ${error}`),
  });

  const isDark = theme === "dark";
  const identityPending = identityLoading || setGitIdentity.isPending;
  const identityErrorText = identityError ?? setGitIdentity.error;
  const credentialPending = credentialLoading || saveCredentialHelperMutation.isPending;
  const credentialErrorText = credentialError ?? saveCredentialHelperMutation.error;
  const aiPending = aiLoading || saveAiConfig.isPending;
  const aiErrorText = aiError ?? saveAiConfig.error;
  const sshPending = sshLoading || generateSshKey.isPending || addSshKeyToAgent.isPending;
  const sshErrorText = sshError ?? generateSshKey.error ?? addSshKeyToAgent.error;
  const aiProviders = aiConfig?.providers ?? [
    { id: "openai" as const, label: "OpenAI", defaultEndpoint: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini", models: ["gpt-4o-mini"] },
    { id: "claude" as const, label: "Claude", defaultEndpoint: "https://api.anthropic.com/v1", defaultModel: "claude-sonnet-4-20250514", models: ["claude-sonnet-4-20250514"] },
    { id: "deepseek" as const, label: "DeepSeek", defaultEndpoint: "https://api.deepseek.com", defaultModel: "deepseek-chat", models: ["deepseek-chat", "deepseek-reasoner"] },
    { id: "openrouter" as const, label: "OpenRouter", defaultEndpoint: "https://openrouter.ai/api/v1", defaultModel: "openai/gpt-4o-mini", models: ["openai/gpt-4o-mini"] },
  ];
  const selectedAiProvider = aiProviders.find((provider) => provider.id === aiProvider) ?? aiProviders[0];
  const aiModelRequest = selectedAiProvider
    ? {
        provider: aiProvider,
        endpoint: aiEndpoint.trim() || selectedAiProvider.defaultEndpoint,
        apiKey: aiApiKey.trim() || null,
      }
    : null;
  const aiModelsQuery = useQuery(
    gitQueries.aiModels(
      aiModelRequest,
      aiConfig?.apiKeySource ?? null,
      aiApiKeyRevision,
    ),
  );
  const aiModelList =
    aiModelsQuery.data?.models ??
    selectedAiProvider.models.map((model) => ({
      id: model,
      label: model,
      contextLength: null,
    }));

  useEffect(() => {
    setLocalName(gitIdentity?.localName ?? "");
    setLocalEmail(gitIdentity?.localEmail ?? "");
  }, [gitIdentity?.localEmail, gitIdentity?.localName]);

  useEffect(() => {
    setCredentialHelperInput(credentialConfig?.localHelpers[0] ?? "");
  }, [credentialConfig?.localHelpers]);

  useEffect(() => {
    if (!aiConfig) return;
    setAiProvider(aiConfig.provider);
    setAiModel(aiConfig.model);
    setAiEndpoint(aiConfig.endpoint);
    setAiApiKey("");
  }, [aiConfig]);

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

  const chooseAiProvider = (provider: AiProvider) => {
    const nextProvider = aiProviders.find((option) => option.id === provider);
    if (!nextProvider) return;
    setAiProvider(provider);
    setAiModel(nextProvider.defaultModel);
    setAiEndpoint(nextProvider.defaultEndpoint);
    setAiApiKey("");
  };

  const saveAiProviderSettings = () => {
    saveAiConfig.mutate({
      provider: aiProvider,
      model: aiModel.trim(),
      endpoint: aiEndpoint.trim() || null,
      apiKey: aiApiKey.trim() ? aiApiKey.trim() : null,
    });
  };

  const clearStoredAiKey = () => {
    saveAiConfig.mutate({
      provider: aiProvider,
      model: aiModel.trim(),
      endpoint: aiEndpoint.trim() || null,
      apiKey: "",
    });
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
    <div className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg-primary)]">
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
              icon={<Bot className="h-4 w-4" />}
              title="AI Provider"
              description="Choose the backend provider for commit messages and conflict resolution."
            />
            <div className="space-y-4 px-4 py-3 text-[12px]">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">Provider</span>
                  <select
                    value={aiProvider}
                    onChange={(event) => chooseAiProvider(event.target.value as AiProvider)}
                    className="giteye-input w-full text-[12px]"
                  >
                    {aiProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.label}</option>
                    ))}
                  </select>
                </label>
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">Model</span>
                  <AiModelCombobox
                    value={aiModel}
                    onChange={setAiModel}
                    models={aiModelList}
                    isLoading={aiModelsQuery.isFetching}
                    warning={aiModelsQuery.data?.warning ?? (aiModelsQuery.error ? String(aiModelsQuery.error) : null)}
                    placeholder={selectedAiProvider.defaultModel}
                    onRefresh={() => void aiModelsQuery.refetch()}
                    disabled={aiPending}
                  />
                </div>
              </div>

              <label className="space-y-1">
                <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">Base URL</span>
                <input value={aiEndpoint} onChange={(event) => setAiEndpoint(event.target.value)} placeholder={selectedAiProvider.defaultEndpoint} className="giteye-input w-full text-[12px]" />
              </label>

              <label className="space-y-1">
                <span className="text-[11px] font-medium text-[var(--color-text-secondary)]">API key</span>
                <input
                  type="password"
                  value={aiApiKey}
                  onChange={(event) => {
                    setAiApiKey(event.target.value);
                    setAiApiKeyRevision((revision) => revision + 1);
                  }}
                  placeholder={
                    aiConfig?.apiKeySource === "environment"
                      ? "Configured via environment"
                      : aiConfig?.apiKeySource === "stored"
                      ? "Configured — leave blank to keep current key"
                      : "Paste provider API key"
                  }
                  className="giteye-input w-full text-[12px]"
                />
              </label>

              <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
                Active: <span className="text-[var(--color-text-secondary)]">{aiProviders.find((provider) => provider.id === aiConfig?.provider)?.label ?? "OpenAI"} · {aiConfig?.model ?? "gpt-4o-mini"}</span>
                <span className="mx-2">·</span>
                API key: <span className="text-[var(--color-text-secondary)]">{aiConfig?.apiKeySource ?? "missing"}</span>
              </div>
              {aiErrorText ? <p className="text-[var(--color-danger)]">{String(aiErrorText)}</p> : null}
              <div className="flex justify-end gap-2">
                <button disabled={aiPending || aiConfig?.apiKeySource !== "stored"} onClick={clearStoredAiKey} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50">Clear stored key</button>
                <button disabled={aiPending} onClick={saveAiProviderSettings} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saveAiConfig.isPending ? "Saving…" : "Save AI settings"}</button>
              </div>
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
              icon={<Download className="h-4 w-4" />}
              title="Export / Import"
              description="Back up and restore your GitEye settings."
            />
            <div className="space-y-4 px-4 py-3 text-[12px]">
              <p className="text-[var(--color-text-secondary)]">
                Export settings includes your theme, diff mode preferences, AI provider/model/base URL, recent repositories, and favorites. API keys, SSH private keys, and credential secrets are never exported.
              </p>
              {exportImportMessage ? (
                <div className="rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-3 text-[11px] text-[var(--color-accent)]">
                  {exportImportMessage}
                </div>
              ) : null}
              <div className="flex gap-2">
                <button
                  disabled={exportMutation.isPending || importMutation.isPending}
                  onClick={() => { setExportImportMessage(null); exportMutation.mutate(); }}
                  className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {exportMutation.isPending ? "Exporting…" : "Export Settings"}
                </button>
                <button
                  disabled={exportMutation.isPending || importMutation.isPending}
                  onClick={() => { setExportImportMessage(null); importMutation.mutate(); }}
                  className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {importMutation.isPending ? "Importing…" : "Import Settings"}
                </button>
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
                  {authTestResult ? (
                    <div className={cn("rounded-lg border p-3 text-[11px]", authTestResult.success ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/5 text-[var(--color-success)]" : "border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 text-[var(--color-warning)]")}>
                      {authTestResult.message}
                    </div>
                  ) : null}
                  {credentialErrorText ? <p className="text-[var(--color-danger)]">{String(credentialErrorText)}</p> : null}
                  <div className="flex justify-between gap-2">
                    <div className="flex gap-2">
                      <button
                        disabled={credentialPending || testAuthMutation.isPending || !activeRepoPath}
                        onClick={() => { setAuthTestResult(null); testAuthMutation.mutate(); }}
                        className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                        title="Attempt a silent remote authentication check"
                      >
                        <Radio className="h-3.5 w-3.5" />
                        {testAuthMutation.isPending ? "Testing…" : "Test Auth"}
                      </button>
                      <button
                        disabled={credentialPending || clearCredentialCacheMutation.isPending || !activeRepoPath}
                        onClick={() => { setAuthTestResult(null); clearCredentialCacheMutation.mutate(); }}
                        className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[12px] text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Clear cached credentials for the origin remote host"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {clearCredentialCacheMutation.isPending ? "Clearing…" : "Clear Cache"}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button disabled={credentialPending} onClick={clearCredentialHelper} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[12px] text-[var(--color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50">Use global</button>
                      <button disabled={credentialPending} onClick={saveCredentialHelper} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Save helper</button>
                    </div>
                  </div>
                </>
              )}
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
