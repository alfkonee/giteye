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
        "flex h-full min-h-[160px] flex-col items-center justify-center px-6 py-8 text-center select-none",
        className,
      )}
    >
      <div className="flex max-w-[380px] flex-col items-center px-6 py-5">
        {icon && (
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-bg-selected-soft)] text-[var(--color-accent)] ring-1 ring-[var(--color-border-muted)]">
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
