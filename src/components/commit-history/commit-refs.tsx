import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Branch, GitTag } from "../../types/git";
import { cn } from "../../lib/cn";
import { useExclusiveMenu } from "../../lib/exclusive-menu";
import { Cloud, GitBranch, Tag } from "lucide-react";

export interface DisplayRef {
  label: string;
  isHead: boolean;
  isRemote: boolean;
  isTag: boolean;
  hasTrackingRemote: boolean;
  tag?: GitTag;
}

/**
 * Classifies raw Git references into the pills shown on commit rows and in
 * commit details. Local branches absorb an upstream sitting on the same commit
 * so the pair renders as one pill with a cloud marker.
 */
export function buildDisplayRefs(
  refs: string[],
  branches: Branch[] | undefined,
  tags?: GitTag[],
  targetHash?: string,
): DisplayRef[] {
  const localBranches = new Map(
    (branches ?? [])
      .filter((branch) => !branch.isRemote)
      .map((branch) => [branch.shortName, branch]),
  );
  const remoteBranches = new Set(
    (branches ?? [])
      .filter((branch) => branch.isRemote)
      .map((branch) => branch.shortName),
  );
  const labels = refs
    .map(parseRefLabel)
    .filter((ref): ref is ParsedRef => Boolean(ref));
  const branchLabelsOnCommit = new Set(
    labels.filter((ref) => !ref.isTag).map((ref) => ref.label),
  );
  const consumedRemotes = new Set<string>();
  const displayRefs: DisplayRef[] = [];

  for (const ref of labels) {
    if (ref.isTag || ref.label.endsWith("/HEAD")) continue;
    const localBranch = localBranches.get(ref.label);
    const trackingRemote =
      localBranch?.upstream && branchLabelsOnCommit.has(localBranch.upstream)
        ? localBranch.upstream
        : null;

    if (trackingRemote) {
      consumedRemotes.add(trackingRemote);
    }

    if (ref.label === "HEAD" || localBranch || !remoteBranches.has(ref.label)) {
      displayRefs.push({
        label: ref.label,
        isHead: ref.isHead,
        isRemote: false,
        isTag: false,
        hasTrackingRemote: Boolean(trackingRemote),
      });
    }
  }

  for (const ref of labels) {
    if (ref.isTag || ref.label.endsWith("/HEAD") || consumedRemotes.has(ref.label)) continue;
    if (remoteBranches.has(ref.label)) {
      displayRefs.push({
        label: ref.label,
        isHead: ref.isHead,
        isRemote: true,
        isTag: false,
        hasTrackingRemote: false,
      });
    }
  }

  if (tags && targetHash) {
    for (const tag of tags) {
      if (tag.commitHash !== targetHash) continue;
      displayRefs.push({
        label: tag.name,
        isHead: false,
        isRemote: false,
        isTag: true,
        hasTrackingRemote: false,
        tag,
      });
    }
  } else {
    for (const ref of labels) {
      if (!ref.isTag) continue;
      const tag = tags?.find((candidate) => candidate.name === ref.label);
      displayRefs.push({
        label: ref.label,
        isHead: false,
        isRemote: false,
        isTag: true,
        hasTrackingRemote: false,
        tag,
      });
    }
  }
  return uniqueDisplayRefs(displayRefs);
}

/** Hover text for a pill: the untruncated ref name plus what it points at. */
export function describeRef(ref: DisplayRef): string {
  if (ref.isTag) return `Tag: ${ref.label}`;
  if (ref.label === "HEAD") return "HEAD (detached) is on this commit";

  const kind = ref.isRemote ? "Remote branch" : "Branch";
  const notes: string[] = [];
  if (ref.isHead) notes.push("checked out");
  if (ref.hasTrackingRemote) notes.push("upstream is on this commit");

  return notes.length > 0
    ? `${kind}: ${ref.label} — ${notes.join(", ")}`
    : `${kind}: ${ref.label}`;
}

/**
 * Ref pill. Truncates long names to keep rows dense; the full name is always
 * available as hover text.
 */
