import { useState, type CSSProperties, type MouseEvent } from "react";
import type { Branch, CommitSummary } from "../../types/git";
import { useAppStore } from "../../stores/app-store";
import { cn } from "../../lib/cn";
import { formatRelativeTime, truncateHash } from "../../lib/format";
import { Cloud, GitBranch } from "lucide-react";
import type { CommitGraphRow } from "./commit-graph";
import { laneX } from "./commit-graph";
import { CommitActionContextMenu, CommitActionStrip } from "./HistorySurgeryActions";

interface CommitListItemProps {
  commit: CommitSummary;
  graph: CommitGraphRow;
  branches: Branch[];
}

interface DisplayRef {
  label: string;
  isHead: boolean;
  isRemote: boolean;
  hasTrackingRemote: boolean;
}

/**
 * Dense commit row with a colored commit graph, hash, message, ref pills,
 * author, and relative time. Selected rows use the `--color-bg-selected`
 * token for clear highlighting.
 */
export function CommitListItem({
  commit,
  graph,
  branches,
}: CommitListItemProps) {
  const selectedCommitHash = useAppStore((s) => s.selectedCommitHash);
  const setSelectedCommitHash = useAppStore((s) => s.setSelectedCommitHash);
  const isSelected = selectedCommitHash === commit.hash;
  const displayRefs = buildDisplayRefs(commit.refs, branches);
  const isHead = displayRefs.some((ref) => ref.isHead);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const openContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedCommitHash(commit.hash);
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const style: CSSProperties = {
    gridTemplateColumns: `${graph.width}px 64px minmax(0,1fr) 120px 74px 40px`,
  };

  if (isSelected) {
    Object.assign(style, {
      color: "#ffffff",
      ["--color-text-primary" as string]: "#ffffff",
      ["--color-text-secondary" as string]: "rgba(255,255,255,0.78)",
      ["--color-text-muted" as string]: "rgba(255,255,255,0.58)",
      ["--color-accent" as string]: "rgba(255,255,255,0.92)",
    });
  }

  return (
    <div
      onClick={() => setSelectedCommitHash(commit.hash)}
      onContextMenu={openContextMenu}
      role="row"
      aria-selected={isSelected}
      className={cn(
        "grid h-[42px] items-center gap-2 rounded-lg px-2.5 transition-colors select-none",
        isHead && "font-semibold",
        isSelected
          ? "bg-[var(--color-bg-selected)] text-white shadow-md shadow-[var(--color-accent)]/10 ring-1 ring-inset ring-[var(--color-accent)]/45"
          : isHead
            ? "bg-[var(--color-bg-secondary)]/70 ring-1 ring-inset ring-[var(--color-border-muted)] hover:bg-[var(--color-bg-secondary)]"
            : "hover:bg-[var(--color-bg-secondary)]",
      )}
      style={style}
    >
      <CommitGraph graph={graph} selected={isSelected} refs={displayRefs} />

      <span className="truncate font-mono text-[11px] text-[var(--color-accent)]">
        {truncateHash(commit.shortHash)}
      </span>

      <span className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "truncate text-[12px] text-[var(--color-text-primary)]",
            isHead ? "font-bold" : "font-medium",
          )}
        >
          {commit.message}
        </span>
        {displayRefs.length > 0 && (
          <span className="flex min-w-0 shrink-0 items-center gap-1">
            {displayRefs.slice(0, 2).map((ref) => (
              <span
                key={`${ref.label}-${ref.isHead ? "head" : "ref"}`}
                className={cn(
                  "inline-flex max-w-[110px] items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                  isSelected
                    ? "border-white/30 bg-white/15 text-white"
                    : ref.isRemote
                      ? "border-[var(--color-text-muted)]/25 bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"
                      : "border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 text-[var(--color-accent)]",
                )}
              >
                <GitBranch className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{ref.label}</span>
                {ref.hasTrackingRemote && (
                  <Cloud
                    className="h-2.5 w-2.5 shrink-0"
                    aria-label="Tracking branch on this commit"
                  />
                )}
              </span>
            ))}
            {displayRefs.length > 2 && (
              <span className="text-[10px] text-[var(--color-text-muted)]">
                +{displayRefs.length - 2}
              </span>
            )}
          </span>
        )}
      </span>

      <span
        className={cn(
          "truncate text-right text-[11px] text-[var(--color-text-secondary)]",
          isHead && "font-semibold",
        )}
      >
        {commit.authorName}
      </span>
      <span className="text-right text-[10px] text-[var(--color-text-muted)]">
        {formatRelativeTime(commit.timestamp)}
      </span>

      <CommitActionStrip target={commit} isHeadCommit={isHead} compact />
      {contextMenu ? (
        <CommitActionContextMenu
          target={commit}
          isHeadCommit={isHead}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
}

function buildDisplayRefs(refs: string[], branches: Branch[]): DisplayRef[] {
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
    .filter((ref): ref is { label: string; isHead: boolean } => Boolean(ref));
  const labelsOnCommit = new Set(labels.map((ref) => ref.label));
  const consumedRemotes = new Set<string>();
  const displayRefs: DisplayRef[] = [];

  for (const ref of labels) {
    if (ref.label.endsWith("/HEAD")) continue;
    const localBranch = localBranches.get(ref.label);
    const trackingRemote =
      localBranch?.upstream && labelsOnCommit.has(localBranch.upstream)
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
        hasTrackingRemote: Boolean(trackingRemote),
      });
    }
  }

  for (const ref of labels) {
    if (ref.label.endsWith("/HEAD") || consumedRemotes.has(ref.label)) continue;
    if (remoteBranches.has(ref.label)) {
      displayRefs.push({
        label: ref.label,
        isHead: ref.isHead,
        isRemote: true,
        hasTrackingRemote: false,
      });
    }
  }

  return uniqueDisplayRefs(displayRefs);
}

