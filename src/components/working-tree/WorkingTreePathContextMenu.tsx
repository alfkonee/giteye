import { useEffect, type ReactNode } from "react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  Archive,
  Copy,
  ExternalLink,
  FolderOpen,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import type { GitStatusFile } from "../../types/git";
import { parseFileStatus } from "../../types/git";

export interface WorkingTreePathTarget {
  kind: "file" | "directory";
  path: string;
  files: GitStatusFile[];
  x: number;
  y: number;
}

interface WorkingTreePathContextMenuProps {
  target: WorkingTreePathTarget | null;
  repoPath: string | null;
  staged: boolean;
  pending: boolean;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onStash: (target: WorkingTreePathTarget) => void;
  onDiscard: (target: WorkingTreePathTarget) => void;
  onClose: () => void;
}

export function WorkingTreePathContextMenu({
  target,
  repoPath,
  staged,
  pending,
  onStage,
  onUnstage,
  onStash,
  onDiscard,
  onClose,
}: WorkingTreePathContextMenuProps) {
  useEffect(() => {
    if (!target) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", onClose);
    };
  }, [target, onClose]);

  if (!target || !repoPath) return null;

  const label = target.kind === "directory" ? "folder" : "file";
  const targetExists = target.files.some(
    (file) => parseFileStatus(file.status) !== "deleted",
  );
  const absolutePath = joinRepoPath(repoPath, target.path);
  const fallbackRelativePath = target.path.includes("/")
    ? target.path.slice(0, target.path.lastIndexOf("/"))
    : "";
  const revealPath = targetExists
    ? absolutePath
    : joinRepoPath(repoPath, fallbackRelativePath);
  const left = Math.max(8, Math.min(target.x, window.innerWidth - 288));
  const top = Math.max(8, Math.min(target.y, window.innerHeight - 392));

  const runPlatformAction = async (action: () => Promise<void>, description: string) => {
    onClose();
    try {
      await action();
    } catch (error) {
      window.alert(`${description} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const copyPath = (value: string) =>
    runPlatformAction(() => navigator.clipboard.writeText(value), "Copy path");

  return (
    <div
      className="fixed inset-0 z-[120]"
      role="presentation"
      onMouseDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        role="menu"
        aria-label={`${target.kind === "directory" ? "Folder" : "File"} actions for ${target.path}`}
        className="fixed max-h-[calc(100vh-16px)] w-[280px] overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] py-1 shadow-[var(--shadow-elevated)]"
        style={{ left, top }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--color-border-muted)] px-3 py-2">
          <div className="truncate text-xs font-medium text-[var(--color-text-primary)]">
            {target.path}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            {target.kind === "directory" ? `${target.files.length} changed files` : "Changed file"}
          </div>
        </div>

        <MenuItem
          icon={staged ? <Minus /> : <Plus />}
          label={`${staged ? "Unstage" : "Stage"} ${label}`}
          disabled={pending}
          onClick={() => {
            staged ? onUnstage(target.path) : onStage(target.path);
            onClose();
          }}
        />
        {!staged && (
          <MenuItem
            icon={<Archive />}
            label={`Stash ${label} changes`}
            disabled={pending}
            onClick={() => {
              onStash(target);
              onClose();
            }}
          />
        )}
        <MenuItem
          icon={<Trash2 />}
          label={`Discard ${label} changes`}
          tone="danger"
          disabled={pending}
          onClick={() => {
            onDiscard(target);
            onClose();
          }}
        />

        <div className="my-1 border-t border-[var(--color-border-muted)]" />
        <MenuItem
          icon={<ExternalLink />}
          label={`Open ${label}`}
          disabled={!targetExists}
          onClick={() => void runPlatformAction(() => openPath(absolutePath), `Open ${label}`)}
        />
        <MenuItem
          icon={<FolderOpen />}
          label={targetExists ? "Reveal in file manager" : "Open containing folder"}
          onClick={() =>
            void runPlatformAction(
              () => targetExists ? revealItemInDir(revealPath) : openPath(revealPath),
              "Open file manager",
            )
          }
        />

        <div className="my-1 border-t border-[var(--color-border-muted)]" />
        <MenuItem
          icon={<Copy />}
          label="Copy relative path"
          onClick={() => void copyPath(target.path)}
        />
        <MenuItem
          icon={<Copy />}
          label="Copy absolute path"
          onClick={() => void copyPath(absolutePath)}
        />
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  disabled = false,
  tone = "default",
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  tone?: "default" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent ${
        tone === "danger" ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]"
      }`}
    >
      <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function joinRepoPath(repoPath: string, relativePath: string) {
  const separator = repoPath.includes("\\") ? "\\" : "/";
  const root = repoPath.replace(/[\\/]$/, "");
  const relative = relativePath.replace(/\//g, separator);
  return relative ? `${root}${separator}${relative}` : root;
}
