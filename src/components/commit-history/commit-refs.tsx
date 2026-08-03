import type { Branch } from "../../types/git";
import { cn } from "../../lib/cn";
import { Cloud, GitBranch, Tag } from "lucide-react";

export interface DisplayRef {
  label: string;
  isHead: boolean;
  isRemote: boolean;
  isTag: boolean;
  hasTrackingRemote: boolean;
}

/**
 * Classifies raw Git references into the pills shown on commit rows and in
 * commit details. Local branches absorb an upstream sitting on the same commit
 * so the pair renders as one pill with a cloud marker.
 */
export function buildDisplayRefs(refs: string[], branches: Branch[] | undefined): DisplayRef[] {
  if (!branches) return [];
  const localBranches = new Map(
    branches
      .filter((branch) => !branch.isRemote)
      .map((branch) => [branch.shortName, branch]),
  );
  const remoteBranches = new Set(
    branches
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

  for (const ref of labels) {
    if (!ref.isTag) continue;
    displayRefs.push({
      label: ref.label,
      isHead: false,
      isRemote: false,
      isTag: true,
      hasTrackingRemote: false,
    });
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
}: {
  displayRef: DisplayRef;
  onSelectedRow?: boolean;
  className?: string;
}) {
  const Icon = displayRef.isTag ? Tag : GitBranch;

  return (
    <span
      title={describeRef(displayRef)}
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
