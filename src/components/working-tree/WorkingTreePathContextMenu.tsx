import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  Archive,
  Copy,
  ExternalLink,
  EyeOff,
  FolderOpen,
  GitBranch,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import type { GitStatusFile } from "../../types/git";
import { parseFileStatus } from "../../types/git";
import { appDialog } from "../common/AppDialogProvider";

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
  submodulePath?: string | null;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onStash: (target: WorkingTreePathTarget) => void;
  onDiscard: (target: WorkingTreePathTarget) => void;
  onIgnore: (target: WorkingTreePathTarget) => void;
  onOpenSubmodule: (path: string) => void;
  onClose: () => void;
}

export function WorkingTreePathContextMenu({
  target,
  repoPath,
  staged,
  pending,
  submodulePath,
  onStage,
  onUnstage,
  onStash,
  onDiscard,
  onIgnore,
  onOpenSubmodule,
  onClose,
}: WorkingTreePathContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: target?.x ?? 0, top: target?.y ?? 0 });

  useLayoutEffect(() => {
    if (!target || !menuRef.current) return;

    const updatePosition = () => {
      const { width, height } = menuRef.current!.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(target.x, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(target.y, window.innerHeight - height - 8)),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [target]);

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
  // Git only skips untracked paths; a path already in the index keeps reporting changes.
  const ignorable = target.files.some(
    (file) => parseFileStatus(file.status) === "untracked",
  );
  const absolutePath = joinRepoPath(repoPath, target.path);
  const fallbackRelativePath = target.path.includes("/")
    ? target.path.slice(0, target.path.lastIndexOf("/"))
    : "";
  const revealPath = targetExists
    ? absolutePath
    : joinRepoPath(repoPath, fallbackRelativePath);


  const runPlatformAction = async (action: () => Promise<void>, description: string) => {
    onClose();
    try {
      await action();
    } catch (error) {
      await appDialog.alert(
        `${description} failed: ${error instanceof Error ? error.message : String(error)}`,
        `${description} failed`,
      );
    }
  };

  const copyPath = (value: string) =>
    runPlatformAction(() => navigator.clipboard.writeText(value), "Copy path");

  return createPortal(
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
        ref={menuRef}
        role="menu"
        aria-label={`${target.kind === "directory" ? "Folder" : "File"} actions for ${target.path}`}
        className="giteye-context-menu fixed max-h-[calc(100vh-16px)] w-[248px] overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] shadow-[var(--shadow-elevated)]"
        style={position}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="giteye-context-header flex items-baseline gap-2 border-b border-[var(--color-border-muted)]">
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-[var(--color-text-primary)]">
            {target.path}
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
            {target.kind === "directory" ? `${target.files.length} files` : "file"}
          </span>
        </div>

        {submodulePath ? (
          <>
            <MenuItem
              icon={<GitBranch />}
              label="Switch to submodule"
              disabled={pending}
              onClick={() => {
                onOpenSubmodule(submodulePath);
                onClose();
              }}
            />
            <div className="giteye-context-separator" />
          </>
        ) : null}

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

        <div className="giteye-context-separator" />
        <MenuItem
          icon={<EyeOff />}
          label={`Ignore ${label}…`}
          disabled={pending || !ignorable}
          title={
            ignorable
              ? `Add a gitignore rule for this ${label}`
              : `Only untracked paths can be ignored; this ${label} is already tracked by Git`
          }
          onClick={() => {
            onIgnore(target);
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

        <div className="giteye-context-separator" />
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
    </div>,
    document.body,
  );
}

function MenuItem({
  icon,
  label,
  disabled = false,
  tone = "default",
  title,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  tone?: "default" | "danger";
  title?: string;
  onClick: () => void;
}) {
  const button = (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      title={label}
      className={`giteye-context-item ${
        tone === "danger" ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]"
      }`}
    >
      {icon}
      <span className="giteye-context-label">{label}</span>
    </button>
  );

  // Disabled buttons swallow pointer events, so the tooltip has to live on a wrapper.
  return title ? (
    <span className="block" title={title}>
      {button}
    </span>
  ) : (
    button
  );
}

function joinRepoPath(repoPath: string, relativePath: string) {
  const separator = repoPath.includes("\\") ? "\\" : "/";
  const root = repoPath.replace(/[\\/]$/, "");
  const relative = relativePath.replace(/\//g, separator);
  return relative ? `${root}${separator}${relative}` : root;
}
