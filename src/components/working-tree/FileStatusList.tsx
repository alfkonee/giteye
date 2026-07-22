import type { GitStatusFile, FileStatus } from "../../types/git";
import { parseFileStatus } from "../../types/git";
import { StatusBadge } from "../common/StatusBadge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { gitMutations } from "../../lib/git-data";
import { useAppStore } from "../../stores/app-store";
import { Plus, Minus, ChevronDown, ChevronRight, Archive, Trash2 } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { EmptyState } from "../common/EmptyState";
import { cn } from "../../lib/cn";
import { FileTree } from "../common/FileTree";
import { Button, SegmentedControl } from "../ui";
import {
  WorkingTreePathContextMenu,
  type WorkingTreePathTarget,
} from "./WorkingTreePathContextMenu";

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


export function FileStatusList({ title, files, isLoading, repoPath, staged }: FileStatusListProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<"tree" | "list">("tree");
  const [contextTarget, setContextTarget] = useState<WorkingTreePathTarget | null>(null);
  const setSelectedFile = useAppStore((s) => s.setSelectedFile);
  const queryClient = useQueryClient();
  const stageMutation = useMutation(gitMutations.stageFile(queryClient, repoPath));
  const unstageMutation = useMutation(gitMutations.unstageFile(queryClient, repoPath));
  const stageAllMutation = useMutation(gitMutations.stageAll(queryClient, repoPath));
  const unstageAllMutation = useMutation(gitMutations.unstageAll(queryClient, repoPath));
  const stashPathMutation = useMutation(gitMutations.createStashForPaths(queryClient, repoPath));
  const discardFileMutation = useMutation(gitMutations.discardFile(queryClient, repoPath));
  const discardFilesMutation = useMutation(gitMutations.discardFiles(queryClient, repoPath));
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

  const handleStashFile = (file: GitStatusFile) => {
    if (
      file.staged &&
      file.unstaged &&
      !confirm(
        `"${file.path}" has both staged and unstaged changes. Stashing the path will stash both. Continue?`,
      )
    ) {
      return;
    }
    const message = `WIP ${file.path}`;
    stashPathMutation.mutate({
      message,
      includeUntracked: parseFileStatus(file.status) === "untracked",
      paths: [file.path],
    });
  };

  const handleDiscardFile = (file: GitStatusFile) => {
    const status = parseFileStatus(file.status);
    const scope = staged
      ? file.unstaged
        ? "staged and unstaged file changes"
        : "staged file changes"
      : status === "untracked"
        ? "untracked file"
        : "unstaged file changes";
    if (
      !confirm(
        `Discard ${scope} for "${file.path}"?\n\nThis cannot be undone from GitEye. Recovery may only be possible from editor/OS backups; stash or commit first if you need a Git safety net.`,
      )
    ) {
      return;
    }
    discardFileMutation.mutate({
      filePath: file.path,
      staged,
      untracked: status === "untracked",
    });
  };

  const openFileContextMenu = (event: MouseEvent, file: GitStatusFile) => {
    event.preventDefault();
    setSelectedFile(file.path, staged);
    setContextTarget({
      kind: "file",
      path: file.path,
      files: [file],
      x: event.clientX,
      y: event.clientY,
    });
  };

  const openDirectoryContextMenu = (
    event: MouseEvent,
    path: string,
    directoryFiles: GitStatusFile[],
  ) => {
    event.preventDefault();
    setContextTarget({
      kind: "directory",
      path,
      files: directoryFiles,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const handleStashTarget = (target: WorkingTreePathTarget) => {
    const includesPartialChanges = target.files.some((file) => file.staged && file.unstaged);
    if (
      includesPartialChanges &&
      !confirm(
        `"${target.path}" includes files with both staged and unstaged changes. Stashing this ${target.kind} will stash both. Continue?`,
      )
    ) {
      return;
    }
    stashPathMutation.mutate({
      message: `WIP ${target.path}`,
      includeUntracked: target.files.some(
        (file) => parseFileStatus(file.status) === "untracked",
      ),
      paths: [target.path],
    });
  };

  const handleDiscardTarget = (target: WorkingTreePathTarget) => {
    if (target.kind === "file") {
      handleDiscardFile(target.files[0]);
      return;
    }

    const includesPartialChanges = staged && target.files.some((file) => file.unstaged);
    const scope = includesPartialChanges
      ? "staged and unstaged changes"
      : staged
        ? "staged changes"
        : "unstaged changes";
    if (
      !confirm(
        `Discard ${scope} for ${target.files.length} files in "${target.path}"?\n\nThis cannot be undone from GitEye. Recovery may only be possible from editor/OS backups; stash or commit first if you need a Git safety net.`,
      )
    ) {
      return;
    }

    discardFilesMutation.mutate({
      path: target.path,
      files: target.files.map((file) => ({
        filePath: file.path,
        staged,
        untracked: parseFileStatus(file.status) === "untracked",
      })),
    });
  };

  const contextMenuPending =
    stageMutation.isPending ||
    unstageMutation.isPending ||
    stashPathMutation.isPending ||
    discardFileMutation.isPending ||
    discardFilesMutation.isPending;

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/95 px-3 py-1.5 backdrop-blur">
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
        <SegmentedControl
          items={[
            { id: "tree", label: "Tree" },
            { id: "list", label: "List" },
          ]}
          value={viewMode}
          onChange={(id) => setViewMode(id as "tree" | "list")}
          className="text-[10px]"
        />
        {files.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => (staged ? unstageAllMutation.mutate() : stageAllMutation.mutate())}
            disabled={isBulkMutating}
          >
            {staged ? "Unstage all" : "Stage all"}
          </Button>
        )}
      </div>

      {!collapsed && (
        <div className="px-2 py-1.5">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <LoadingSpinner size="md" />
            </div>
          ) : files.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/40 py-5">
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
            <div className="space-y-1.5">
              {groups.map((group) => (
                <div key={group.key} className="overflow-hidden rounded-lg bg-[var(--color-bg-secondary)]/35 ring-1 ring-inset ring-[var(--color-border-muted)]/70">
                  <div className="flex items-center gap-1.5 border-b border-[var(--color-border-muted)]/60 bg-[var(--color-bg-tertiary)]/30 px-2 py-1">
                    <span className={cn("h-2 w-2 rounded-full", group.accentClass)} />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                      {group.title}
                    </span>
                    <span className="ml-auto text-[10px] tabular-nums text-[var(--color-text-muted)]">
                      {group.files.length}
                    </span>
                  </div>
                  {viewMode === "tree" ? (
                    <FileTree
                      items={group.files}
                      getPath={(file) => file.path}
                      className="rounded-none border-0 bg-transparent"
                      selectedKey={selectedFileStaged === staged ? selectedFilePath : null}
                      onSelect={handleFileClick}
                      onFileContextMenu={openFileContextMenu}
                      onDirectoryContextMenu={openDirectoryContextMenu}
                      renderIcon={(file) => (
                        <StatusBadge status={parseFileStatus(file.status)} className="h-4 w-4 text-[9px]" />
                      )}
                      renderSubtext={(file) =>
                        file.oldPath ? (
                          <span className="block truncate text-[10px] leading-3 text-[var(--color-text-muted)]">
                            renamed from {file.oldPath}
                          </span>
                        ) : null
                      }
                      renderTrailing={(file, isSelected) => {
                        const status = parseFileStatus(file.status);
                        const isMutating =
                          (staged && unstageMutation.isPending) ||
                          (!staged && stageMutation.isPending) ||
                          stashPathMutation.isPending ||
                          discardFileMutation.isPending;

                        return (
                          <div className="ml-auto flex items-center gap-0.5">
                            {!staged && (
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleStashFile(file);
                                }}
                                disabled={isMutating}
                                className={cn(
                                  "rounded p-0.5 transition-all disabled:cursor-not-allowed disabled:opacity-50",
                                  isSelected
                                    ? "text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
                                    : "text-[var(--color-text-muted)] opacity-0 hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] group-hover:opacity-100",
                                )}
                                title="Stash selected file"
                              >
                                <Archive className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDiscardFile(file);
                              }}
                              disabled={isMutating}
                              className={cn(
                                "rounded p-0.5 transition-all disabled:cursor-not-allowed disabled:opacity-50",
                                isSelected
                                  ? "text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
                                  : "text-[var(--color-text-muted)] opacity-0 hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)] group-hover:opacity-100",
                              )}
                              title="Discard file changes"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                handleStageToggle(file);
                              }}
                              disabled={isMutating}
                              className={cn(
                                "rounded p-0.5 transition-all disabled:cursor-not-allowed disabled:opacity-50",
                                isSelected
                                  ? "text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
                                  : "text-[var(--color-text-muted)] opacity-0 hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] group-hover:opacity-100",
                                statusTone(status),
                              )}
                              title={staged ? "Unstage" : "Stage"}
                            >
                              {staged ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        );
                      }}
                    />
                  ) : (
                    <div className="divide-y divide-[var(--color-border-muted)]/70">
                      {group.files.map((file) => {
                        const status = parseFileStatus(file.status);
                        const isSelected =
                          selectedFilePath === file.path && selectedFileStaged === staged;
                        const isMutating =
                          (staged && unstageMutation.isPending) ||
                          (!staged && stageMutation.isPending) ||
                          stashPathMutation.isPending ||
                          discardFileMutation.isPending;
                        const slash = file.path.lastIndexOf("/");
                        const directory = slash === -1 ? "" : file.path.slice(0, slash + 1);
                        const name = slash === -1 ? file.path : file.path.slice(slash + 1);

                        return (
                          <div
                            key={file.path}
                            className={cn(
                              "group grid min-h-[30px] cursor-pointer grid-cols-[18px_minmax(0,1fr)_76px] items-center gap-1.5 px-2 py-0.5 transition-colors",
                              isSelected
                                ? "giteye-selected-row"
                                : "hover:bg-[var(--color-bg-hover)]",
                            )}
                            onClick={() => handleFileClick(file)}
                            onContextMenu={(event) => openFileContextMenu(event, file)}
                          >
                            <StatusBadge status={status} className="h-4 w-4 text-[9px]" />
                            <div className="min-w-0">
                              <div
                                className={cn(
                                  "truncate text-[12px] font-medium leading-4",
                                  isSelected ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-primary)]",
                                )}
                              >
                                {directory && (
                                  <span className="font-normal text-[var(--color-text-muted)]">
                                    {directory}
                                  </span>
                                )}
                                <span>{name}</span>
                              </div>
                              {file.oldPath && (
                                <div className="truncate text-[10px] leading-3 text-[var(--color-text-muted)]">
                                  renamed from {file.oldPath}
                                </div>
                              )}
                            </div>
                            <div className="ml-auto flex items-center gap-0.5">
                              {!staged && (
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleStashFile(file);
                                  }}
                                  disabled={isMutating}
                                  className={cn(
                                    "rounded p-0.5 transition-all disabled:cursor-not-allowed disabled:opacity-50",
                                    isSelected
                                      ? "text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
                                      : "text-[var(--color-text-muted)] opacity-0 hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] group-hover:opacity-100",
                                  )}
                                  title="Stash selected file"
                                >
                                  <Archive className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDiscardFile(file);
                                }}
                                disabled={isMutating}
                                className={cn(
                                  "rounded p-0.5 transition-all disabled:cursor-not-allowed disabled:opacity-50",
                                  isSelected
                                    ? "text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
                                    : "text-[var(--color-text-muted)] opacity-0 hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-danger)] group-hover:opacity-100",
                                )}
                                title="Discard file changes"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleStageToggle(file);
                                }}
                                disabled={isMutating}
                                className={cn(
                                  "rounded p-0.5 transition-all disabled:cursor-not-allowed disabled:opacity-50",
                                  isSelected
                                    ? "text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
                                    : "text-[var(--color-text-muted)] opacity-0 hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] group-hover:opacity-100",
                                  statusTone(status),
                                )}
                                title={staged ? "Unstage" : "Stage"}
                              >
                                {staged ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <WorkingTreePathContextMenu
        target={contextTarget}
        repoPath={repoPath}
        staged={staged}
        pending={contextMenuPending}
        onStage={(path) => stageMutation.mutate(path)}
        onUnstage={(path) => unstageMutation.mutate(path)}
        onStash={handleStashTarget}
        onDiscard={handleDiscardTarget}
        onClose={() => setContextTarget(null)}
      />
    </div>
  );
}