export function RefPill({
  displayRef,
  onSelectedRow = false,
  className,
  onActivate,
  onInspect,
  onOpenMenu,
  activationTitle,
  menuItem = false,
}: {
  displayRef: DisplayRef;
  onSelectedRow?: boolean;
  className?: string;
  onActivate?: () => void;
  onInspect?: () => void;
  onOpenMenu?: (x: number, y: number) => void;
  activationTitle?: string;
  menuItem?: boolean;
}) {
  const Icon = displayRef.isTag ? Tag : GitBranch;

  const interactive = Boolean(onActivate || onInspect || onOpenMenu);
  const openMenu = (event: MouseEvent<HTMLSpanElement>) => {
    if (!onOpenMenu) return;
    event.preventDefault();
    event.stopPropagation();
    onOpenMenu(event.clientX, event.clientY);
  };

  return (
    <span
      title={activationTitle ? `${describeRef(displayRef)}\n${activationTitle}` : describeRef(displayRef)}
      role={menuItem ? "menuitem" : interactive ? "button" : undefined}
      tabIndex={interactive || menuItem ? 0 : undefined}
      aria-disabled={menuItem && !interactive ? true : undefined}
      onClick={interactive ? (event) => {
        event.stopPropagation();
        onInspect?.();
      } : undefined}
      onContextMenu={onOpenMenu ? openMenu : undefined}
      onDoubleClick={interactive ? (event) => {
        event.stopPropagation();
        if (onActivate) onActivate();
        else onInspect?.();
      } : undefined}
      onKeyDown={interactive ? (event) => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          if (!onOpenMenu) return;
          event.preventDefault();
          event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          onOpenMenu(bounds.left, bounds.bottom);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          if (onInspect) onInspect();
          else onActivate?.();
        }
      } : undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        displayRef.isTag
          ? "border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]"
          : onSelectedRow
            ? displayRef.isRemote
              ? "border-[var(--color-text-muted)]/25 bg-[var(--color-bg-tertiary)]/80 text-[var(--color-text-secondary)]"
              : "border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
            : displayRef.isRemote
              ? "border-[var(--color-text-muted)]/25 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
              : "border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 text-[var(--color-accent)]",
        interactive && "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]",
        className,
      )}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{displayRef.label}</span>
      {displayRef.hasTrackingRemote && (
        <Cloud className="h-2.5 w-2.5 shrink-0" aria-label="Tracking branch on this commit" />
      )}
    </span>
  );
}

/** Keyboard-operable chooser keeps every hidden ref available, not just a hover title. */
export function RefOverflowChooser({
  refs,
  renderRef,
}: {
  refs: DisplayRef[];
  renderRef: (ref: DisplayRef) => ReactNode;
}) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = () => {
    setPosition(null);
    trigger.current?.focus();
  };
  useExclusiveMenu(Boolean(position), close);
  useLayoutEffect(() => {
    if (!position || !menu.current) return;
    const rect = menu.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(position.left, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(position.top, window.innerHeight - rect.height - 8));
    if (left !== position.left || top !== position.top) setPosition({ left, top });
  }, [position]);

  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onScroll = (event: Event) => {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      close();
    };
    window.addEventListener("keydown", dismiss);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", dismiss);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [position]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        aria-label={`Show ${refs.length} more refs`}
        className="rounded px-1 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        onClick={(event) => {
          event.stopPropagation();
          if (position) { close(); return; }
          const bounds = event.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(bounds.left, window.innerWidth - 256)),
            top: Math.max(8, Math.min(bounds.bottom, window.innerHeight - 220)),
          });
        }}
      >
        +{refs.length}
      </button>
      {position && createPortal(
        <div className="fixed inset-0 z-[100]" onMouseDown={close} role="presentation">
          <div
            ref={menu}
            role="menu"
            aria-label="More refs on this commit"
            className="giteye-context-menu fixed max-h-[min(65vh,360px)] w-60 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-1 shadow-[var(--shadow-elevated)]"
            style={position}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              event.preventDefault();
              const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
              const index = items.indexOf(document.activeElement as HTMLElement);
              items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
            }}
          >
            {refs.map((ref) => (
              <div key={`${ref.label}:${ref.isTag}:${ref.isRemote}`} className="flex min-w-0 px-1 py-0.5">
                {renderRef(ref)}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

interface ParsedRef {
  label: string;
  isHead: boolean;
  isTag: boolean;
}

function parseRefLabel(ref: string): ParsedRef | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("tag: ")) {
    const label = trimmed.slice("tag: ".length).trim();
    return label ? { label, isHead: false, isTag: true } : null;
  }
  if (trimmed.startsWith("HEAD -> ")) {
    return { label: trimmed.slice("HEAD -> ".length).trim(), isHead: true, isTag: false };
  }
  return { label: trimmed, isHead: trimmed === "HEAD", isTag: false };
}

function uniqueDisplayRefs(refs: DisplayRef[]) {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.label}:${ref.isHead}:${ref.isRemote}:${ref.isTag}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
