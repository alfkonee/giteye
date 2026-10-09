import { useState, type CSSProperties, type MouseEvent } from "react";
import type { Branch, CommitSummary, GitTag } from "../../types/git";
import { useAppStore } from "../../stores/app-store";
import { cn } from "../../lib/cn";
import { formatRelativeTime, truncateHash } from "../../lib/format";
import type { CommitGraphRow, OperationRoleBadge } from "./commit-graph";
import { COMMIT_ROW_HEIGHT, laneX } from "./commit-graph";
import {
  CommitActionContextMenu,
  CommitActionStrip,
} from "./HistorySurgeryActions";
import {
  buildDisplayRefs,
  RefPill,
  RefOverflowChooser,
  type DisplayRef,
} from "./commit-refs";
import { GitRefContextMenu, type GitRefMenuTarget } from "./GitRefContextMenu";
import { describeBranchActivation } from "../../lib/branch-activation";

interface CommitListItemProps {
  commit: CommitSummary;
  graph: CommitGraphRow;
  branches: Branch[] | undefined;
  tags: GitTag[] | undefined;
  operationRoles?: OperationRoleBadge[];
  isSelected: boolean;
  onSelect: (commit: CommitSummary, event: MouseEvent<HTMLDivElement>) => void;
  onActivateBranch: (branch: Branch) => void;
  /** When set, rows/edges outside the focused ref's ancestry render dimmed. */
  focusSet?: ReadonlySet<string> | null;
  /** Brief ring after a navigation jump landed on this row. */
  highlighted?: boolean;
}

/**
 * Dense commit row with a colored commit graph, hash, message, ref pills,
 * author, and relative time. Selected rows use the shared soft-selection
 * surface so graph colors and metadata stay legible.
 */
