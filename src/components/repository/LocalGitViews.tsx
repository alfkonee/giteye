import { useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeftRight, GitBranch, Globe2, HardDrive, LockKeyhole, Pencil, Plus, RefreshCw, ShieldCheck, Tag as TagIcon, Trash2, UploadCloud, DownloadCloud, Wrench } from "lucide-react";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { formatDryRunPreview } from "../../lib/git-preview";
import { gitApi } from "../../lib/tauri-api";
import { useAppStore } from "../../stores/app-store";
import type { Branch, GitTag, LfsCommandPreview, LfsMigrationMode, LfsMigrationRequest, LfsTrackPattern, LfsTransferOperation, LfsTransferRequest, Remote, StashEntry } from "../../types/git";

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

function formatPreviewForDialog(lines: string[]) {
  if (lines.length === 0) {
    return "No file-level preview was returned.";
  }

  const visibleLines = lines.slice(0, 80);
  const suffix = lines.length > visibleLines.length
    ? `\n…${lines.length - visibleLines.length} more preview line(s) omitted.`
    : "";
  return `${visibleLines.join("\n")}${suffix}`;
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

function promptRemoteName(remotes: Remote[], action: string) {
  if (remotes.length === 0) {
    window.alert("Add a remote before using this action.");
    return null;
  }
  const remote = window.prompt(`${action} remote`, remotes[0]?.name ?? "origin")?.trim();
  return remote || null;
}

function currentOrFirstBranch(branches: Branch[], currentBranch?: string) {
  return currentBranch || branches.find((branch) => branch.isCurrent)?.shortName || branches[0]?.shortName || "";
}


export function RemotesView() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const queryClient = useQueryClient();
  const remotesQuery = useQuery(gitQueries.remotes(activeRepoPath));
  const branchesQuery = useQuery(gitQueries.branches(activeRepoPath));
  const snapshotQuery = useQuery(gitQueries.repositorySnapshot(activeRepoPath));
  const fetchMutation = useMutation(gitMutations.fetch(queryClient, activeRepoPath));
  const pullMutation = useMutation(gitMutations.pull(queryClient, activeRepoPath));
  const pushMutation = useMutation(gitMutations.push(queryClient, activeRepoPath));
  const addRemoteMutation = useMutation(gitMutations.addRemote(queryClient, activeRepoPath));
  const updateRemoteMutation = useMutation(gitMutations.updateRemote(queryClient, activeRepoPath));
  const deleteRemoteMutation = useMutation(gitMutations.deleteRemote(queryClient, activeRepoPath));
  const pruneRemoteMutation = useMutation(gitMutations.pruneRemote(queryClient, activeRepoPath));
  const pruneRemotePreviewMutation = useMutation(gitMutations.pruneRemoteDryRun(activeRepoPath));
  const pushBranchMutation = useMutation(gitMutations.pushBranch(queryClient, activeRepoPath));
  const pushBranchDryRunMutation = useMutation(gitMutations.pushBranchDryRun(activeRepoPath));
  const [remoteName, setRemoteName] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");

  const remotes = remotesQuery.data ?? [];
  const localBranches = (branchesQuery.data ?? []).filter((branch) => !branch.isRemote);
  const branchName = snapshotQuery.data?.repositoryInfo.currentBranch ?? undefined;
  const isMutating =
    fetchMutation.isPending ||
    pullMutation.isPending ||
    pushMutation.isPending ||
    addRemoteMutation.isPending ||
    updateRemoteMutation.isPending ||
    deleteRemoteMutation.isPending ||
    pruneRemoteMutation.isPending ||
    pruneRemotePreviewMutation.isPending ||
    pushBranchMutation.isPending ||
    pushBranchDryRunMutation.isPending;
  const error = errorMessage(
    remotesQuery.error ??
      fetchMutation.error ??
      pullMutation.error ??
      pushMutation.error ??
      addRemoteMutation.error ??
      updateRemoteMutation.error ??
      deleteRemoteMutation.error ??
      pruneRemoteMutation.error ??
      pruneRemotePreviewMutation.error ??
      pushBranchMutation.error ??
      pushBranchDryRunMutation.error,
  );

  const addRemote = () => {
    const name = remoteName.trim();
    const url = remoteUrl.trim();
    if (!name || !url) return;
    addRemoteMutation.mutate(
      { name, url },
      {
        onSuccess: () => {
          setRemoteName("");
          setRemoteUrl("");
        },
      },
    );
  };

  const editRemote = (remote: Remote) => {
    const fetchUrl = window.prompt(`Fetch URL for ${remote.name}`, remote.fetchUrl ?? remote.url)?.trim();
    if (!fetchUrl) return;
    const pushUrl = window.prompt(`Push URL for ${remote.name}`, remote.pushUrl ?? remote.fetchUrl ?? remote.url)?.trim();
    if (pushUrl === undefined) return;
    updateRemoteMutation.mutate({ name: remote.name, fetchUrl, pushUrl: pushUrl || null });
  };

  const deleteRemote = (remote: Remote) => {
    if (!window.confirm(`Delete remote "${remote.name}"? This removes the remote and its remote-tracking refs from this repository.`)) return;
    deleteRemoteMutation.mutate(remote.name);
  };

  const pruneRemote = async (remote: Remote) => {
    let previewLines: string[];
    try {
      previewLines = await pruneRemotePreviewMutation.mutateAsync(remote.name);
    } catch (error) {
      window.alert(`Unable to preview remote prune for "${remote.name}": ${errorMessage(error)}`);
      return;
    }

    const preview = previewLines.length > 0
      ? previewLines.slice(0, 12).join("\n")
      : "No stale remote-tracking refs reported by dry run.";
    const overflow = previewLines.length > 12 ? `\n…and ${previewLines.length - 12} more` : "";
    if (
      !window.confirm(
        `Prune stale remote-tracking refs from "${remote.name}"?\n\nPreview:\n${preview}${overflow}\n\nRecovery: stale tracking refs can be recreated by fetching if the branch still exists on the remote; otherwise recover from a local branch or reflog tip.`,
      )
    ) return;
    pruneRemoteMutation.mutate(remote.name);
  };

  const pushBranchToRemote = async (remote: Remote, forceWithLease: boolean) => {
    const defaultBranch = currentOrFirstBranch(localBranches, branchName);
    const localBranch = window.prompt("Local branch to push", defaultBranch)?.trim();
    if (!localBranch) return;
    const remoteBranch = window.prompt("Remote branch name", localBranch)?.trim();
    if (remoteBranch === undefined) return;
    const target = `${remote.name}/${remoteBranch || localBranch}`;
    const setUpstream = !forceWithLease && window.confirm(`Set "${localBranch}" to track ${target} after push?`);
    const request = {
      remote: remote.name,
      localBranch,
      remoteBranch: remoteBranch || null,
      setUpstream,
      forceWithLease,
    };
    let previewText: string;
    try {
      previewText = formatDryRunPreview(
        await pushBranchDryRunMutation.mutateAsync(request),
        "Git did not report any ref updates for this push dry run.",
      );
    } catch (error) {
      window.alert(`Unable to preview push to ${target}: ${errorMessage(error)}`);
      return;
    }
    const forceWarning = forceWithLease
      ? "\n\nThis can rewrite the remote branch if your lease is current. Recovery: keep the old remote tip from a collaborator, reflog, or host audit log and push a recovery branch if this is wrong."
      : "";
    if (!window.confirm(`Push "${localBranch}" to ${target}?${forceWarning}\n\nPreview:\n${previewText}`)) return;
    pushBranchMutation.mutate(request);
  };

  const pushCurrentBranch = async (remote: Remote) => {
    if (!branchName) return;
    const request = {
      remote: remote.name,
      localBranch: branchName,
      remoteBranch: branchName,
      setUpstream: false,
      forceWithLease: false,
    };
    let previewText: string;
    try {
      previewText = formatDryRunPreview(
        await pushBranchDryRunMutation.mutateAsync(request),
        "Git did not report any ref updates for this push dry run.",
      );
    } catch (error) {
      window.alert(`Unable to preview push to ${remote.name}/${branchName}: ${errorMessage(error)}`);
      return;
    }
    if (!window.confirm(`Push current branch "${branchName}" to ${remote.name}/${branchName}?\n\nPreview:\n${previewText}`)) return;
    pushMutation.mutate({ remote: remote.name, branch: branchName });
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Header
        icon={<Globe2 className="h-5 w-5" />}
        title="Remotes"
        detail={branchName ? `Current branch: ${branchName}` : "Fetch, pull, push, prune, and edit configured Git remotes."}
        action={<ActionButton disabled={!activeRepoPath || isMutating} onClick={() => fetchMutation.mutate(undefined)}><RefreshCw className="h-3.5 w-3.5" /> Fetch all</ActionButton>}
      />
      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
          <div className="grid gap-3 md:grid-cols-[minmax(120px,180px)_minmax(260px,1fr)_auto]">
            <input value={remoteName} onChange={(event) => setRemoteName(event.target.value)} placeholder="Remote name (origin)" className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]" />
            <input value={remoteUrl} onChange={(event) => setRemoteUrl(event.target.value)} placeholder="Remote URL" className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]" />
            <ActionButton disabled={!activeRepoPath || isMutating || !remoteName.trim() || !remoteUrl.trim()} onClick={addRemote} tone="primary"><Plus className="h-3.5 w-3.5" />Add remote</ActionButton>
          </div>
        </div>
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
                onPush={() => pushCurrentBranch(remote)}
                onPushBranch={() => pushBranchToRemote(remote, false)}
                onForcePushBranch={() => pushBranchToRemote(remote, true)}
                onEdit={() => editRemote(remote)}
                onPrune={() => pruneRemote(remote)}
                onDelete={() => deleteRemote(remote)}
              />
            ))}
          </div>
        )}
      </main>
    </section>
  );
}

