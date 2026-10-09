import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { gitQueries } from "../../lib/git-data";
import { useExclusiveMenu } from "../../lib/exclusive-menu";
import { useGitRefActions } from "../../hooks/useGitRefActions";
import { useAppStore } from "../../stores/app-store";
import { useNoticeStore } from "../../stores/notice-store";
import type { GitTag, StashEntry } from "../../types/git";

export type GitRefMenuTarget =
  | { kind: "tag"; tag: GitTag }
  | { kind: "stash"; stash: StashEntry }
  | { kind: "workingTree" };

export function GitRefContextMenu({ target, x, y, onClose, onLocateBase }: {
  target: GitRefMenuTarget;
  x: number;
  y: number;
  onClose: () => void;
  onLocateBase?: (hash: string) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const [copyError, setCopyError] = useState<string | null>(null);
  const actions = useGitRefActions();
  const repoPath = useAppStore((state) => state.activeRepoPath);
  const setSelectedGitRef = useAppStore((state) => state.setSelectedGitRef);
  const operation = useQuery(gitQueries.operationSummary(repoPath));
  const operationBlocked = Boolean(operation.data?.operation || operation.data?.conflicts.length);
  useExclusiveMenu(true, onClose);

  useLayoutEffect(() => {
    const rect = menu.current?.getBoundingClientRect();
    if (!rect) return;
    const margin = 8;
    setPosition({
      left: Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin)),
    });
  }, [x, y, target]);

  useEffect(() => {
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menu.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus();
    const closeOnViewportChange = () => onClose();
    window.addEventListener("scroll", closeOnViewportChange, true);
    window.addEventListener("resize", closeOnViewportChange);
    return () => {
      window.removeEventListener("scroll", closeOnViewportChange, true);
      window.removeEventListener("resize", closeOnViewportChange);
      restoreFocus.current?.focus();
    };
  }, [onClose]);

  const inspect = () => {
    if (target.kind === "tag") setSelectedGitRef({ kind: "tag", name: target.tag.name, commitHash: target.tag.commitHash });
    if (target.kind === "stash") setSelectedGitRef({ kind: "stash", name: target.stash.name, commitHash: target.stash.commitHash });
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCopyError(`Could not copy to clipboard: ${message}`);
      useNoticeStore.getState().startNotice({ title: "Copy failed", detail: message, repoPath, status: "error" });
    }
  };

  const items: { label: string; action: () => void | Promise<void>; disabled?: boolean; destructive?: boolean }[] = target.kind === "tag" ? [
    { label: "Inspect tag and target", action: inspect },
    { label: "Checkout detached…", action: () => actions.checkoutTag(target.tag), disabled: actions.isBusy || operationBlocked || !target.tag.commitHash },
    { label: "Create branch here…", action: () => actions.branchFromTag(target.tag), disabled: actions.isBusy || operationBlocked || !target.tag.commitHash },
    { label: "Push to remote…", action: () => actions.pushTag(target.tag), disabled: actions.isBusy },
    { label: "Delete local…", action: () => actions.deleteLocalTag(target.tag), disabled: actions.isBusy, destructive: true },
    { label: "Delete from remote…", action: () => actions.deleteRemoteTag(target.tag), disabled: actions.isBusy, destructive: true },
    { label: "Copy name", action: () => copy(target.tag.name) },
    { label: "Copy target hash", action: () => copy(target.tag.commitHash), disabled: !target.tag.commitHash },
  ] : target.kind === "stash" ? [
    { label: "Inspect changes", action: inspect },
    { label: "Apply…", action: () => actions.applyStash(target.stash), disabled: actions.isBusy || operationBlocked },
    { label: "Pop…", action: () => actions.popStash(target.stash), disabled: actions.isBusy || operationBlocked },
    { label: "Create branch from stash…", action: () => actions.branchFromStash(target.stash), disabled: actions.isBusy || operationBlocked },
    { label: "Drop…", action: () => actions.dropStash(target.stash), disabled: actions.isBusy, destructive: true },
    { label: "Copy selector", action: () => copy(target.stash.name) },
    { label: "Copy stash hash", action: () => copy(target.stash.commitHash) },
    { label: "Locate base commit", action: () => onLocateBase?.(target.stash.baseCommitHash), disabled: !onLocateBase },
  ] : [
    { label: "Create stash…", action: () => actions.createStash(), disabled: actions.isBusy || operationBlocked },
  ];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? [])];
    if (!buttons.length) return;
    event.preventDefault();
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : event.key === "ArrowDown" ? (current + 1) % buttons.length : (current - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  if (typeof document === "undefined" || !document.body) return null;
  const title = target.kind === "tag" ? `Tag ${target.tag.name}` : target.kind === "stash" ? `Stash ${target.stash.name}` : "Working tree";
  return createPortal(
    <div className="fixed inset-0 z-[115]" role="presentation"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => { event.stopPropagation(); onClose(); }}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}>
      <div ref={menu} role="menu" aria-label={`${title} actions`} onKeyDown={onKeyDown} onMouseDown={(event) => event.stopPropagation()}
        className="giteye-context-menu fixed max-h-[calc(100vh-16px)] w-[270px] overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] shadow-[var(--shadow-elevated)]"
        style={{ left: position.left, top: position.top }}>
        <div className="giteye-context-header truncate border-b border-[var(--color-border-muted)] font-medium">{title}</div>
        {items.map((item) => (
          <button key={item.label} type="button" role="menuitem" disabled={item.disabled} className="giteye-context-item disabled:opacity-50"
            onClick={(event) => { event.stopPropagation(); onClose(); void item.action(); }}>
            <span className={`giteye-context-label ${item.destructive ? "text-[var(--color-danger)]" : ""}`}>{item.label}</span>
          </button>
        ))}
        {copyError || actions.error ? <p role="alert" className="px-2 py-1 text-xs text-[var(--color-danger)]">{copyError ?? actions.error}</p> : null}
      </div>
    </div>, document.body,
  );
}
