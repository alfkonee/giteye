import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[180px] flex-col items-center justify-center px-6 py-8 text-center select-none",
        className,
      )}
    >
      <div className="flex max-w-[360px] flex-col items-center rounded-[var(--radius-panel)] border border-[var(--color-border-muted)] bg-[var(--color-bg-surface)]/45 px-7 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        {icon && (
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-muted)] bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]">
            {icon}
          </div>
        )}
        <h3 className="text-[13px] font-semibold leading-5 text-[var(--color-text-primary)]">
          {title}
        </h3>
        {description && (
          <p className="mt-1 max-w-[300px] text-[12px] leading-5 text-[var(--color-text-muted)]">
            {description}
          </p>
        )}
        {action && <div className="mt-4 flex items-center justify-center">{action}</div>}
      </div>
    </div>
  );
}
