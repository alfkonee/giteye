import { ArrowRight, CircleDot, GitMerge } from "lucide-react";
import { cn } from "../../lib/cn";
import {
  COMMIT_ROW_HEIGHT,
  laneX,
  operationGraphLanes,
  operationName,
  operationStatus,
  type CommitGraphRow,
} from "./commit-graph";
import type { OperationCommit, OperationSnapshot } from "../../types/git";

interface WorkingTreeRowProps {
  graphWidth: number;
  /** Lane of the actual HEAD, which need not be the first history row. */
  headLane: number;
  headColor: string;
  connectToHistory: boolean;
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
  connectToHistory,
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
        isSelected
          ? "giteye-selected-row"
          : "hover:bg-[var(--color-bg-secondary)]",
      )}
      style={{
        gridTemplateColumns: `${graphWidth}px 58px minmax(0,1fr) 104px 62px 26px`,
        height: `${COMMIT_ROW_HEIGHT}px`,
      }}
    >
      <span className="relative h-full overflow-hidden" aria-hidden="true">
        <svg
          className="h-full"
          width={graphWidth}
          height={COMMIT_ROW_HEIGHT}
          viewBox={`0 0 ${graphWidth} ${COMMIT_ROW_HEIGHT}`}
        >
          {connectToHistory ? (
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
          ) : null}
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

      <span className="truncate font-mono text-[10.5px] text-[var(--color-text-muted)]">
        working
      </span>

      <span className="flex min-w-0 items-center gap-1.5">
        <CircleDot className="h-3 w-3 shrink-0 text-[var(--color-warning)]" />
        <span className="truncate text-[11.5px] font-semibold text-[var(--color-text-primary)]">
          Uncommitted changes
        </span>
        <span
          className="giteye-chip shrink-0 tabular-nums"
          data-tone={stagedCount > 0 ? "accent" : undefined}
        >
          {stagedCount} staged
        </span>
        <span
          className="giteye-chip shrink-0 tabular-nums"
          data-tone={unstagedCount > 0 ? "warning" : undefined}
        >
          {unstagedCount} unstaged
        </span>
      </span>

      <span className="truncate text-right text-[11px] text-[var(--color-text-secondary)]">
        You
      </span>
      <span className="text-right text-[10px] text-[var(--color-text-muted)]">
        now
      </span>
      <span className="text-right text-[10px] tabular-nums text-[var(--color-text-muted)]">
        {total}
      </span>
    </div>
  );
}

