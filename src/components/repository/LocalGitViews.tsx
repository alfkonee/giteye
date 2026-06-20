import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Globe2, HardDrive, Plus, RefreshCw, Tag as TagIcon, Trash2, UploadCloud, DownloadCloud } from "lucide-react";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { useAppStore } from "../../stores/app-store";
import type { GitTag, LfsTrackPattern, Remote, StashEntry } from "../../types/git";

function formatRelativeTime(value: string | null) {
  if (!value) return "—";

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) return "just now";

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d ago`;
}

function errorMessage(error: unknown) {
  if (!error) return null;
  return error instanceof Error ? error.message : String(error);
}

function Header({ icon, title, detail, action }: { icon: ReactNode; title: string; detail: string; action?: ReactNode }) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)] text-[var(--color-accent)]">
          {icon}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-[var(--color-text-primary)]">{title}</h1>
          <p className="truncate text-sm text-[var(--color-text-secondary)]">{detail}</p>
        </div>
      </div>
      {action}
    </header>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-text-muted)]">{message}</div>;
}

function ActionButton({ children, disabled, onClick, tone = "default" }: { children: ReactNode; disabled?: boolean; onClick: () => void; tone?: "default" | "danger" | "primary" }) {
  const toneClass = tone === "primary"
    ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white hover:opacity-90"
    : tone === "danger"
      ? "border-[color:rgba(248,81,73,0.45)] text-[var(--color-danger)] hover:bg-[color:rgba(248,81,73,0.08)]"
      : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      {children}
    </button>
  );
}

export function RemotesView() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const queryClient = useQueryClient();
  const remotesQuery = useQuery(gitQueries.remotes(activeRepoPath));
  const snapshotQuery = useQuery(gitQueries.repositorySnapshot(activeRepoPath));
  const fetchMutation = useMutation(gitMutations.fetch(queryClient, activeRepoPath));
  const pullMutation = useMutation(gitMutations.pull(queryClient, activeRepoPath));
  const pushMutation = useMutation(gitMutations.push(queryClient, activeRepoPath));

  const remotes = remotesQuery.data ?? [];
  const branchName = snapshotQuery.data?.repositoryInfo.currentBranch ?? undefined;
  const isMutating = fetchMutation.isPending || pullMutation.isPending || pushMutation.isPending;
  const error = errorMessage(remotesQuery.error ?? fetchMutation.error ?? pullMutation.error ?? pushMutation.error);

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Header
        icon={<Globe2 className="h-5 w-5" />}
        title="Remotes"
        detail={branchName ? `Current branch: ${branchName}` : "Fetch, pull, and push configured Git remotes."}
        action={<ActionButton disabled={!activeRepoPath || isMutating} onClick={() => fetchMutation.mutate(undefined)}><RefreshCw className="h-3.5 w-3.5" /> Fetch all</ActionButton>}
      />
      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        {error ? <div className="mb-3 rounded-md border border-[color:rgba(248,81,73,0.45)] bg-[color:rgba(248,81,73,0.08)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</div> : null}
        {remotesQuery.isLoading ? <EmptyState message="Loading remotes…" /> : remotes.length === 0 ? <EmptyState message="No Git remotes configured for this repository." /> : (
          <div className="grid gap-3">
            {remotes.map((remote) => (
              <RemoteCard
                key={remote.name}
                remote={remote}
                branchName={branchName}
                disabled={isMutating}
                onFetch={() => fetchMutation.mutate(remote.name)}
                onPull={() => pullMutation.mutate({ remote: remote.name, branch: branchName })}
                onPush={() => pushMutation.mutate({ remote: remote.name, branch: branchName })}
              />
            ))}
          </div>
        )}
      </main>
    </section>
  );
}

function RemoteCard({ remote, branchName, disabled, onFetch, onPull, onPush }: { remote: Remote; branchName?: string; disabled: boolean; onFetch: () => void; onPull: () => void; onPush: () => void }) {
  return (
    <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold"><Globe2 className="h-4 w-4 text-[var(--color-accent)]" />{remote.name}</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2"><dt className="text-[var(--color-text-muted)]">Fetch</dt><dd className="truncate font-mono text-xs text-[var(--color-text-secondary)]">{remote.fetchUrl ?? remote.url}</dd></div>
            <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2"><dt className="text-[var(--color-text-muted)]">Push</dt><dd className="truncate font-mono text-xs text-[var(--color-text-secondary)]">{remote.pushUrl ?? remote.url}</dd></div>
          </dl>
        </div>
        <div className="flex shrink-0 gap-2">
          <ActionButton disabled={disabled} onClick={onFetch}><RefreshCw className="h-3.5 w-3.5" />Fetch</ActionButton>
          <ActionButton disabled={disabled || !branchName} onClick={onPull}><DownloadCloud className="h-3.5 w-3.5" />Pull</ActionButton>
          <ActionButton disabled={disabled || !branchName} onClick={onPush}><UploadCloud className="h-3.5 w-3.5" />Push</ActionButton>
        </div>
      </div>
    </article>
  );
}

export function StashesView() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const queryClient = useQueryClient();
  const stashesQuery = useQuery(gitQueries.stashes(activeRepoPath));
  const createStash = useMutation(gitMutations.createStash(queryClient, activeRepoPath));
  const applyStash = useMutation(gitMutations.applyStash(queryClient, activeRepoPath));
  const popStash = useMutation(gitMutations.popStash(queryClient, activeRepoPath));
  const dropStash = useMutation(gitMutations.dropStash(queryClient, activeRepoPath));
  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(true);

  const stashes = stashesQuery.data ?? [];
  const isMutating = createStash.isPending || applyStash.isPending || popStash.isPending || dropStash.isPending;
  const error = errorMessage(stashesQuery.error ?? createStash.error ?? applyStash.error ?? popStash.error ?? dropStash.error);

  const create = () => {
    createStash.mutate(
      { message: message.trim() || undefined, includeUntracked },
      { onSuccess: () => setMessage("") },
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Header icon={<Archive className="h-5 w-5" />} title="Stashes" detail="Save, apply, pop, and drop local work-in-progress snapshots." />
      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Optional stash message"
              className="min-w-[280px] flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
            />
            <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <input type="checkbox" checked={includeUntracked} onChange={(event) => setIncludeUntracked(event.target.checked)} />
              Include untracked
            </label>
            <ActionButton disabled={!activeRepoPath || isMutating} onClick={create} tone="primary"><Plus className="h-3.5 w-3.5" />Create stash</ActionButton>
          </div>
        </div>
        {error ? <div className="mb-3 rounded-md border border-[color:rgba(248,81,73,0.45)] bg-[color:rgba(248,81,73,0.08)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</div> : null}
        {stashesQuery.isLoading ? <EmptyState message="Loading stashes…" /> : stashes.length === 0 ? <EmptyState message="No stashes in this repository." /> : (
          <div className="grid gap-3">
            {stashes.map((stash) => <StashCard key={stash.name} stash={stash} disabled={isMutating} onApply={() => applyStash.mutate(stash.name)} onPop={() => popStash.mutate(stash.name)} onDrop={() => dropStash.mutate(stash.name)} />)}
          </div>
        )}
      </main>
    </section>
  );
}

function StashCard({ stash, disabled, onApply, onPop, onDrop }: { stash: StashEntry; disabled: boolean; onApply: () => void; onPop: () => void; onDrop: () => void }) {
  return (
    <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"><Archive className="h-4 w-4" />{stash.name} · {formatRelativeTime(stash.timestamp)}</div>
          <h2 className="mt-2 truncate font-semibold">{stash.message || "Stashed changes"}</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{stash.branch ? `${stash.branch} · ` : ""}{stash.shortHash}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <ActionButton disabled={disabled} onClick={onApply}>Apply</ActionButton>
          <ActionButton disabled={disabled} onClick={onPop}>Pop</ActionButton>
          <ActionButton disabled={disabled} onClick={onDrop} tone="danger"><Trash2 className="h-3.5 w-3.5" />Drop</ActionButton>
        </div>
      </div>
    </article>
  );
}

export function TagsView() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const queryClient = useQueryClient();
  const tagsQuery = useQuery(gitQueries.tags(activeRepoPath));
  const createTag = useMutation(gitMutations.createTag(queryClient, activeRepoPath));
  const deleteTag = useMutation(gitMutations.deleteTag(queryClient, activeRepoPath));
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");

  const tags = tagsQuery.data ?? [];
  const isMutating = createTag.isPending || deleteTag.isPending;
  const error = errorMessage(tagsQuery.error ?? createTag.error ?? deleteTag.error);
  const sortedTags = useMemo(() => [...tags].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [tags]);

  const create = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    createTag.mutate(
      { name: trimmedName, target: target.trim() || undefined, message: message.trim() || undefined },
      {
        onSuccess: () => {
          setName("");
          setTarget("");
          setMessage("");
        },
      },
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Header icon={<TagIcon className="h-5 w-5" />} title="Tags" detail="Create lightweight or annotated tags and delete obsolete local tags." />
      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr_auto]">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Tag name" className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]" />
            <input value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Target (default HEAD)" className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]" />
            <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Annotation message (optional)" className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]" />
            <ActionButton disabled={!activeRepoPath || isMutating || !name.trim()} onClick={create} tone="primary"><Plus className="h-3.5 w-3.5" />Create</ActionButton>
          </div>
        </div>
        {error ? <div className="mb-3 rounded-md border border-[color:rgba(248,81,73,0.45)] bg-[color:rgba(248,81,73,0.08)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</div> : null}
        {tagsQuery.isLoading ? <EmptyState message="Loading tags…" /> : sortedTags.length === 0 ? <EmptyState message="No local tags in this repository." /> : (
          <div className="grid gap-3">
            {sortedTags.map((tag) => <TagCard key={tag.name} tag={tag} disabled={isMutating} onDelete={() => { if (window.confirm(`Delete tag ${tag.name}?`)) deleteTag.mutate(tag.name); }} />)}
          </div>
        )}
      </main>
    </section>
  );
}
export function LfsView() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const queryClient = useQueryClient();
  const { data: lfsStatus, isLoading, error } = useQuery(gitQueries.lfsStatus(activeRepoPath));
  const installMutation = useMutation(gitMutations.installLfs(queryClient, activeRepoPath));
  const trackMutation = useMutation(gitMutations.trackLfsPattern(queryClient, activeRepoPath));
  const untrackMutation = useMutation(gitMutations.untrackLfsPattern(queryClient, activeRepoPath));
  const [pattern, setPattern] = useState("");
  const pending = installMutation.isPending || trackMutation.isPending || untrackMutation.isPending;
  const mutationError = installMutation.error ?? trackMutation.error ?? untrackMutation.error;

  const trackPattern = () => {
    const nextPattern = pattern.trim();
    if (!nextPattern) return;
    trackMutation.mutate(nextPattern, { onSuccess: () => setPattern("") });
  };

  return (
    <section className="flex h-full flex-col bg-[var(--color-bg-primary)]">
      <Header
        icon={<HardDrive className="h-4 w-4" />}
        title="Git LFS"
        detail={lfsStatus?.available ? lfsStatus.version ?? "Git LFS available" : "Large file storage status"}
        action={<ActionButton disabled={pending || !activeRepoPath} onClick={() => installMutation.mutate()} tone="primary">Install local hooks</ActionButton>}
      />
      {(error || mutationError || lfsStatus?.error) && (
        <div className="border-b border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-danger)]">
          {errorMessage(error ?? mutationError ?? lfsStatus?.error)}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <EmptyState message="Loading Git LFS status…" />
        ) : !lfsStatus?.available ? (
          <EmptyState message="Git LFS is not available for this repository. Install git-lfs, then install local hooks here." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Tracked patterns</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">Stored in .gitattributes or local attributes.</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={pattern}
                  onChange={(event) => setPattern(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && trackPattern()}
                  placeholder="*.psd or assets/**"
                  className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
                />
                <ActionButton disabled={pending || !pattern.trim()} onClick={trackPattern} tone="primary">Track</ActionButton>
              </div>
              <div className="mt-4 space-y-2">
                {lfsStatus.trackedPatterns.length > 0 ? (
                  lfsStatus.trackedPatterns.map((trackedPattern) => (
                    <LfsPatternRow
                      key={`${trackedPattern.source ?? "local"}-${trackedPattern.pattern}`}
                      trackedPattern={trackedPattern}
                      disabled={pending}
                      onUntrack={() => untrackMutation.mutate(trackedPattern.pattern)}
                    />
                  ))
                ) : (
                  <EmptyState message="No Git LFS patterns configured." />
                )}
              </div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Tracked files</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">Objects currently reported by git lfs ls-files.</p>
                </div>
                <span className="rounded bg-[var(--color-bg-tertiary)] px-2 py-1 text-xs text-[var(--color-text-secondary)]">{lfsStatus.files.length} files</span>
              </div>
              <div className="mt-4 overflow-hidden rounded-lg border border-[var(--color-border-muted)]">
                {lfsStatus.files.length > 0 ? (
                  lfsStatus.files.map((file) => (
                    <div key={`${file.oid}-${file.path}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[var(--color-border-muted)] px-3 py-2 text-xs last:border-b-0">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[var(--color-text-primary)]">{file.path}</div>
                        <div className="truncate font-mono text-[10px] text-[var(--color-text-muted)]">{file.oid}</div>
                      </div>
                      <div className="self-center text-[var(--color-text-secondary)]">{file.size ?? "—"}</div>
                    </div>
                  ))
                ) : (
                  <div className="p-4"><EmptyState message="No Git LFS files found." /></div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function LfsPatternRow({ trackedPattern, disabled, onUntrack }: { trackedPattern: LfsTrackPattern; disabled: boolean; onUntrack: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs">
      <div className="min-w-0">
        <div className="truncate font-mono text-[var(--color-text-primary)]">{trackedPattern.pattern}</div>
        <div className="truncate text-[10px] text-[var(--color-text-muted)]">{trackedPattern.source ?? "local attributes"}</div>
      </div>
      <ActionButton disabled={disabled} onClick={onUntrack} tone="danger">Untrack</ActionButton>
    </div>
  );
}


function TagCard({ tag, disabled, onDelete }: { tag: GitTag; disabled: boolean; onDelete: () => void }) {
  return (
    <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><TagIcon className="h-4 w-4 text-[var(--color-accent)]" /><h2 className="font-semibold">{tag.name}</h2><span className="rounded-full border border-[var(--color-border-muted)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">{tag.annotated ? "annotated" : "lightweight"}</span></div>
          <p className="mt-2 truncate text-sm text-[var(--color-text-secondary)]">{tag.subject ?? "No tag subject"}</p>
          <p className="mt-1 font-mono text-xs text-[var(--color-text-muted)]">{tag.shortHash}{tag.tagger ? ` · ${tag.tagger}` : ""}{tag.timestamp ? ` · ${formatRelativeTime(tag.timestamp)}` : ""}</p>
        </div>
        <ActionButton disabled={disabled} onClick={onDelete} tone="danger"><Trash2 className="h-3.5 w-3.5" />Delete</ActionButton>
      </div>
    </article>
  );
}
