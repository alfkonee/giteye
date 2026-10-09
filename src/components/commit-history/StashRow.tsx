import { useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { Archive, MoreHorizontal } from "lucide-react";
import type { StashEntry } from "../../types/git";
import { cn } from "../../lib/cn";
import { formatRelativeTime, truncateHash } from "../../lib/format";
import { COMMIT_ROW_HEIGHT, laneX } from "./commit-graph";
import type { StashGraphRow } from "./history-rows";
import { GitRefContextMenu } from "./GitRefContextMenu";

interface StashRowProps {
  stash: StashEntry;
  graph: StashGraphRow | null;
  graphWidth: number;
  isSelected: boolean;
  isLocatingBase: boolean;
  onSelect: () => void;
  onLocateBase: (hash: string) => void;
}

export function StashRow({
  stash,
  graph,
  graphWidth,
  isSelected,
  isLocatingBase,
  onSelect,
  onLocateBase,
}: StashRowProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const openMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      setMenu({ x: bounds.left + 24, y: bounds.bottom });
    }
  };
  const style: CSSProperties = {
    gridTemplateColumns: `${graphWidth}px 58px minmax(0,1fr) 104px 62px 26px`,
    height: `${COMMIT_ROW_HEIGHT}px`,
  };

  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={isSelected}
      aria-label={`${stash.name}, ${stash.commitHash}: ${stash.message}. Originally ${stash.branch ?? "unknown branch"}, saved ${stash.timestamp ?? "at unknown time"}. ${graph ? `Base ${stash.baseCommitHash}` : `Base ${stash.baseCommitHash} outside loaded history; use Locate base to load it`}`}
      onClick={onSelect}
      onContextMenu={openMenu}
      onKeyDown={onKeyDown}
      className={cn(
        "grid cursor-pointer items-center gap-1.5 rounded-md px-2 transition-colors select-none focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]",
        isSelected ? "giteye-selected-row" : "hover:bg-[var(--color-bg-secondary)]",
      )}
      style={style}
    >
      <StashGraph graph={graph} width={graphWidth} selected={isSelected} />
      <span className="truncate font-mono text-[10.5px] text-[var(--color-warning)]" title={`${stash.name} · ${stash.commitHash}`}>
        {stash.name}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <Archive className="h-3 w-3 shrink-0 text-[var(--color-warning)]" aria-hidden="true" />
        <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-muted)]" title={stash.commitHash}>
          {truncateHash(stash.shortHash)}
        </span>
        <span className="truncate text-[11.5px] font-medium text-[var(--color-text-primary)]" title={stash.message}>
          {stash.message}
        </span>
        {!graph && (
          <button
            type="button"
            disabled={isLocatingBase}
            aria-live="polite"
            className="giteye-chip shrink-0 cursor-pointer text-[10px] hover:text-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
            title={`Base ${stash.baseCommitHash} is outside loaded history. Load until it appears.`}
            onClick={(event) => { event.stopPropagation(); onLocateBase(stash.baseCommitHash); }}
          >
            {isLocatingBase ? "Locating base…" : `Locate base ${truncateHash(stash.baseCommitHash)}`}
          </button>
        )}
      </span>
      <span className="truncate text-right text-[10.5px] text-[var(--color-text-secondary)]" title={stash.branch ?? "Original branch unknown"}>
        {stash.branch ?? "Unknown branch"}
      </span>
      <span className="text-right text-[10px] text-[var(--color-text-muted)]" title={stash.timestamp ?? "Date unknown"}>
        {stash.timestamp ? formatRelativeTime(stash.timestamp) : "—"}
      </span>
      <button
        type="button"
        aria-label={`Actions for ${stash.name}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(menu)}
        title={`Stash ${stash.commitHash}`}
        className="ml-auto inline-flex h-5 w-6 items-center justify-center rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        onClick={openMenu}
      >
        <MoreHorizontal className="h-3 w-3" aria-hidden="true" />
      </button>
      {menu && (
        <GitRefContextMenu
          target={{ kind: "stash", stash }}
          x={menu.x}
          y={menu.y}
          onLocateBase={onLocateBase}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function StashGraph({ graph, width, selected }: { graph: StashGraphRow | null; width: number; selected: boolean }) {
  const middle = COMMIT_ROW_HEIGHT / 2;
  return (
    <span className="relative h-full overflow-hidden" aria-hidden="true">
      <svg width={width} height={COMMIT_ROW_HEIGHT} viewBox={`0 0 ${width} ${COMMIT_ROW_HEIGHT}`}>
        {graph ? (
          <>
            {graph.passthrough.map(({ lane, color }) => (
              <line key={`pass-${lane}`} x1={laneX(lane)} y1="0" x2={laneX(lane)} y2={COMMIT_ROW_HEIGHT} stroke={color} strokeWidth="1.6" opacity="0.9" />
            ))}
            {graph.earlierStashLanes.map(({ lane, color }) => (
              <path key={`stash-${lane}`} d={graph.lastBeforeBase
                ? `M ${laneX(lane)} 0 C ${laneX(lane)} ${middle}, ${laneX(graph.baseLane)} ${middle}, ${laneX(graph.baseLane)} ${COMMIT_ROW_HEIGHT}`
                : `M ${laneX(lane)} 0 L ${laneX(lane)} ${COMMIT_ROW_HEIGHT}`}
                fill="none" stroke={color} strokeWidth="1.6" strokeDasharray="3 2" />
            ))}
            <path
              d={`M ${laneX(graph.stashLane)} ${middle} C ${laneX(graph.stashLane)} ${middle + 5}, ${laneX(graph.lastBeforeBase ? graph.baseLane : graph.stashLane)} ${COMMIT_ROW_HEIGHT - 5}, ${laneX(graph.lastBeforeBase ? graph.baseLane : graph.stashLane)} ${COMMIT_ROW_HEIGHT}`}
              fill="none"
              stroke={graph.color}
              strokeWidth="1.6"
              strokeDasharray="3 2"
            />
            <circle cx={laneX(graph.stashLane)} cy={middle} r="4" fill="var(--color-bg-primary)" stroke={graph.color} strokeWidth="2" />
            <circle cx={laneX(graph.stashLane)} cy={middle} r={selected ? "1.75" : "1.3"} fill={graph.color} />
          </>
        ) : (
          <circle cx={laneX(0)} cy={middle} r="4" fill="var(--color-bg-primary)" stroke="var(--color-warning)" strokeDasharray="2 2" strokeWidth="1.6" />
        )}
      </svg>
    </span>
  );
}