export function CommitListItem({
  commit,
  graph,
  branches,
  tags,
  operationRoles,
  isSelected,
  onSelect,
  onActivateBranch,
  focusSet = null,
  highlighted = false,
}: CommitListItemProps) {
  const displayRefs = buildDisplayRefs(commit.refs, branches, tags, commit.hash);
  const setSelectedGitRef = useAppStore((state) => state.setSelectedGitRef);
  const isHead = displayRefs.some((ref) => ref.isHead);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [refMenu, setRefMenu] = useState<{ target: GitRefMenuTarget; x: number; y: number } | null>(null);
  const renderRef = (ref: DisplayRef, menuItem = false) => {
    const branch = !ref.isTag && ref.label !== "HEAD"
      ? branches?.find((candidate) => candidate.shortName === ref.label && candidate.isRemote === ref.isRemote)
      : undefined;
    const tag = ref.tag;
    return (
      <RefPill
        key={`${ref.label}-${ref.isTag ? "tag" : ref.isHead ? "head" : "ref"}`}
        displayRef={ref}
        onSelectedRow={isSelected}
        className={menuItem ? "w-full min-w-0" : "max-w-[110px]"}
        menuItem={menuItem}
        onActivate={branch ? () => onActivateBranch(branch) : undefined}
        activationTitle={branch ? describeBranchActivation(branch, branches ?? []) : undefined}
        onInspect={tag ? () => setSelectedGitRef({ kind: "tag", name: tag.name, commitHash: tag.commitHash }) : undefined}
        onOpenMenu={
          tag
            ? (x, y) => setRefMenu({ target: { kind: "tag", tag }, x, y })
            : branch
              ? (x, y) => setRefMenu({ target: { kind: "branch", branch, commitHash: commit.hash }, x, y })
              : undefined
        }
      />
    );
  };

  const openContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(commit, event);
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const style: CSSProperties = {
    gridTemplateColumns: `${graph.width}px 58px minmax(0,1fr) 104px 62px 26px`,
    height: `${COMMIT_ROW_HEIGHT}px`,
  };

  return (
    <div
      onClick={(event) => onSelect(commit, event)}
      onContextMenu={openContextMenu}
      role="row"
      aria-selected={isSelected}
      className={cn(
        "grid items-center gap-1.5 rounded-md px-2 transition-colors select-none",
        isHead && "font-semibold",
        isSelected
          ? "giteye-selected-row"
          : isHead
            ? "bg-[var(--color-bg-secondary)]/70 ring-1 ring-inset ring-[var(--color-border-muted)] hover:bg-[var(--color-bg-secondary)]"
            : "hover:bg-[var(--color-bg-secondary)]",
        highlighted && "giteye-located-row",
        focusSet && !focusSet.has(commit.hash) && !isSelected && "giteye-unfocused-row",
      )}
      style={style}
    >
      <CommitGraph
        graph={graph}
        selected={isSelected}
        refs={displayRefs}
        hash={commit.hash}
        focusSet={focusSet}
      />

      <span className="truncate font-mono text-[10.5px] text-[var(--color-accent)]">
        {truncateHash(commit.shortHash)}
      </span>

      <span className="flex min-w-0 items-center gap-2">
        {operationRoles?.map((badge) => (
          <span
            key={badge.role}
            className="giteye-chip shrink-0 text-[9px]"
            data-tone={badge.role === "target" ? "accent" : "warning"}
            title={badge.description}
            aria-label={badge.description}
          >
            {badge.label}
          </span>
        ))}
        <span
          className={cn(
            "truncate text-[11.5px] text-[var(--color-text-primary)]",
            isHead ? "font-bold" : "font-medium",
          )}
        >
          {commit.message}
        </span>
        {displayRefs.length > 0 && (
          <span className="flex min-w-0 shrink-0 items-center gap-1">
            {displayRefs.slice(0, 2).map((ref) => renderRef(ref))}
            {displayRefs.length > 2 && (
              <RefOverflowChooser
                refs={displayRefs.slice(2)}
                renderRef={(ref) => renderRef(ref, true)}
              />
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

      <CommitActionStrip
        target={commit}
        isHeadCommit={isHead}
        refs={displayRefs}
        compact
      />
      {contextMenu ? (
        <CommitActionContextMenu
          target={commit}
          isHeadCommit={isHead}
          refs={displayRefs}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      ) : null}
      {refMenu && (
        <GitRefContextMenu
          target={refMenu.target}
          x={refMenu.x}
          y={refMenu.y}
          onClose={() => setRefMenu(null)}
        />
      )}
    </div>
  );
}

export function CommitGraph({
  graph,
  selected,
  refs,
  hash,
  focusSet = null,
}: {
  graph: CommitGraphRow;
  selected: boolean;
  refs: DisplayRef[];
  hash: string;
  /** Rows/edges outside the focused ancestry draw at reduced opacity. */
  focusSet?: ReadonlySet<string> | null;
}) {
  const rowHeight = COMMIT_ROW_HEIGHT;
  const centerY = rowHeight / 2;
  const strokeWidth = 1.6;
  const nodeRadius = refs.length > 0 ? 4 : 3.25;
  const rowDimmed = focusSet ? !focusSet.has(hash) : false;
  const sourcesFocused = (sourceHashes: readonly string[]) =>
    !focusSet || sourceHashes.some((sourceHash) => focusSet.has(sourceHash));

  return (
    <span className="relative h-full overflow-hidden" aria-hidden="true">
      <svg
        className="h-full"
        width={graph.width}
        height={rowHeight}
        viewBox={`0 0 ${graph.width} ${rowHeight}`}
      >
        {graph.passthroughConnections.map((connection) => {
          const fromX = laneX(connection.fromLane);
          const toX = laneX(connection.toLane);
          const key = `pass-${connection.fromLane}-${connection.toLane}`;
          const opacity = sourcesFocused(connection.sourceHashes) ? 0.9 : 0.16;

          if (fromX === toX) {
            return (
              <line
                key={key}
                x1={fromX}
                y1="0"
                x2={toX}
                y2={rowHeight}
                stroke={connection.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                opacity={opacity}
              />
            );
          }

          return (
            <path
              key={key}
              d={`M ${fromX} 0 C ${fromX} ${centerY * 0.85}, ${toX} ${centerY * 1.15}, ${toX} ${rowHeight}`}
              fill="none"
              stroke={connection.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              opacity={opacity}
            />
          );
        })}

        {graph.parentConnections.map((connection, index) => {
          const fromX = laneX(connection.fromLane);
          const toX = laneX(connection.toLane);
          const key = `parent-${index}-${connection.toLane}`;
          const opacity = sourcesFocused(connection.sourceHashes) ? 1 : 0.16;

          if (fromX === toX) {
            return (
              <line
                key={key}
                x1={fromX}
                y1={centerY}
                x2={toX}
                y2={rowHeight}
                stroke={connection.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                opacity={opacity}
              />
            );
          }

          const controlY = centerY + rowHeight * 0.22;
          return (
            <path
              key={key}
              d={`M ${fromX} ${centerY} C ${fromX} ${controlY}, ${toX} ${controlY}, ${toX} ${rowHeight}`}
              fill="none"
              stroke={connection.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              opacity={opacity}
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
            opacity={sourcesFocused(graph.incomingSourceHashes) ? 1 : 0.16}
          />
        )}

        <circle
          cx={laneX(graph.commitLane)}
          cy={centerY}
          r={nodeRadius}
          fill={graph.color}
          stroke="var(--color-bg-primary)"
          strokeWidth="1.75"
          opacity={rowDimmed ? 0.35 : 1}
        />
        <circle
          cx={laneX(graph.commitLane)}
          cy={centerY}
          r={selected ? 1.75 : 1.5}
          fill="var(--color-bg-primary)"
        />
      </svg>
    </span>
  );
}
