import type { CSSProperties } from "react";
import type { CommitSummary } from "../../types/git";
import { useAppStore } from "../../stores/app-store";
import { cn } from "../../lib/cn";
import { formatRelativeTime, truncateHash } from "../../lib/format";
import { GitBranch } from "lucide-react";
import type { CommitGraphRow } from "./commit-graph";
import { laneX } from "./commit-graph";

interface CommitListItemProps {
  commit: CommitSummary;
  graph: CommitGraphRow;
}

/**
 * Dense commit row with a colored commit graph, hash, message, ref pills,
 * author, and relative time. Selected rows use the `--color-bg-selected`
 * token for clear highlighting.
 */
export function CommitListItem({ commit, graph }: CommitListItemProps) {
  const selectedCommitHash = useAppStore((s) => s.selectedCommitHash);
  const setSelectedCommitHash = useAppStore((s) => s.setSelectedCommitHash);
  const isSelected = selectedCommitHash === commit.hash;

  const style: CSSProperties = {
    gridTemplateColumns: `${graph.width}px 64px minmax(0,1fr) 120px 74px`,
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
      role="row"
      aria-selected={isSelected}
      className={cn(
        "grid h-[42px] items-center gap-2 rounded-lg px-2.5 transition-colors select-none",
        isSelected
          ? "bg-[var(--color-bg-selected)] text-white shadow-md shadow-[var(--color-accent)]/10 ring-1 ring-inset ring-[var(--color-accent)]/45"
          : "hover:bg-[var(--color-bg-secondary)]"
      )}
      style={style}
    >
      <CommitGraph graph={graph} selected={isSelected} refs={commit.refs} />

      <span className="truncate font-mono text-[11px] text-[var(--color-accent)]">
        {truncateHash(commit.shortHash)}
      </span>

      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[12px] font-medium text-[var(--color-text-primary)]">
          {commit.message}
        </span>
        {commit.refs.length > 0 && (
          <span className="flex min-w-0 shrink-0 items-center gap-1">
            {commit.refs.slice(0, 2).map((ref) => (
              <span
                key={ref}
                className={cn(
                  "inline-flex max-w-[110px] items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                  isSelected
                    ? "border-white/30 bg-white/15 text-white"
                    : "border-[var(--color-accent)]/25 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                )}
              >
                <GitBranch className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{ref}</span>
              </span>
            ))}
            {commit.refs.length > 2 && (
              <span className="text-[10px] text-[var(--color-text-muted)]">
                +{commit.refs.length - 2}
              </span>
            )}
          </span>
        )}
      </span>

      <span className="truncate text-right text-[11px] text-[var(--color-text-secondary)]">
        {commit.authorName}
      </span>
      <span className="text-right text-[10px] text-[var(--color-text-muted)]">
        {formatRelativeTime(commit.timestamp)}
      </span>
    </div>
  );
}

function CommitGraph({ graph, selected, refs }: { graph: CommitGraphRow; selected: boolean; refs: string[] }) {
  const centerY = 21;
  const strokeWidth = 1.75;
  const nodeRadius = refs.length > 0 ? 4.25 : 3.5;

  return (
    <span className="relative h-full overflow-hidden" aria-hidden="true">
      <svg className="h-full" width={graph.width} height="42" viewBox={`0 0 ${graph.width} 42`}>
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
          fill={selected ? "var(--color-bg-selected)" : "var(--color-bg-primary)"}
        />
      </svg>
    </span>
  );
}
