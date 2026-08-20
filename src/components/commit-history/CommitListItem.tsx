import { useState, type CSSProperties, type MouseEvent } from "react";
import type { Branch, CommitSummary } from "../../types/git";
import { cn } from "../../lib/cn";
import { formatRelativeTime, truncateHash } from "../../lib/format";
import type { CommitGraphRow } from "./commit-graph";
import { COMMIT_ROW_HEIGHT, laneX } from "./commit-graph";
import { CommitActionContextMenu, CommitActionStrip } from "./HistorySurgeryActions";
import { buildDisplayRefs, describeRef, RefPill, type DisplayRef } from "./commit-refs";

interface CommitListItemProps {
  commit: CommitSummary;
  graph: CommitGraphRow;
  branches: Branch[] | undefined;
  isSelected: boolean;
  onSelect: (commit: CommitSummary, event: MouseEvent<HTMLDivElement>) => void;
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
  isSelected,
  onSelect,
}: CommitListItemProps) {
  const displayRefs = buildDisplayRefs(commit.refs, branches);
  const isHead = displayRefs.some((ref) => ref.isHead);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

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
      )}
      style={style}
    >
      <CommitGraph graph={graph} selected={isSelected} refs={displayRefs} />

      <span className="truncate font-mono text-[10.5px] text-[var(--color-accent)]">
        {truncateHash(commit.shortHash)}
      </span>

      <span className="flex min-w-0 items-center gap-2">
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
            {displayRefs.slice(0, 2).map((ref) => (
              <RefPill
                key={`${ref.label}-${ref.isTag ? "tag" : ref.isHead ? "head" : "ref"}`}
                displayRef={ref}
                onSelectedRow={isSelected}
                className="max-w-[110px]"
              />
            ))}
            {displayRefs.length > 2 && (
              <span
                className="text-[10px] text-[var(--color-text-muted)]"
                title={displayRefs.slice(2).map(describeRef).join("\n")}
              >
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

      <CommitActionStrip target={commit} isHeadCommit={isHead} refs={displayRefs} compact />
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
    </div>
  );
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
  const rowHeight = COMMIT_ROW_HEIGHT;
  const centerY = rowHeight / 2;
  const strokeWidth = 1.6;
  const nodeRadius = refs.length > 0 ? 4 : 3.25;

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
                opacity="0.9"
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
                y2={rowHeight}
                stroke={connection.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
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
          fill={graph.color}
          stroke="var(--color-bg-primary)"
          strokeWidth="1.75"
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
