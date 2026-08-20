import { CircleDot } from "lucide-react";
import { cn } from "../../lib/cn";
import { COMMIT_ROW_HEIGHT, laneX } from "./commit-graph";

interface WorkingTreeRowProps {
  graphWidth: number;
  /** Lane the HEAD commit occupies, so the stub line meets the graph. */
  headLane: number;
  headColor: string;
  stagedCount: number;
  unstagedCount: number;
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * Pinned pseudo-commit above HEAD showing uncommitted work, mirroring the
 * commit row grid so the graph lane lines up. Selecting it swaps the detail
 * pane over to the commit UI.
 */
export function WorkingTreeRow({
  graphWidth,
  headLane,
  headColor,
  stagedCount,
  unstagedCount,
  isSelected,
  onSelect,
}: WorkingTreeRowProps) {
  const total = stagedCount + unstagedCount;
  const centerY = COMMIT_ROW_HEIGHT / 2;
  const x = laneX(headLane);

  return (
    <div
      role="row"
      aria-selected={isSelected}
      onClick={onSelect}
      title="Uncommitted changes — open the commit UI"
      className={cn(
        "grid cursor-pointer items-center gap-1.5 rounded-md px-2 transition-colors select-none",
        isSelected ? "giteye-selected-row" : "hover:bg-[var(--color-bg-secondary)]",
      )}
      style={{
        gridTemplateColumns: `${graphWidth}px 58px minmax(0,1fr) 104px 62px 26px`,
        height: `${COMMIT_ROW_HEIGHT}px`,
      }}
    >
      <span className="relative h-full overflow-hidden" aria-hidden="true">
        <svg className="h-full" width={graphWidth} height={COMMIT_ROW_HEIGHT} viewBox={`0 0 ${graphWidth} ${COMMIT_ROW_HEIGHT}`}>
          <line
            x1={x}
            y1={centerY}
            x2={x}
            y2={COMMIT_ROW_HEIGHT}
            stroke={headColor}
            strokeWidth="1.6"
            strokeDasharray="2 2"
            strokeLinecap="round"
          />
          <circle
            cx={x}
            cy={centerY}
            r={3.75}
            fill="var(--color-bg-primary)"
            stroke={headColor}
            strokeWidth="1.6"
            strokeDasharray="2 1.5"
          />
        </svg>
      </span>

      <span className="truncate font-mono text-[10.5px] text-[var(--color-text-muted)]">working</span>

      <span className="flex min-w-0 items-center gap-1.5">
        <CircleDot className="h-3 w-3 shrink-0 text-[var(--color-warning)]" />
        <span className="truncate text-[11.5px] font-semibold text-[var(--color-text-primary)]">
          Uncommitted changes
        </span>
        <span className="giteye-chip shrink-0 tabular-nums" data-tone={stagedCount > 0 ? "accent" : undefined}>
          {stagedCount} staged
        </span>
        <span className="giteye-chip shrink-0 tabular-nums" data-tone={unstagedCount > 0 ? "warning" : undefined}>
          {unstagedCount} unstaged
        </span>
      </span>

      <span className="truncate text-right text-[11px] text-[var(--color-text-secondary)]">You</span>
      <span className="text-right text-[10px] text-[var(--color-text-muted)]">now</span>
      <span className="text-right text-[10px] tabular-nums text-[var(--color-text-muted)]">{total}</span>
    </div>
  );
}
