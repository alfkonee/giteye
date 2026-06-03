import type { GitStatusFile, FileStatus } from "../../types/git";
import { parseFileStatus } from "../../types/git";
import { StatusBadge } from "../common/StatusBadge";
import { useStageFile, useUnstageFile, useStageAll, useUnstageAll } from "../../hooks/useGitStatus";
import { useAppStore } from "../../stores/app-store";
import { Plus, Minus, ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { EmptyState } from "../common/EmptyState";
import { cn } from "../../lib/cn";

interface FileStatusListProps {
  title: string;
  files: GitStatusFile[];
  isLoading: boolean;
  repoPath: string | null;
  staged: boolean;
}

type FileGroup = {
  key: string;
  title: string;
  files: GitStatusFile[];
  accentClass: string;
};

function groupFiles(files: GitStatusFile[], staged: boolean): FileGroup[] {
  if (staged) {
    return [
      {
        key: "staged",
        title: "Staged",
        files,
        accentClass: "bg-[var(--color-success)]",
      },
    ];
  }

  const ignored: GitStatusFile[] = [];
  const unstaged: GitStatusFile[] = [];

  for (const file of files) {
    if (parseFileStatus(file.status) === "ignored") {
      ignored.push(file);
    } else {
      unstaged.push(file);
    }
  }

  return [
    {
      key: "unstaged",
      title: "Unstaged",
      files: unstaged,
      accentClass: "bg-[var(--color-accent)]",
    },
    {
      key: "ignored",
      title: "Ignored",
      files: ignored,
      accentClass: "bg-[var(--color-text-muted)]",
    },
  ].filter((group) => group.files.length > 0);
}

function statusTone(status: FileStatus): string {
  switch (status) {
    case "added":
    case "untracked":
      return "text-[var(--color-success)]";
    case "deleted":
    case "conflict":
      return "text-[var(--color-danger)]";
    case "modified":
    case "typechange":
      return "text-[var(--color-warning)]";
    case "renamed":
    case "copied":
      return "text-[var(--color-accent)]";
    case "ignored":
      return "text-[var(--color-text-muted)]";
  }
}

function splitPath(path: string): { directory: string; name: string } {
  const slash = path.lastIndexOf("/");
  if (slash === -1) return { directory: "", name: path };
  return { directory: path.slice(0, slash + 1), name: path.slice(slash + 1) };
}

export function FileStatusList({ title, files, isLoading, repoPath, staged }: FileStatusListProps) {
  const [collapsed, setCollapsed] = useState(false);
  const setSelectedFile = useAppStore((s) => s.setSelectedFile);
  const stageMutation = useStageFile(repoPath);
  const unstageMutation = useUnstageFile(repoPath);
  const stageAllMutation = useStageAll(repoPath);
  const unstageAllMutation = useUnstageAll(repoPath);
  const selectedFilePath = useAppStore((s) => s.selectedFilePath);
  const selectedFileStaged = useAppStore((s) => s.selectedFileStaged);
  const groups = groupFiles(files, staged);
  const isBulkMutating = staged ? unstageAllMutation.isPending : stageAllMutation.isPending;

  const handleFileClick = (file: GitStatusFile) => {
    setSelectedFile(file.path, staged);
  };

  const handleStageToggle = (file: GitStatusFile) => {
    if (staged) {
      unstageMutation.mutate(file.path);
    } else {
      stageMutation.mutate(file.path);
    }
  };

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/95 px-4 py-2 backdrop-blur">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded p-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
          {title}
        </span>
        <span className="rounded-full border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--color-text-muted)]">
          {files.length}
        </span>
        <div className="flex-1" />
        {files.length > 0 && (
          <button
            onClick={() => (staged ? unstageAllMutation.mutate() : stageAllMutation.mutate())}
            disabled={isBulkMutating}
            className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] shadow-sm transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {staged ? "Unstage all" : "Stage all"}
          </button>
        )}
        <button className="rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]" aria-label={`${title} actions`}>
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 py-2">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner size="md" />
            </div>
          ) : files.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/40 py-6">
              <EmptyState
                title={staged ? "No staged files" : "No unstaged files"}
                description={
                  staged
                    ? "Stage files from the unstaged list to prepare a commit"
                    : "Working tree is clean"
                }
              />
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map((group) => (
                <div key={group.key} className="overflow-hidden rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/45 shadow-sm">
                  <div className="flex items-center gap-2 border-b border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)]/50 px-2.5 py-1.5">
                    <span className={cn("h-2 w-2 rounded-full", group.accentClass)} />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                      {group.title}
                    </span>
                    <span className="ml-auto text-[10px] tabular-nums text-[var(--color-text-muted)]">
                      {group.files.length}
                    </span>
                  </div>
                  <div className="divide-y divide-[var(--color-border-muted)]/70">
                    {group.files.map((file) => {
                      const status = parseFileStatus(file.status);
                      const isSelected =
                        selectedFilePath === file.path && selectedFileStaged === staged;
                      const isMutating =
                        (staged && unstageMutation.isPending) ||
                        (!staged && stageMutation.isPending);
                      const { directory, name } = splitPath(file.path);

                      return (
                        <div
                          key={file.path}
                          className={cn(
                            "group grid min-h-[32px] cursor-pointer grid-cols-[20px_minmax(0,1fr)_32px] items-center gap-2 px-2.5 py-1 transition-colors",
                            isSelected
                              ? "bg-[var(--color-bg-selected)] text-white"
                              : "hover:bg-[var(--color-bg-hover)]"
                          )}
                          onClick={() => handleFileClick(file)}
                        >
                          <StatusBadge status={status} className="h-4 w-4 text-[9px]" />
                          <div className="min-w-0">
                            <div
                              className={cn(
                                "truncate text-[12px] font-medium leading-4",
                                isSelected ? "text-white" : "text-[var(--color-text-primary)]"
                              )}
                            >
                              {directory && (
                                <span className={cn("font-normal", isSelected ? "text-white/55" : "text-[var(--color-text-muted)]")}>
                                  {directory}
                                </span>
                              )}
                              <span>{name}</span>
                            </div>
                            {file.oldPath && (
                              <div className={cn("truncate text-[10px] leading-3", isSelected ? "text-white/60" : "text-[var(--color-text-muted)]")}>
                                renamed from {file.oldPath}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStageToggle(file);
                            }}
                            disabled={isMutating}
                            className={cn(
                              "ml-auto rounded p-1 transition-all disabled:cursor-not-allowed disabled:opacity-50",
                              isSelected
                                ? "text-white hover:bg-white/15"
                                : "text-[var(--color-text-muted)] opacity-0 hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] group-hover:opacity-100",
                              statusTone(status)
                            )}
                            title={staged ? "Unstage" : "Stage"}
                          >
                            {staged ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
