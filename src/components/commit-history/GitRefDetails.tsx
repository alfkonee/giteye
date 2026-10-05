import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Archive, GitBranch, Tag as TagIcon } from "lucide-react";
import { gitActionErrorMessage, gitQueries } from "../../lib/git-data";
import { useGitRefActions } from "../../hooks/useGitRefActions";
import { useAppStore } from "../../stores/app-store";
import type { GitRefSelection, StashFile, StashSection } from "../../types/git";
import { DiffViewer } from "../diff-viewer/DiffViewer";
import { Button } from "../ui";

const sections: { key: StashSection; label: string }[] = [
  { key: "staged", label: "Staged (base → index)" },
  { key: "unstaged", label: "Unstaged (index → saved work)" },
  { key: "untracked", label: "Untracked files" },
];

export function GitRefDetails({ selection }: { selection: GitRefSelection }) {
  const repoPath = useAppStore((state) => state.activeRepoPath);
  const diffMode = useAppStore((state) => state.diffMode);
  const setSelectedCommitHash = useAppStore((state) => state.setSelectedCommitHash);
  const setSelectedGitRef = useAppStore((state) => state.setSelectedGitRef);
  const tagQuery = useQuery(gitQueries.tags(repoPath, selection.kind === "tag"));
  const stashQuery = useQuery(gitQueries.stashes(repoPath, selection.kind === "stash"));
  const tag = selection.kind === "tag" ? tagQuery.data?.find((entry) => entry.name === selection.name && entry.commitHash === selection.commitHash) : undefined;
  const stash = selection.kind === "stash" ? stashQuery.data?.find((entry) => entry.commitHash === selection.commitHash) : undefined;
  const filesQuery = useQuery(gitQueries.stashFiles(repoPath, selection.kind === "stash" && stash ? selection.commitHash : null));
  const [selectedFile, setSelectedFile] = useState<StashFile | null>(null);
  const selected = filesQuery.data?.find((file) => file.path === selectedFile?.path && file.section === selectedFile.section) ?? filesQuery.data?.[0] ?? null;
  const diffQuery = useQuery(gitQueries.stashDiff(repoPath, selection.kind === "stash" && stash ? selection.commitHash : null, selected?.section ?? "staged", selected?.path ?? null));
  const actions = useGitRefActions();

  useEffect(() => {
    if (selection.kind === "tag" && tagQuery.isSuccess && !tag) setSelectedGitRef(null);
    if (selection.kind === "stash" && stashQuery.isSuccess && !stash) setSelectedGitRef(null);
  }, [selection.kind, selection.commitHash, selection.name, tagQuery.isSuccess, stashQuery.isSuccess, tag, stash, setSelectedGitRef]);
  useEffect(() => setSelectedFile(null), [selection.commitHash, selection.kind]);

  if (selection.kind === "tag") {
    if (tagQuery.isPending) return <p className="p-4 text-sm text-[var(--color-text-secondary)]">Loading tag details…</p>;
    if (tagQuery.error) return <p role="alert" className="p-4 text-sm text-[var(--color-danger)]">Failed to load tag: {gitActionErrorMessage(tagQuery.error)}</p>;
    if (!tag) return <p className="p-4 text-sm text-[var(--color-text-secondary)]">Tag was removed or moved. Clearing selection…</p>;
    return (
      <section className="flex h-full flex-col overflow-y-auto bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
        <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
          <h2 className="flex items-center gap-2 break-all text-base font-semibold"><TagIcon className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />{tag.name}</h2>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{tag.annotated ? "Annotated tag" : "Lightweight tag"}</p>
        </header>
        <dl className="grid gap-3 p-4 text-xs">
          <div><dt className="text-[var(--color-text-muted)]">Full name</dt><dd className="break-all font-mono">{tag.name}</dd></div>
          <div><dt className="text-[var(--color-text-muted)]">Peeled target commit</dt><dd className="break-all font-mono">{tag.commitHash || "Not a commit"}</dd></div>
          {tag.annotation ? <div><dt className="text-[var(--color-text-muted)]">Annotation</dt><dd className="whitespace-pre-wrap">{tag.annotation}</dd></div> : null}
          {tag.tagger ? <div><dt className="text-[var(--color-text-muted)]">Tagger</dt><dd>{tag.tagger}</dd></div> : null}
          {tag.timestamp ? <div><dt className="text-[var(--color-text-muted)]">Tagged</dt><dd>{new Date(tag.timestamp).toLocaleString()}</dd></div> : null}
        </dl>
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          <Button variant="secondary" size="sm" disabled={!tag.commitHash} onClick={() => setSelectedCommitHash(tag.commitHash)}>Inspect target commit</Button>
          <Button variant="secondary" size="sm" disabled={actions.isBusy || !tag.commitHash} onClick={() => void actions.checkoutTag(tag)}>Checkout detached…</Button>
          <Button variant="secondary" size="sm" disabled={actions.isBusy || !tag.commitHash} onClick={() => void actions.branchFromTag(tag)}><GitBranch className="h-3.5 w-3.5" />Create branch…</Button>
          <Button variant="secondary" size="sm" disabled={actions.isBusy} onClick={() => void actions.pushTag(tag)}>Push…</Button>
          <Button variant="danger" size="sm" disabled={actions.isBusy} onClick={() => void actions.deleteLocalTag(tag)}>Delete local…</Button>
          <Button variant="danger" size="sm" disabled={actions.isBusy} onClick={() => void actions.deleteRemoteTag(tag)}>Delete remote…</Button>
        </div>
        {actions.error ? <p role="alert" className="p-4 text-xs text-[var(--color-danger)]">{actions.error}</p> : null}
      </section>
    );
  }

  if (stashQuery.isPending) return <p className="p-4 text-sm text-[var(--color-text-secondary)]">Loading stash details…</p>;
  if (stashQuery.error) return <p role="alert" className="p-4 text-sm text-[var(--color-danger)]">Failed to load stash: {gitActionErrorMessage(stashQuery.error)}</p>;
  if (!stash) return <p className="p-4 text-sm text-[var(--color-text-secondary)]">Stash was removed. Clearing selection…</p>;
  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <header className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Archive className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />{stash.name} · {stash.message || "Saved changes"}</h2>
        <dl className="mt-2 grid gap-1 break-all text-xs text-[var(--color-text-secondary)]">
          <div>Original branch: {stash.branch || "unknown or detached"}</div>
          <div>Saved: {stash.timestamp ? new Date(stash.timestamp).toLocaleString() : "unknown"}</div>
          <div>Stash hash: <span className="font-mono">{stash.commitHash}</span></div>
          <div>Base commit: <span className="font-mono">{stash.baseCommitHash}</span></div>
        </dl>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => setSelectedCommitHash(stash.baseCommitHash)}>Inspect base</Button>
          <Button variant="secondary" size="sm" disabled={actions.isBusy} onClick={() => void actions.applyStash(stash)}>Apply…</Button>
          <Button variant="secondary" size="sm" disabled={actions.isBusy} onClick={() => void actions.popStash(stash)}>Pop…</Button>
          <Button variant="secondary" size="sm" disabled={actions.isBusy} onClick={() => void actions.branchFromStash(stash)}>Branch…</Button>
          <Button variant="danger" size="sm" disabled={actions.isBusy} onClick={() => void actions.dropStash(stash)}>Drop…</Button>
        </div>
        {actions.error ? <p role="alert" className="mt-2 text-xs text-[var(--color-danger)]">{actions.error}</p> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="max-h-[40%] shrink-0 overflow-auto border-b border-[var(--color-border)] px-3 py-2">
          {filesQuery.isPending ? <p className="text-xs text-[var(--color-text-muted)]">Loading saved files…</p> : filesQuery.error ? <p role="alert" className="text-xs text-[var(--color-danger)]">Failed to load saved files: {gitActionErrorMessage(filesQuery.error)}</p> :
            sections.map(({ key, label }) => {
              const files = filesQuery.data?.filter((file) => file.section === key) ?? [];
              return <div key={key} className="mb-2">
                <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{label} ({files.length})</h3>
                {files.map((file) => <button key={`${key}-${file.path}`} type="button" onClick={() => setSelectedFile(file)}
                  aria-current={selected?.section === key && selected.path === file.path ? "true" : undefined}
                  className="block w-full truncate rounded px-2 py-1 text-left font-mono text-[11px] hover:bg-[var(--color-bg-hover)] aria-[current=true]:bg-[var(--color-bg-tertiary)]"
                  title={file.path}>{file.path}</button>)}
              </div>;
            })}
        </div>
        <div className="min-h-0 flex-1">
          {selected ? <DiffViewer diffText={diffQuery.data?.diffText ?? ""} filePath={diffQuery.data?.filePath ?? selected.path}
            oldFilePath={diffQuery.data?.oldFilePath ?? undefined} isBinary={diffQuery.data?.isBinary} truncated={diffQuery.data?.truncated}
            isLoading={diffQuery.isPending} error={diffQuery.error ? gitActionErrorMessage(diffQuery.error) : null} mode={diffMode} /> :
            <p className="p-4 text-xs text-[var(--color-text-muted)]">No saved file changes in this stash.</p>}
        </div>
      </div>
    </section>
  );
}
