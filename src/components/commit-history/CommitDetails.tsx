import { useState, type MouseEvent } from "react";
import type { CommitDetails as CommitDetailsType } from "../../types/git";
import { truncateHash } from "../../lib/format";
import { cn } from "../../lib/cn";
import { useAppStore } from "../../stores/app-store";
import { Calendar, User, ChevronRight, Hash, MessageSquare, Files, GitCommitHorizontal } from "lucide-react";
import { FileTree } from "../common/FileTree";
import { CommitActionContextMenu, CommitActionStrip } from "./HistorySurgeryActions";
import { SegmentedControl } from "../ui";

interface CommitDetailsProps {
  commit: CommitDetailsType;
}

export function CommitDetails({ commit }: CommitDetailsProps) {
  const [viewMode, setViewMode] = useState<"tree" | "list">("tree");
  const selectedCommitFilePath = useAppStore((s) => s.selectedCommitFilePath);
  const setSelectedCommitFilePath = useAppStore((s) => s.setSelectedCommitFilePath);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const openContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-primary)]" onContextMenu={(event) => event.preventDefault()}>
      <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3" onContextMenu={openContextMenu}>
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)]/15 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/25">
            <GitCommitHorizontal className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold leading-snug text-[var(--color-text-primary)]">
              {commit.message}
            </h3>
            <div className="mt-2 grid gap-1.5 text-[12px] text-[var(--color-text-secondary)]">
              <div className="flex min-w-0 items-center gap-2">
                <User className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
                <span className="font-medium">{commit.authorName}</span>
                <span className="truncate text-[var(--color-text-muted)]">
                  &lt;{commit.authorEmail}&gt;
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                <span>{new Date(commit.timestamp).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-b border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/55 px-3 py-2 text-[12px]" onContextMenu={openContextMenu}>
        <div className="flex min-w-0 items-center gap-1.5">
          <Hash className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
          <span className="text-[var(--color-text-muted)]">commit</span>
          <span className="truncate font-mono text-[var(--color-accent)]">{commit.hash}</span>
        </div>
        {commit.parents.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[var(--color-text-muted)]">
              {commit.parents.length > 1 ? "parents" : "parent"}
            </span>
            {commit.parents.map((p, i) => (
              <code
                key={i}
                className="rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-secondary)]"
              >
                {truncateHash(p, 8)}
              </code>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-b border-[var(--color-border-muted)] px-3 py-2" onContextMenu={openContextMenu}>
        <CommitActionStrip target={commit} />
      </div>
      {contextMenu ? (
        <CommitActionContextMenu
          target={commit}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      {commit.body && (
        <div className="shrink-0 border-b border-[var(--color-border-muted)] px-3 py-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            <MessageSquare className="h-3 w-3" />
            Description
          </div>
          <pre className="whitespace-pre-wrap rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/50 p-2 font-sans text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
            {commit.body}
          </pre>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            <Files className="h-3.5 w-3.5" />
            Changed Files
            <span className="inline-flex h-4 min-w-[18px] items-center justify-center rounded-full border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-1 text-[9px] tabular-nums text-[var(--color-text-muted)]">
              {commit.changedFiles.length}
            </span>
            <SegmentedControl
              items={[
                { id: "tree", label: "Tree" },
                { id: "list", label: "List" },
              ]}
              value={viewMode}
              onChange={(id) => setViewMode(id as "tree" | "list")}
              className="ml-auto normal-case tracking-normal"
            />
          </div>
          {commit.changedFiles.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--color-border-muted)] py-4 text-center text-[12px] italic text-[var(--color-text-muted)]">
              No files changed
            </p>
          ) : (
            viewMode === "tree" ? (
              <FileTree
                items={commit.changedFiles}
                getPath={(file) => file}
                selectedKey={selectedCommitFilePath}
                onSelect={setSelectedCommitFilePath}
                className="bg-[var(--color-bg-secondary)]/45"
              />
            ) : (
              <div className="overflow-hidden rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/45">
                {commit.changedFiles.map((file) => {
                  const isSelected = selectedCommitFilePath === file;

                  return (
                    <button
                      key={file}
                      type="button"
                      onClick={() => setSelectedCommitFilePath(file)}
                      className={cn(
                        "group flex w-full cursor-pointer items-center gap-1.5 border-b border-[var(--color-border-muted)]/70 px-2 py-1.5 text-left text-[12px] transition-colors last:border-b-0",
                        isSelected
                          ? "giteye-selected-row"
                          : "text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]",
                      )}
                    >
                      <ChevronRight className={cn("h-3.5 w-3.5 transition-colors", isSelected ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)]")} />
                      <span className={cn("truncate font-mono", isSelected ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]")}>
                        {file}
                      </span>
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
