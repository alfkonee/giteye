import type { CSSProperties } from "react";
import { cn } from "../../lib/cn";
import type { FileStatus } from "../../types/git";

const STATUS_LABELS: Record<FileStatus, string> = {
  modified: "M",
  added: "A",
  deleted: "D",
  renamed: "R",
  copied: "C",
  untracked: "?",
  ignored: "!",
  conflict: "!!",
  typechange: "T",
};

const STATUS_TOKENS: Record<FileStatus, CSSProperties> = {
  modified: {
    color: "var(--color-warning)",
    backgroundColor: "var(--color-warning-bg)",
    borderColor: "var(--color-warning-border)",
  },
  added: {
    color: "var(--color-success)",
    backgroundColor: "var(--color-success-bg)",
    borderColor: "var(--color-success-border)",
  },
  deleted: {
    color: "var(--color-danger)",
    backgroundColor: "var(--color-danger-bg)",
    borderColor: "var(--color-danger-border)",
  },
  renamed: {
    color: "var(--color-accent)",
    backgroundColor: "var(--color-info-bg)",
    borderColor: "var(--color-info-border)",
  },
  copied: {
    color: "var(--color-accent)",
    backgroundColor: "var(--color-info-bg)",
    borderColor: "var(--color-info-border)",
  },
  untracked: {
    color: "var(--color-untracked)",
    backgroundColor: "var(--color-untracked-bg)",
    borderColor: "var(--color-info-border)",
  },
  ignored: {
    color: "var(--color-ignored)",
    backgroundColor: "var(--color-bg-surface)",
    borderColor: "var(--color-border-muted)",
  },
  conflict: {
    color: "var(--color-danger)",
    backgroundColor: "var(--color-danger-bg)",
    borderColor: "var(--color-danger-border)",
  },
  typechange: {
    color: "var(--color-typechange)",
    backgroundColor: "var(--color-purple-bg)",
    borderColor: "var(--color-purple-border)",
  },
};

interface StatusBadgeProps {
  status: FileStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-[var(--radius-badge)] border px-1 font-mono text-[10px] font-bold leading-none tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
        status === "conflict" && "tracking-[-0.08em]",
        className,
      )}
      style={STATUS_TOKENS[status]}
      title={status}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
