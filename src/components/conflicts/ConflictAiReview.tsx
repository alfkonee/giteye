import { useEffect, useMemo, useState } from "react";
import { gitApi } from "../../lib/tauri-api";
import { useConflictStore } from "../../stores/conflict-store";
import { Button } from "../ui";
import { DiffViewer } from "../diff-viewer/DiffViewer";
import { resultPatch } from "./conflict-text";
import { gitActionErrorMessage } from "../../lib/git-data";

export function ConflictAiReview({
  repoPath,
  disabled,
}: {
  repoPath: string;
  disabled: boolean;
}) {
  const session = useConflictStore((state) => state.sessions[repoPath]);
  const [previewPaths, setPreviewPaths] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const filePath = session?.selectedPath;
  const file = filePath ? session?.files[filePath] : undefined;
  const proposal = file?.ai.proposal;
  const reviewPatch = useMemo(
    () =>
      proposal
        ? resultPatch(
            filePath ?? "result",
            file?.resolution?.kind === "text" ? file.resolution.content : "",
            proposal.resolvedContent,
          )
        : "",
    [filePath, file?.resolution, proposal],
  );

  useEffect(
    () => () => useConflictStore.getState().cancelQueue(repoPath),
    [repoPath],
  );

  const prepare = async (paths: string[]) => {
    const store = useConflictStore.getState();
    const current = store.sessions[repoPath];
    if (!current || current.queueRunning || disabled) return;
    store.cancelQueue(repoPath);
    const token = useConflictStore.getState().sessions[repoPath].queueToken;
    const operationId = current.operationId;
    setError(null);
    setPreviewPaths([]);
    store.updateSession(repoPath, (value) => ({
      ...value,
      queueRunning: true,
    }));
    const ready: string[] = [];
    try {
      for (const path of paths) {
        if (
          useConflictStore.getState().sessions[repoPath]?.queueToken !== token
        )
          return;
        try {
          const content = await gitApi.getConflictContent(repoPath, path);
          if (
            useConflictStore.getState().sessions[repoPath]?.queueToken !== token
          )
            return;
          if (content.operationId !== operationId)
            throw new Error(
              "The operation changed. Refresh before requesting AI.",
            );
          store.receive(repoPath, content);
          const draft =
            useConflictStore.getState().sessions[repoPath]?.files[path];
          if (
            !draft ||
            content.kind !== "text" ||
            !content.ours.present ||
            !content.theirs.present ||
            draft.external ||
            draft.resolved
          )
            continue;
          const version = draft.version;
          store.updateFile(repoPath, path, (value) => ({
            ...value,
            ai: { status: "queued", version },
          }));
          const context = await gitApi.getConflictAiContext(repoPath, {
            operationId,
            filePath: path,
            expectedRevision: content.revision,
          });
          const latest = useConflictStore.getState().sessions[repoPath];
          if (latest?.queueToken !== token) return;
          if (
            latest.files[path]?.version !== version ||
            context.contentRevision !== content.revision ||
            context.operationId !== operationId
          ) {
            store.updateFile(repoPath, path, (value) => ({
              ...value,
              ai: {
                status: "stale",
                error: "Content changed while preparing context.",
              },
            }));
            continue;
          }
          store.updateFile(repoPath, path, (value) => ({
            ...value,
            ai: { status: "queued", context, version },
          }));
          ready.push(path);
        } catch (cause) {
          store.updateFile(repoPath, path, (value) => ({
            ...value,
            ai: { status: "error", error: gitActionErrorMessage(cause) },
          }));
          setError(`${path}: ${gitActionErrorMessage(cause)}`);
        }
      }
      setPreviewPaths(ready);
      if (!ready.length)
        setError(
          "No eligible unchanged text conflicts. Binary, deleted-side, submodule and over-limit files are excluded.",
        );
    } finally {
      if (useConflictStore.getState().sessions[repoPath]?.queueToken === token)
        store.updateSession(repoPath, (value) => ({
          ...value,
          queueRunning: false,
        }));
    }
  };

  const sendQueue = async () => {
    const store = useConflictStore.getState();
    const current = store.sessions[repoPath];
    if (!current || current.queueRunning || disabled) return;
    const token = current.queueToken;
    const operationId = current.operationId;
    const paths = [...previewPaths];
    setPreviewPaths([]);
    store.updateSession(repoPath, (value) => ({
      ...value,
      queueRunning: true,
    }));
    try {
      for (const path of paths) {
        const value = useConflictStore.getState().sessions[repoPath];
        if (value?.queueToken !== token) return;
        const draft = value.files[path];
        if (!draft?.ai.context || draft.ai.status !== "queued") continue;
        const version = draft.ai.version;
        const revision = draft.ai.context.contentRevision;
        try {
          if (
            draft.version !== version ||
            draft.external ||
            draft.content.revision !== revision
          )
            throw new Error(
              "The editor changed after context preview. Prepare a fresh preview.",
            );
          const fresh = await gitApi.getConflictContent(repoPath, path);
          if (
            useConflictStore.getState().sessions[repoPath]?.queueToken !== token
          )
            return;
          if (fresh.revision !== revision || fresh.operationId !== operationId)
            throw new Error(
              "The file or operation changed after context preview.",
            );
          store.updateFile(repoPath, path, (item) => ({
            ...item,
            ai: { ...item.ai, status: "running" },
          }));
          const result = await gitApi.resolveConflictWithAi(repoPath, {
            operationId,
            filePath: path,
            expectedRevision: revision,
            previewRevision: draft.ai.context.previewRevision,
          });
          const latestContent = await gitApi.getConflictContent(repoPath, path);
          const latest = useConflictStore.getState().sessions[repoPath];
          if (latest?.queueToken !== token) return;
          const latestFile = latest.files[path];
          if (
            !latestFile ||
            latestFile.version !== version ||
            result.operationId !== operationId ||
            result.contentRevision !== revision ||
            latestContent.revision !== revision ||
            latestContent.operationId !== operationId
          ) {
            store.updateFile(repoPath, path, (item) => ({
              ...item,
              ai: {
                ...item.ai,
                status: "stale",
                error:
                  "The editor, operation or worktree changed. This response was rejected.",
              },
            }));
            continue;
          }
          store.updateFile(repoPath, path, (item) => ({
            ...item,
            ai: { ...item.ai, status: "ready", proposal: result },
          }));
        } catch (cause) {
          if (
            useConflictStore.getState().sessions[repoPath]?.queueToken !== token
          )
            return;
          store.updateFile(repoPath, path, (item) => ({
            ...item,
            ai: {
              ...item.ai,
              status: "error",
              error: gitActionErrorMessage(cause),
            },
          }));
        }
      }
    } finally {
      if (useConflictStore.getState().sessions[repoPath]?.queueToken === token)
        store.updateSession(repoPath, (value) => ({
          ...value,
          queueRunning: false,
        }));
    }
  };

  const accept = async () => {
    if (!session || !filePath || !file || !proposal || disabled) return;
    const version = file.version;
    try {
      const fresh = await gitApi.getConflictContent(repoPath, filePath);
      const current = useConflictStore.getState().sessions[repoPath];
      const draft = current?.files[filePath];
      if (
        !draft ||
        current.operationId !== proposal.operationId ||
        draft.version !== version ||
        draft.ai.version !== version ||
        fresh.revision !== proposal.contentRevision ||
        fresh.operationId !== proposal.operationId ||
        draft.ai.status !== "ready"
      ) {
        throw new Error(
          "The proposal is stale. Prepare a fresh proposal before accepting.",
        );
      }
      useConflictStore
        .getState()
        .setResolution(repoPath, filePath, {
          kind: "text",
          content: proposal.resolvedContent,
        });
      useConflictStore
        .getState()
        .updateFile(repoPath, filePath, (value) => ({
          ...value,
          ai: { status: "idle" },
        }));
    } catch (cause) {
      useConflictStore
        .getState()
        .updateFile(repoPath, filePath, (value) => ({
          ...value,
          ai: {
            ...value.ai,
            status: "stale",
            error: gitActionErrorMessage(cause),
          },
        }));
    }
  };

  if (!session) return null;
  const eligible =
    file?.content.kind === "text" &&
    file.content.ours.present &&
    file.content.theirs.present &&
    !file.external &&
    !file.resolved;
  return (
    <section
      className="space-y-2 border-t border-[var(--color-border)] p-3 text-xs"
      aria-label="AI conflict review"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">AI review queue</h3>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || session.queueRunning || !eligible}
          onClick={() => void prepare(filePath ? [filePath] : [])}
        >
          Preview selected file
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={
            disabled ||
            session.queueRunning ||
            !session.snapshot.conflicts.length
          }
          onClick={() =>
            void prepare(session.snapshot.conflicts.map((item) => item.path))
          }
        >
          Preview all eligible files
        </Button>
        {(session.queueRunning || previewPaths.length > 0) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              useConflictStore.getState().cancelQueue(repoPath);
              setPreviewPaths([]);
            }}
          >
            Cancel queue
          </Button>
        )}
      </div>
      <p className="text-[var(--color-text-muted)]">
        Only selected conflicted file content and bounded file history are sent
        to the provider shown below. Review for secrets first. AI never writes,
        stages or continues. Cancelling ignores an in-flight response; an
        already-sent provider request cannot be recalled.
      </p>
      {error && (
        <p role="alert" className="text-[var(--color-danger)]">
          {error}
        </p>
      )}
      {previewPaths.length > 0 && (
        <div className="space-y-2 rounded border border-[var(--color-warning-border)] p-2">
          <p className="font-semibold">
            Review context before sending {previewPaths.length} sequential
            request(s)
          </p>
          {previewPaths.map((path) => {
            const context = session.files[path]?.ai.context;
            return (
              context && (
                <details key={path}>
                  <summary className="cursor-pointer break-all">
                    {path} · {context.provider} / {context.model}
                    {context.truncated ? " · TRUNCATED" : ""}
                  </summary>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words bg-[var(--color-bg-primary)] p-2">
                    {context.context}
                  </pre>
                </details>
              )
            );
          })}
          <Button
            size="sm"
            variant="primary"
            disabled={disabled || session.queueRunning}
            onClick={() => void sendQueue()}
          >
            Send reviewed context
          </Button>
        </div>
      )}
      <div aria-live="polite" className="flex flex-wrap gap-2">
        {Object.entries(session.files)
          .filter(([, value]) => value.ai.status !== "idle")
          .map(([path, value]) => (
            <button
              type="button"
              key={path}
              className="giteye-chip max-w-full truncate"
              onClick={() => useConflictStore.getState().select(repoPath, path)}
            >
              {path} · {value.ai.status}
            </button>
          ))}
      </div>
      {file?.ai.error && (
        <p role="alert" className="text-[var(--color-warning)]">
          {file.ai.error} Use Preview selected file to retry.
        </p>
      )}
      {proposal && (
        <div className="space-y-2">
          <p className="font-semibold">
            {proposal.summary} · {proposal.provider} / {proposal.model}
          </p>
          <ul className="list-disc pl-5">
            {proposal.rationale.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
          {proposal.warnings.length > 0 && (
            <div className="rounded border border-[var(--color-warning-border)] p-2 text-[var(--color-warning)]">
              <strong>Ambiguities / warnings</strong>
              <ul className="list-disc pl-5">
                {proposal.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="max-h-96 overflow-auto">
            {reviewPatch ? (
              <DiffViewer
                filePath={filePath!}
                diffText={reviewPatch}
                mode="unified"
              />
            ) : (
              <p>No changes from the editor buffer.</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={disabled || file?.ai.status !== "ready"}
              onClick={() => void accept()}
            >
              Accept into editor only
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                useConflictStore
                  .getState()
                  .updateFile(repoPath, filePath!, (value) => ({
                    ...value,
                    ai: { status: "idle" },
                  }))
              }
            >
              Reject proposal
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