function RemoteCard({
  remote,
  branchName,
  disabled,
  onFetch,
  onPull,
  onPush,
  onPushBranch,
  onForcePushBranch,
  onEdit,
  onPrune,
  onDelete,
}: {
  remote: Remote;
  branchName?: string;
  disabled: boolean;
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
  onPushBranch: () => void;
  onForcePushBranch: () => void;
  onEdit: () => void;
  onPrune: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold"><Globe2 className="h-4 w-4 text-[var(--color-accent)]" />{remote.name}</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2"><dt className="text-[var(--color-text-muted)]">Fetch</dt><dd className="truncate font-mono text-xs text-[var(--color-text-secondary)]">{remote.fetchUrl ?? remote.url}</dd></div>
            <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2"><dt className="text-[var(--color-text-muted)]">Push</dt><dd className="truncate font-mono text-xs text-[var(--color-text-secondary)]">{remote.pushUrl ?? remote.url}</dd></div>
          </dl>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <ActionButton disabled={disabled} onClick={onFetch}><RefreshCw className="h-3.5 w-3.5" />Fetch</ActionButton>
          <ActionButton disabled={disabled || !branchName} onClick={onPull}><DownloadCloud className="h-3.5 w-3.5" />Pull</ActionButton>
          <ActionButton disabled={disabled || !branchName} onClick={onPush}><UploadCloud className="h-3.5 w-3.5" />Push current</ActionButton>
          <ActionButton disabled={disabled} onClick={onPushBranch}><GitBranch className="h-3.5 w-3.5" />Push branch</ActionButton>
          <ActionButton disabled={disabled} onClick={onForcePushBranch} tone="danger"><UploadCloud className="h-3.5 w-3.5" />Force lease</ActionButton>
          <ActionButton disabled={disabled} onClick={onPrune}>Prune</ActionButton>
          <ActionButton disabled={disabled} onClick={onEdit}><Pencil className="h-3.5 w-3.5" />Edit</ActionButton>
          <ActionButton disabled={disabled} onClick={onDelete} tone="danger"><Trash2 className="h-3.5 w-3.5" />Delete</ActionButton>
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
  const previewStash = useMutation({
    mutationFn: (stashName: string) => gitApi.previewStash(activeRepoPath!, stashName),
  });
  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(true);

  const stashes = stashesQuery.data ?? [];
  const isMutating = createStash.isPending || previewStash.isPending || applyStash.isPending || popStash.isPending || dropStash.isPending;
  const error = errorMessage(stashesQuery.error ?? createStash.error ?? previewStash.error ?? applyStash.error ?? popStash.error ?? dropStash.error);

  const create = () => {
    createStash.mutate(
      { message: message.trim() || undefined, includeUntracked },
      { onSuccess: () => setMessage("") },
    );
  };

  const previewAndConfirmStash = async (stash: StashEntry, action: "apply" | "pop") => {
    if (!activeRepoPath) return;

    let preview: string[];
    try {
      previewStash.reset();
      preview = await previewStash.mutateAsync(stash.name);
    } catch (error) {
      window.alert(`Unable to preview ${stash.name}: ${errorMessage(error) ?? "Unknown error"}`);
      previewStash.reset();
      return;
    }

    const actionLabel = action === "apply" ? "Apply" : "Pop";
    const removalWarning = action === "pop" ? "\n\nPop removes the stash entry after a successful application." : "";
    const previewText = formatPreviewForDialog(preview);
    if (!window.confirm(`${actionLabel} ${stash.name}?\n\n${stash.message || "Stashed changes"}${removalWarning}\n\nPreview:\n${previewText}`)) {
      return;
    }

    if (action === "apply") {
      applyStash.mutate(stash.name);
    } else {
      popStash.mutate(stash.name);
    }
  };

  const confirmDropStash = (stash: StashEntry) => {
    if (!window.confirm(`Drop ${stash.name}?\n\n${stash.message || "Stashed changes"}\n\nThis removes the stash entry. Recovery may require reflog/manual Git recovery if this was accidental.`)) {
      return;
    }

    dropStash.mutate(stash.name);
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
            {stashes.map((stash) => <StashCard key={stash.name} stash={stash} disabled={isMutating} onApply={() => void previewAndConfirmStash(stash, "apply")} onPop={() => void previewAndConfirmStash(stash, "pop")} onDrop={() => confirmDropStash(stash)} />)}
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
  const remotesQuery = useQuery(gitQueries.remotes(activeRepoPath));
  const createTag = useMutation(gitMutations.createTag(queryClient, activeRepoPath));
  const deleteTag = useMutation(gitMutations.deleteTag(queryClient, activeRepoPath));
  const pushTag = useMutation(gitMutations.pushTag(queryClient, activeRepoPath));
  const deleteRemoteTag = useMutation(gitMutations.deleteRemoteTag(queryClient, activeRepoPath));
  const pushTagDryRun = useMutation(gitMutations.pushTagDryRun(activeRepoPath));
  const deleteRemoteTagDryRun = useMutation(gitMutations.deleteRemoteTagDryRun(activeRepoPath));
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState("");

  const tags = tagsQuery.data ?? [];
  const remotes = remotesQuery.data ?? [];
  const isMutating =
    createTag.isPending ||
    deleteTag.isPending ||
    pushTag.isPending ||
    pushTagDryRun.isPending ||
    deleteRemoteTag.isPending ||
    deleteRemoteTagDryRun.isPending;
  const error = errorMessage(
    tagsQuery.error ??
      remotesQuery.error ??
      createTag.error ??
      deleteTag.error ??
      pushTag.error ??
      pushTagDryRun.error ??
      deleteRemoteTag.error ??
      deleteRemoteTagDryRun.error,
  );
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

  const pushTagToRemote = async (tag: GitTag) => {
    const remote = promptRemoteName(remotes, `Push "${tag.name}" to`);
    if (!remote) return;
    let previewText: string;
    try {
      previewText = formatDryRunPreview(
        await pushTagDryRun.mutateAsync({ remote, name: tag.name }),
        "Git did not report any ref updates for this tag push dry run.",
      );
    } catch (error) {
      window.alert(`Unable to preview tag push for "${tag.name}": ${errorMessage(error)}`);
      return;
    }
    if (!window.confirm(`Push tag "${tag.name}" to ${remote}?\n\nPreview:\n${previewText}`)) return;
    pushTag.mutate({ remote, name: tag.name });
  };

  const deleteTagFromRemote = async (tag: GitTag) => {
    const remote = promptRemoteName(remotes, `Delete "${tag.name}" from`);
    if (!remote) return;
    let previewText: string;
    try {
      previewText = formatDryRunPreview(
        await deleteRemoteTagDryRun.mutateAsync({ remote, name: tag.name }),
        "Git did not report a ref deletion for this remote tag dry run.",
      );
    } catch (error) {
      window.alert(`Unable to preview remote tag deletion for "${tag.name}": ${errorMessage(error)}`);
      return;
    }
    if (!window.confirm(`Delete remote tag "${tag.name}" from ${remote}?\n\nPreview:\n${previewText}\n\nThis does not delete the local tag. Recovery: push the local tag again, or recreate it at the intended commit before pushing.`)) return;
    deleteRemoteTag.mutate({ remote, name: tag.name });
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <Header icon={<TagIcon className="h-5 w-5" />} title="Tags" detail="Create local tags, push tags, and delete obsolete local or remote tags." />
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
            {sortedTags.map((tag) => (
              <TagCard
                key={tag.name}
                tag={tag}
                disabled={isMutating}
                onPush={() => pushTagToRemote(tag)}
                onDeleteRemote={() => deleteTagFromRemote(tag)}
                onDelete={() => {
                  if (window.confirm(`Delete local tag "${tag.name}"?`)) deleteTag.mutate(tag.name);
                }}
              />
            ))}
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
  const lockMutation = useMutation(gitMutations.lockLfsFile(queryClient, activeRepoPath));
  const unlockMutation = useMutation(gitMutations.unlockLfsFile(queryClient, activeRepoPath));
  const transferMutation = useMutation(gitMutations.startLfsTransfer(queryClient, activeRepoPath));
  const pruneMutation = useMutation(gitMutations.startLfsPrune(queryClient, activeRepoPath));
  const fsckMutation = useMutation(gitMutations.startLfsFsck(queryClient, activeRepoPath));
  const migrationMutation = useMutation(gitMutations.startLfsMigration(queryClient, activeRepoPath));
  const [pattern, setPattern] = useState("");
  const [lockPath, setLockPath] = useState("");
  const [lockRemote, setLockRemote] = useState("origin");
  const [remote, setRemote] = useState("origin");
  const [transferOperation, setTransferOperation] = useState<LfsTransferOperation>("fetch");
  const [transferRef, setTransferRef] = useState("");
  const [transferInclude, setTransferInclude] = useState("");
  const [transferExclude, setTransferExclude] = useState("");
  const [transferAll, setTransferAll] = useState(false);
  const [pruneVerifyRemote, setPruneVerifyRemote] = useState(true);
  const [pruneForce, setPruneForce] = useState(false);
  const [fsckRevision, setFsckRevision] = useState("");
  const [migrationMode, setMigrationMode] = useState<LfsMigrationMode>("import");
  const [migrationInclude, setMigrationInclude] = useState("");
  const [migrationExclude, setMigrationExclude] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewBusyRef = useRef(false);
  const locksQuery = useQuery(gitQueries.lfsLocks(activeRepoPath, lockRemote.trim() || null, Boolean(lfsStatus?.available)));
  const pending = previewBusy || [installMutation, trackMutation, untrackMutation, lockMutation, unlockMutation, transferMutation, pruneMutation, fsckMutation, migrationMutation].some((mutation) => mutation.isPending);
  const mutationError = [installMutation, trackMutation, untrackMutation, lockMutation, unlockMutation, transferMutation, pruneMutation, fsckMutation, migrationMutation].find((mutation) => mutation.error)?.error;

  const trackPattern = () => {
    const nextPattern = pattern.trim();
    if (!nextPattern) return;
    trackMutation.mutate(nextPattern, { onSuccess: () => setPattern("") });
  };

  const previewAndConfirm = async (loadPreview: () => Promise<LfsCommandPreview>, action: string) => {
    if (previewBusyRef.current) return false;
    previewBusyRef.current = true;
    setPreviewBusy(true);
    try {
      const preview = await loadPreview();
      const warning = preview.destructive
        ? "\n\nWarning: the requested operation is destructive. Review the preview carefully."
        : "";
      return window.confirm(
        `${action}?\n\n${preview.description}\n\nCommand:\n${preview.command.join(" ")}\n\nPreview:\n${formatPreviewForDialog(preview.lines)}${warning}`,
      );
    } catch (previewError) {
      window.alert(`Unable to preview ${action.toLowerCase()}: ${errorMessage(previewError)}`);
      return false;
    } finally {
      previewBusyRef.current = false;
      setPreviewBusy(false);
    }
  };

  const startTransfer = async () => {
    if (!activeRepoPath) return;
    const request: LfsTransferRequest = {
      operation: transferOperation,
      remote: remote.trim() || null,
      reference: transferOperation === "pull" || (transferOperation === "push" && transferAll) ? null : transferRef.trim() || null,
      include: transferAll ? null : transferInclude.trim() || null,
      exclude: transferAll ? null : transferExclude.trim() || null,
      all: transferAll,
    };
    if (await previewAndConfirm(() => gitApi.previewLfsTransfer(activeRepoPath, request), `Run LFS ${transferOperation}`)) {
      transferMutation.mutate(request);
    }
  };

  const startPrune = async () => {
    if (!activeRepoPath) return;
    const request = { verifyRemote: pruneVerifyRemote, force: pruneForce };
    if (await previewAndConfirm(() => gitApi.previewLfsPrune(activeRepoPath, request), "Prune local LFS objects")) {
      pruneMutation.mutate(request);
    }
  };

  const startFsck = async () => {
    if (!activeRepoPath) return;
    const revision = fsckRevision.trim() || null;
    if (await previewAndConfirm(() => gitApi.previewLfsFsck(activeRepoPath, revision), "Run LFS integrity repair")) {
      fsckMutation.mutate(revision);
    }
  };

  const startMigration = async () => {
    if (!activeRepoPath || !migrationInclude.trim()) return;
    const request: LfsMigrationRequest = {
      mode: migrationMode,
      include: migrationInclude.trim(),
      exclude: migrationExclude.trim() || null,
      includeRefs: [],
      everything: false,
      remote: remote.trim() || null,
    };
    const confirmed = await previewAndConfirm(
      () => gitApi.previewLfsMigration(activeRepoPath, request),
      `Rewrite Git history with LFS migrate ${migrationMode}`,
    );
    if (confirmed && window.confirm("This rewrites commit history and requires a clean worktree. GitEye will create a recovery branch before starting. Continue?")) {
      migrationMutation.mutate(request);
    }
  };

  const fieldClass = "min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2 py-1.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]";
  const locks = [...(locksQuery.data?.ours ?? []), ...(locksQuery.data?.theirs ?? [])];

  return (
    <section className="flex h-full flex-col bg-[var(--color-bg-primary)]">
      <Header
        icon={<HardDrive className="h-4 w-4" />}
        title="Git LFS"
        detail={lfsStatus?.available ? `${lfsStatus.version ?? "Git LFS available"}${lfsStatus.gitVersion ? ` · ${lfsStatus.gitVersion}` : ""}` : "Large file storage status"}
        action={<ActionButton disabled={pending || !activeRepoPath} onClick={() => installMutation.mutate()} tone="primary">Install local hooks</ActionButton>}
      />
      {(error || mutationError || locksQuery.error || lfsStatus?.error) && (
        <div className="border-b border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-danger)]">
          {errorMessage(error ?? mutationError ?? locksQuery.error ?? lfsStatus?.error)}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <EmptyState message="Loading Git LFS status…" />
        ) : !lfsStatus?.available ? (
          <EmptyState message="Git LFS is not available for this repository. Install git-lfs, then install local hooks here." />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <LfsStatusCard label="Hooks" value={lfsStatus.hooksInstalled ? "Installed" : "Missing"} />
              <LfsStatusCard label="Endpoint" value={lfsStatus.endpoint ?? "Default / not reported"} mono />
              <LfsStatusCard label="Media directory" value={lfsStatus.localMediaDir ?? "Not reported"} mono />
              <LfsStatusCard label="Concurrent transfers" value={lfsStatus.concurrentTransfers?.toString() ?? "Default"} />
            </div>
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
                   className={`${fieldClass} flex-1`}
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
                       <div className="flex items-center gap-2 self-center text-[var(--color-text-secondary)]">
                         <span>{file.size ?? "—"}</span>
                         <ActionButton disabled={pending || locks.some((lock) => lock.path === file.path)} onClick={() => lockMutation.mutate({ path: file.path, remote: lockRemote.trim() || null })}><LockKeyhole className="h-3 w-3" />Lock</ActionButton>
                       </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4"><EmptyState message="No Git LFS files found." /></div>
                )}
              </div>
            </div>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]"><LockKeyhole className="h-4 w-4 text-[var(--color-accent)]" />File locks</h3><p className="text-xs text-[var(--color-text-muted)]">Coordinate edits to lockable LFS files through the configured remote.</p></div>
                <ActionButton disabled={pending || locksQuery.isFetching} onClick={() => locksQuery.refetch()}><RefreshCw className="h-3.5 w-3.5" />Refresh</ActionButton>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
                <input className={fieldClass} value={lockPath} onChange={(event) => setLockPath(event.target.value)} placeholder="Path to lock" />
                <input className={fieldClass} value={lockRemote} onChange={(event) => setLockRemote(event.target.value)} placeholder="Remote (origin)" />
                <ActionButton disabled={pending || !lockPath.trim()} onClick={() => lockMutation.mutate({ path: lockPath.trim(), remote: lockRemote.trim() || null }, { onSuccess: () => setLockPath("") })} tone="primary">Lock file</ActionButton>
              </div>
              <div className="mt-4 overflow-hidden rounded-lg border border-[var(--color-border-muted)]">
                {locksQuery.isLoading ? <div className="p-4"><EmptyState message="Loading LFS locks…" /></div> : locks.length === 0 ? <div className="p-4"><EmptyState message="No LFS locks reported by the remote." /></div> : locks.map((lock) => (
                  <div key={lock.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-muted)] px-3 py-2 text-xs last:border-b-0">
                    <div className="min-w-0"><div className="truncate font-mono text-[var(--color-text-primary)]">{lock.path}</div><div className="text-[10px] text-[var(--color-text-muted)]">{lock.ours ? "Locked by you" : `Locked by ${lock.owner ?? "another user"}`}{lock.lockedAt ? ` · ${formatRelativeTime(lock.lockedAt)}` : ""} · ID {lock.id}</div></div>
                    <ActionButton disabled={pending} tone={lock.ours ? "default" : "danger"} onClick={() => {
                      const force = !lock.ours;
                      if (!force || window.confirm(`Force unlock ${lock.path}, owned by ${lock.owner ?? "another user"}?`)) unlockMutation.mutate({ lockId: lock.id, remote: lockRemote.trim() || null, force });
                    }}>{lock.ours ? "Unlock" : "Force unlock"}</ActionButton>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><ArrowLeftRight className="h-4 w-4 text-[var(--color-accent)]" />Transfer objects</h3>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">Preview downloads, worktree population, or uploads before queuing them.</p>
                <div className="mt-3 grid gap-2">
                  <select className={fieldClass} value={transferOperation} onChange={(event) => { setTransferOperation(event.target.value as LfsTransferOperation); setTransferAll(false); }}><option value="fetch">Fetch</option><option value="pull">Pull</option><option value="push">Push</option></select>
                  <div className={`grid gap-2 ${transferOperation === "pull" ? "" : "grid-cols-2"}`}><input className={fieldClass} value={remote} onChange={(event) => setRemote(event.target.value)} placeholder="Remote" />{transferOperation !== "pull" ? <input className={fieldClass} value={transferRef} onChange={(event) => setTransferRef(event.target.value)} placeholder={transferOperation === "push" && !transferAll ? "Ref (required)" : "Ref (optional)"} disabled={transferOperation === "push" && transferAll} /> : null}</div>
                  {transferOperation !== "push" ? <div className="grid grid-cols-2 gap-2"><input className={fieldClass} value={transferInclude} onChange={(event) => setTransferInclude(event.target.value)} placeholder="Include paths" /><input className={fieldClass} value={transferExclude} onChange={(event) => setTransferExclude(event.target.value)} placeholder="Exclude paths" /></div> : null}
                  {transferOperation !== "pull" ? <LfsCheckbox checked={transferAll} onChange={setTransferAll} label="All refs / objects" /> : null}
                  <ActionButton disabled={pending || (transferOperation === "push" && (!remote.trim() || (!transferAll && !transferRef.trim())))} onClick={startTransfer} tone="primary">Preview and start</ActionButton>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-[var(--color-accent)]" />Integrity and cleanup</h3>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">Verify LFS pointers or remove old local objects after a dry run.</p>
                <div className="mt-3 grid gap-2">
                  <input className={fieldClass} value={fsckRevision} onChange={(event) => setFsckRevision(event.target.value)} placeholder="Fsck revision (default HEAD)" />
                  <ActionButton disabled={pending} onClick={startFsck}>Preview and run fsck</ActionButton>
                  <div className="my-1 border-t border-[var(--color-border-muted)]" />
                  <LfsCheckbox checked={pruneVerifyRemote} onChange={setPruneVerifyRemote} label="Verify objects exist remotely" />
                  <LfsCheckbox checked={pruneForce} onChange={setPruneForce} label="Force prune" />
                  <ActionButton disabled={pending} onClick={startPrune} tone="danger">Preview and prune</ActionButton>
                </div>
              </div>

              <div className="rounded-xl border border-[color:rgba(248,81,73,0.35)] bg-[var(--color-bg-secondary)] p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Wrench className="h-4 w-4 text-[var(--color-danger)]" />History migration</h3>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">Rewrite selected history. A clean worktree is required and a recovery branch is created automatically.</p>
                <div className="mt-3 grid gap-2">
                  <select className={fieldClass} value={migrationMode} onChange={(event) => setMigrationMode(event.target.value as LfsMigrationMode)}><option value="import">Import into LFS</option><option value="export">Export from LFS</option></select>
                  <input className={fieldClass} value={migrationInclude} onChange={(event) => setMigrationInclude(event.target.value)} placeholder="Include pattern (required)" />
                  <input className={fieldClass} value={migrationExclude} onChange={(event) => setMigrationExclude(event.target.value)} placeholder="Exclude pattern" />
                  <p className="text-[10px] text-[var(--color-text-muted)]">Migration is limited to the checked-out branch and does not fetch remote refs, keeping execution identical to the preview.</p>
                  <ActionButton disabled={pending || !migrationInclude.trim()} onClick={startMigration} tone="danger">Preview history rewrite</ActionButton>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function LfsStatusCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3"><div className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</div><div className={`mt-1 truncate text-xs text-[var(--color-text-primary)] ${mono ? "font-mono" : ""}`} title={value}>{value}</div></div>;
}

function LfsCheckbox({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-[var(--color-accent)]" />{label}</label>;
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


function TagCard({
  tag,
  disabled,
  onPush,
  onDeleteRemote,
  onDelete,
}: {
  tag: GitTag;
  disabled: boolean;
  onPush: () => void;
  onDeleteRemote: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><TagIcon className="h-4 w-4 text-[var(--color-accent)]" /><h2 className="font-semibold">{tag.name}</h2><span className="rounded-full border border-[var(--color-border-muted)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">{tag.annotated ? "annotated" : "lightweight"}</span></div>
          <p className="mt-2 truncate text-sm text-[var(--color-text-secondary)]">{tag.subject ?? "No tag subject"}</p>
          <p className="mt-1 font-mono text-xs text-[var(--color-text-muted)]">{tag.shortHash}{tag.tagger ? ` · ${tag.tagger}` : ""}{tag.timestamp ? ` · ${formatRelativeTime(tag.timestamp)}` : ""}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <ActionButton disabled={disabled} onClick={onPush}><UploadCloud className="h-3.5 w-3.5" />Push</ActionButton>
          <ActionButton disabled={disabled} onClick={onDeleteRemote} tone="danger">Delete remote</ActionButton>
          <ActionButton disabled={disabled} onClick={onDelete} tone="danger"><Trash2 className="h-3.5 w-3.5" />Delete local</ActionButton>
        </div>
      </div>
    </article>
  );
}
