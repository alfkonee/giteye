import { useMutation, useQuery } from "@tanstack/react-query";
import { getIdentifier, getName, getTauriVersion, getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Copy, ExternalLink, Info } from "lucide-react";
import { gitActionErrorMessage, gitQueries } from "../../lib/git-data";
import { gitApi } from "../../lib/tauri-api";
import { Button } from "../ui";

const PROJECT_URL = "https://github.com/alfkonee/giteye";
const LINKS = [
  { label: "Source code", url: PROJECT_URL },
  { label: "Release notes", url: `${PROJECT_URL}/releases` },
  { label: "Report an issue", url: `${PROJECT_URL}/issues/new/choose` },
];

export function AboutSettings() {
  const native = isTauri();
  const metadata = useQuery({
    queryKey: ["app-info"],
    queryFn: async () => {
      const [name, version, tauriVersion, identifier, commit] = await Promise.all([
        getName(), getVersion(), getTauriVersion(), getIdentifier(), gitApi.getAppBuildCommit(),
      ]);
      return { name, version, tauriVersion, identifier, commit };
    },
    enabled: native,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const toolchain = useQuery({ ...gitQueries.toolchainStatus(), enabled: native });
  const app = metadata.data;
  const tools = toolchain.data;
  const unavailable = "Unavailable";
  const loading = "Loading…";
  const platform = tools?.platform === "macos" ? "macOS"
    : tools?.platform === "windows" ? "Windows"
      : tools?.platform === "linux" ? "Linux" : tools?.platform;
  const details = [
    ["Version", app?.version ?? (metadata.isLoading ? loading : unavailable)],
    ["Build commit", app?.commit ?? (metadata.isLoading ? loading : unavailable)],
    ["Release channel", app ? (app.version.includes("-") ? "Pre-release" : "Stable") : unavailable],
    ["Application ID", app?.identifier ?? unavailable],
    ["Operating system", platform ?? (toolchain.isLoading ? loading : unavailable)],
    ["Tauri runtime", app?.tauriVersion ?? unavailable],
    ["Git", tools ? (tools.git.version ?? "Not installed") : (toolchain.isLoading ? loading : unavailable)],
    ["Git LFS", tools ? (tools.lfs.version ?? "Not installed") : (toolchain.isLoading ? loading : unavailable)],
  ];
  const copy = useMutation({
    mutationFn: () => navigator.clipboard.writeText([
      app?.name ?? "GitEye",
      ...details.map(([label, value]) => `${label}: ${value}`),
    ].join("\n")),
  });
  const link = useMutation({ mutationFn: (url: string) => openUrl(url) });

  return (
    <section aria-labelledby="about-giteye-title" className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
      <div className="flex items-start gap-4 border-b border-[var(--color-border-muted)] p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
          <Info className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 id="about-giteye-title" className="text-lg font-semibold text-[var(--color-text-primary)]">About {app?.name ?? "GitEye"}</h3>
          <p className="mt-1 text-[13px] text-[var(--color-text-secondary)]">A desktop Git client for repositories, worktrees, and pull request reviews.</p>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">Built with Tauri, Rust, React, and TypeScript.</p>
        </div>
      </div>
      {!native && <p className="px-5 pt-4 text-xs text-[var(--color-text-muted)]">Running app details are available in the GitEye desktop app.</p>}
      {metadata.isError && <div className="flex flex-wrap items-center gap-3 px-5 pt-4">
        <p role="alert" className="text-xs text-[var(--color-danger)]">Unable to load app details: {gitActionErrorMessage(metadata.error)}</p>
        <Button variant="secondary" size="sm" disabled={metadata.isFetching} onClick={() => void metadata.refetch()}>Retry app details</Button>
      </div>}
      {toolchain.isError && <div className="flex flex-wrap items-center gap-3 px-5 pt-4">
        <p role="alert" className="text-xs text-[var(--color-danger)]">Unable to load Git details: {gitActionErrorMessage(toolchain.error)}</p>
        <Button variant="secondary" size="sm" disabled={toolchain.isFetching} onClick={() => void toolchain.refetch()}>Retry Git details</Button>
      </div>}
      <dl className="divide-y divide-[var(--color-border-muted)] px-5 py-2">
        {details.map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 py-3 text-[13px]">
          <dt className="text-[var(--color-text-muted)]">{label}</dt>
          <dd className="break-words font-mono text-[var(--color-text-primary)]">{value}</dd>
        </div>)}
      </dl>
      <div className="space-y-4 border-t border-[var(--color-border-muted)] p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" disabled={!app || copy.isPending || toolchain.isLoading} onClick={() => copy.mutate()}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />Copy app details
          </Button>
          {copy.isSuccess && <span role="status" className="text-xs text-[var(--color-text-muted)]">App details copied.</span>}
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">Include these details in a bug report. Repository paths, account details, and credentials are not included.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-3">
          {LINKS.map(({ label, url }) => <a key={url} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)] underline-offset-4 hover:underline" onClick={(event) => {
            if (native) {
              event.preventDefault();
              link.mutate(url);
            }
          }}>
            {label}<ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>)}
        </div>
        {copy.isError && <p role="alert" className="text-xs text-[var(--color-danger)]">Unable to copy app details: {gitActionErrorMessage(copy.error)}</p>}
        {link.isError && <p role="alert" className="text-xs text-[var(--color-danger)]">Unable to open link: {gitActionErrorMessage(link.error)}</p>}
      </div>
    </section>
  );
}