function parseRefLabel(ref: string) {
  const trimmed = ref.trim();
  if (!trimmed || trimmed.startsWith("tag: ")) return null;
  if (trimmed.startsWith("HEAD -> ")) {
    return { label: trimmed.slice("HEAD -> ".length).trim(), isHead: true };
  }
  return { label: trimmed, isHead: trimmed === "HEAD" };
}

function uniqueDisplayRefs(refs: DisplayRef[]) {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.label}:${ref.isHead}:${ref.isRemote}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function CommitGraph({
  graph,
  selected,
  refs,
}: {
  graph: CommitGraphRow;
  selected: boolean;
  refs: DisplayRef[];
}) {
  const centerY = 21;
  const strokeWidth = 1.75;
  const nodeRadius = refs.length > 0 ? 4.25 : 3.5;

  return (
    <span className="relative h-full overflow-hidden" aria-hidden="true">
      <svg
        className="h-full"
        width={graph.width}
        height="42"
        viewBox={`0 0 ${graph.width} 42`}
      >
        {graph.passthroughConnections.map((connection) => {
          const fromX = laneX(connection.fromLane);
          const toX = laneX(connection.toLane);
          const key = `pass-${connection.fromLane}-${connection.toLane}`;

          if (fromX === toX) {
            return (
              <line
                key={key}
                x1={fromX}
                y1="0"
                x2={toX}
                y2="42"
                stroke={connection.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                opacity="0.9"
              />
            );
          }

          return (
            <path
              key={key}
              d={`M ${fromX} 0 C ${fromX} 18, ${toX} 24, ${toX} 42`}
              fill="none"
              stroke={connection.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              opacity="0.9"
            />
          );
        })}

        {graph.parentConnections.map((connection, index) => {
          const fromX = laneX(connection.fromLane);
          const toX = laneX(connection.toLane);
          const key = `parent-${index}-${connection.toLane}`;

          if (fromX === toX) {
            return (
              <line
                key={key}
                x1={fromX}
                y1={centerY}
                x2={toX}
                y2="42"
                stroke={connection.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
            );
          }

          const controlY = centerY + 9;
          return (
            <path
              key={key}
              d={`M ${fromX} ${centerY} C ${fromX} ${controlY}, ${toX} ${controlY}, ${toX} 42`}
              fill="none"
              stroke={connection.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          );
        })}

        {graph.hasCommitLineBefore && (
          <line
            x1={laneX(graph.commitLane)}
            y1="0"
            x2={laneX(graph.commitLane)}
            y2={centerY}
            stroke={graph.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}

        <circle
          cx={laneX(graph.commitLane)}
          cy={centerY}
          r={nodeRadius}
          fill={selected ? "#fff" : graph.color}
          stroke={selected ? "#fff" : "var(--color-bg-primary)"}
          strokeWidth="1.75"
        />
        <circle
          cx={laneX(graph.commitLane)}
          cy={centerY}
          r={selected ? 1.75 : 1.5}
          fill={
            selected ? "var(--color-bg-selected)" : "var(--color-bg-primary)"
          }
        />
      </svg>
    </span>
  );
}
