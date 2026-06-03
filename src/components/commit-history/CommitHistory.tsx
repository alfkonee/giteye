import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAppStore } from "../../stores/app-store";
import { useCommitHistory } from "../../hooks/useCommitHistory";
import { CommitListItem } from "./CommitListItem";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { EmptyState } from "../common/EmptyState";
import { ErrorCallout } from "../common/ErrorCallout";
import { GitCommitHorizontal, History } from "lucide-react";

export function CommitHistory() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const { data: commits, isLoading, error } = useCommitHistory(activeRepoPath, 100);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: commits?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 46,
    overscan: 10,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <ErrorCallout message="Failed to load commit history" />
      </div>
    );
  }

  if (!commits || commits.length === 0) {
    return (
      <EmptyState
        icon={<History className="w-8 h-8" />}
        title="No Commits"
        description="This repository has no commits yet"
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-primary)]">
      <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--color-accent)]/15 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/25">
            <History className="h-3.5 w-3.5" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-[var(--color-text-primary)]">
              History
            </h2>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              {commits.length} commits in this branch view
            </p>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 grid grid-cols-[34px_64px_minmax(0,1fr)_120px_74px] items-center gap-2 border-b border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)] backdrop-blur">
        <span className="flex items-center justify-center">
          <GitCommitHorizontal className="h-3.5 w-3.5" />
        </span>
        <span>Hash</span>
        <span>Message</span>
        <span className="text-right">Author</span>
        <span className="text-right">Date</span>
      </div>

      <div ref={parentRef} className="flex-1 overflow-auto px-2 py-2">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const commit = commits[virtualItem.index];
            return (
              <div
                key={virtualItem.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <CommitListItem commit={commit} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
