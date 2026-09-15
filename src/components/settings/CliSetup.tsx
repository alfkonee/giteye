import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Button } from "../ui";
import { cliLauncherApi } from "../../lib/cli-launcher-api";
import { gitActionErrorMessage } from "../../lib/git-data";
import { gitApi } from "../../lib/tauri-api";

const CLI_STATUS_KEY = ["cli-launcher-status"] as const;
const APP_SETTINGS_KEY = ["app-settings"] as const;

async function rememberCliSetup(queryClient: QueryClient) {
  const settings = await gitApi.rememberCliSetup();
  queryClient.setQueryData(APP_SETTINGS_KEY, settings);
}

export function CliSetupControls({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: CLI_STATUS_KEY,
    queryFn: cliLauncherApi.status,
    enabled: isTauri(),
    retry: false,
  });
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const operation = useMutation({
    mutationFn: (action: "install" | "uninstall") => cliLauncherApi[action](),
    onSuccess: async (result) => {
      queryClient.setQueryData(CLI_STATUS_KEY, result);
      try {
        await rememberCliSetup(queryClient);
        setPreferenceError(null);
      } catch (error) {
        setPreferenceError(`CLI setup succeeded, but the first-run preference could not be saved: ${gitActionErrorMessage(error)}`);
      }
    },
  });
  const result = status.data;
  const error = operation.error ?? status.error;

  return (
    <section className={compact ? "space-y-3" : "giteye-card space-y-3 p-4"} aria-label="Command-line launcher">
      {!compact && <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Command-line launcher</h3>}
      <p className="text-xs text-[var(--color-text-muted)]">
        Open repositories with <code>giteye .</code> from a terminal. Installation is optional and only writes a launcher in your user directory. PATH and shell profiles are never changed automatically.
      </p>
      {result && <p className="break-all font-mono text-xs text-[var(--color-text-muted)]">{result.path}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={!isTauri() || operation.isPending || status.isPending} onClick={() => operation.mutate("install")}>
          {operation.isPending && operation.variables === "install" ? "Installing…" : result?.installed ? "Reinstall CLI" : "Install CLI"}
        </Button>
        {result?.installed && <Button variant="secondary" size="sm" disabled={operation.isPending} onClick={() => operation.mutate("uninstall")}>
          {operation.isPending && operation.variables === "uninstall" ? "Removing…" : "Remove CLI"}
        </Button>}
      </div>
      {result && <p className="whitespace-pre-wrap break-words text-xs text-[var(--color-text-muted)]">{result.instructions}</p>}
      {error != null && <p role="alert" className="text-xs text-[var(--color-danger)]">{gitActionErrorMessage(error)}</p>}
      {preferenceError && <p role="alert" className="text-xs text-[var(--color-danger)]">{preferenceError}</p>}
    </section>
  );
}

/** A non-modal first-run offer never competes with Git toolchain/recovery dialogs. */
export function CliSetupOffer() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: APP_SETTINGS_KEY,
    queryFn: gitApi.getAppSettings,
    enabled: isTauri(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const status = useQuery({
    queryKey: CLI_STATUS_KEY,
    queryFn: cliLauncherApi.status,
    enabled: isTauri(),
    retry: false,
  });
  const [visible, setVisible] = useState<boolean | null>(null);
  const dismiss = useMutation({
    mutationFn: () => rememberCliSetup(queryClient),
    onSuccess: () => setVisible(false),
  });

  useEffect(() => {
    if (visible !== null || !settings.data || status.isPending) return;
    setVisible(!settings.data.cliSetupPrompted && !status.data?.installed);
  }, [settings.data, status.data, status.isPending, visible]);

  if (!isTauri() || !visible) return null;
  return (
    <aside className="giteye-surface-elevated fixed bottom-4 left-4 z-40 max-h-[70vh] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-xl p-4 shadow-2xl" aria-labelledby="cli-setup-offer-title">
      <h2 id="cli-setup-offer-title" className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">Use GitEye from your terminal?</h2>
      <CliSetupControls compact />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-[var(--color-text-muted)]">You can set this up later in Settings → General.</span>
        <Button variant="secondary" size="sm" disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>
          {status.data?.installed ? "Done" : "Not now"}
        </Button>
      </div>
      {dismiss.error != null && <p role="alert" className="mt-2 text-xs text-[var(--color-danger)]">{gitActionErrorMessage(dismiss.error)}</p>}
    </aside>
  );
}
