import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Panel({
  elevated = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { elevated?: boolean }) {
  return (
    <div
      className={cn(elevated ? "giteye-surface-elevated" : "giteye-surface", className)}
      {...props}
    />
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("giteye-panel-header", className)}>
      {children ?? (
        <>
          <div className="min-w-0 flex-1">
            {title ? (
              <div className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
                {title}
              </div>
            ) : null}
            {description ? (
              <div className="truncate text-[11px] text-[var(--color-text-muted)]">{description}</div>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </>
      )}
    </div>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn("giteye-kbd", className)}>{children}</kbd>;
}

export function SectionLabel({
  children,
  count,
  className,
}: {
  children: ReactNode;
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "giteye-section-label flex items-center gap-2 px-2.5 pb-1 pt-2.5",
        className,
      )}
    >
      <span className="truncate">{children}</span>
      {count !== undefined && count > 0 ? (
        <span className="ml-auto tabular-nums text-[10px] text-[var(--color-text-subtle)]">{count}</span>
      ) : null}
    </div>
  );
}