/** Pinned operation intent, deliberately separate from the committed graph. */
export function ActiveOperationRow({
  operation,
  graphRows,
  graphWidth,
  onOpen,
}: {
  operation: OperationSnapshot;
  graphRows: ReadonlyMap<string, CommitGraphRow>;
  graphWidth: number;
  onOpen: () => void;
}) {
  const lanes = operationGraphLanes(operation, graphRows);
  const sourceX = laneX(lanes.sourceLane);
  const targetX = laneX(lanes.targetLane);
  const diagramHeight = COMMIT_ROW_HEIGHT * 2;
  const sourceY = COMMIT_ROW_HEIGHT / 2;
  const targetY = COMMIT_ROW_HEIGHT * 1.5;
  const name = operationName(operation.operation);
  const status = operationStatus(operation);
  const direction = operation.operation === "rebase" ? "onto" : "into";
  const sourceLabel =
    operation.operation === "revert" ? "Undo changes from" : "From";
  const currentLabel =
    operation.operation === "rebase"
      ? "Replaying"
      : operation.operation === "cherryPick"
        ? "Picking"
        : operation.operation === "revert"
          ? "Reverting"
          : "Current";
  const totalSteps = operation.rebase.totalSteps;
  const currentStep = operation.rebase.currentStep;
  const progress =
    operation.operation === "rebase" && totalSteps !== null && totalSteps > 0
      ? currentStep !== null
        ? `Step ${currentStep} of ${totalSteps}`
        : `${totalSteps} steps`
      : null;
  const currentDescription = operation.current
    ? `${currentLabel} ${operation.current.label} ${operation.current.hash.slice(0, 8)}. `
    : "";
  const description = `${name} active. ${sourceLabel} ${operation.source?.label ?? operation.incomingLabel} ${direction} ${operation.target?.label ?? operation.currentLabel}. ${currentDescription}${progress ? `${progress}. ` : ""}${status}. Open conflict resolver.`;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={description}
      title={description}
      className="grid w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--color-bg-secondary)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-accent)]"
      style={{
        gridTemplateColumns: `minmax(40px, ${graphWidth}px) minmax(0, 1fr)`,
      }}
    >
      <span
        className="relative flex h-full items-start overflow-hidden"
        aria-hidden="true"
      >
        <svg
          className="h-14 w-full"
          width={graphWidth}
          height={diagramHeight}
          viewBox={`0 0 ${graphWidth} ${diagramHeight}`}
        >
          <line
            x1={targetX}
            y1="5"
            x2={targetX}
            y2={diagramHeight - 5}
            stroke={lanes.targetColor}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <line
            x1={sourceX}
            y1="5"
            x2={sourceX}
            y2={sourceY}
            stroke={lanes.sourceColor}
            strokeWidth="1.6"
            strokeDasharray="2 2"
          />
          <path
            d={`M ${sourceX} ${sourceY + 5} C ${sourceX} ${targetY - 12}, ${targetX} ${targetY - 16}, ${targetX} ${targetY - 7}`}
            fill="none"
            stroke={lanes.sourceColor}
            strokeWidth="1.6"
            strokeDasharray="3 2"
            strokeLinecap="round"
          />
          <path
            d={`M ${targetX - 3} ${targetY - 11} L ${targetX} ${targetY - 7} L ${targetX + 3} ${targetY - 11}`}
            fill="none"
            stroke={lanes.sourceColor}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx={sourceX}
            cy={sourceY}
            r="4"
            fill="var(--color-bg-primary)"
            stroke={lanes.sourceColor}
            strokeWidth="1.6"
            strokeDasharray="2 1.5"
          />
          <circle
            cx={targetX}
            cy={targetY}
            r="3.75"
            fill={lanes.targetColor}
            stroke="var(--color-bg-primary)"
            strokeWidth="1.5"
          />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <GitMerge
            className="h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]"
            aria-hidden="true"
          />
          <span className="text-[11.5px] font-semibold">{name} active</span>
          <span
            className="giteye-chip text-[10px]"
            data-tone={operation.phase === "conflicted" ? "warning" : "accent"}
          >
            {status}
          </span>
          {progress ? (
            <span className="text-[10px] tabular-nums text-[var(--color-text-secondary)]">
              {progress}
            </span>
          ) : null}
          <span className="text-[10px] text-[var(--color-text-muted)]">
            Not yet a commit
          </span>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
          <span className="text-[var(--color-text-muted)]">{sourceLabel}</span>
          <OperationCommitDescriptor
            commit={operation.source}
            fallback={operation.incomingLabel}
            graphRows={graphRows}
          />
          <ArrowRight
            className="h-3 w-3 shrink-0 text-[var(--color-text-muted)]"
            aria-hidden="true"
          />
          <span className="text-[var(--color-text-muted)]">{direction}</span>
          <OperationCommitDescriptor
            commit={operation.target}
            fallback={operation.currentLabel}
            graphRows={graphRows}
          />
        </span>
        {operation.current ? (
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[10.5px]">
            <span className="text-[var(--color-text-muted)]">
              {currentLabel}
            </span>
            <OperationCommitDescriptor
              commit={operation.current}
              fallback={currentLabel}
              graphRows={graphRows}
            />
          </span>
        ) : null}
        <span className="text-[10px] font-medium text-[var(--color-accent)]">
          Open conflict resolver
        </span>
      </span>
    </button>
  );
}

function OperationCommitDescriptor({
  commit,
  fallback,
  graphRows,
}: {
  commit: OperationCommit | null;
  fallback: string;
  graphRows: ReadonlyMap<string, CommitGraphRow>;
}) {
  if (!commit) return <span className="min-w-0 break-words">{fallback}</span>;
  const outsideHistory = !graphRows.has(commit.hash);
  return (
    <span
      className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1"
      title={`${commit.label} · ${commit.hash} · ${commit.subject}${outsideHistory ? " · Outside loaded history" : ""}`}
    >
      <span className="max-w-[180px] truncate font-medium">{commit.label}</span>
      <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
        {commit.hash.slice(0, 8)}
      </span>
      {commit.subject ? (
        <span className="max-w-[260px] truncate text-[var(--color-text-secondary)]">
          {commit.subject}
        </span>
      ) : null}
      {outsideHistory ? (
        <span className="text-[9px] text-[var(--color-text-muted)]">
          (outside loaded history)
        </span>
      ) : null}
    </span>
  );
}
