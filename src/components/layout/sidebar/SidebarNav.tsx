import type { MouseEvent, ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "../../../lib/cn";

export function SidebarSection({
  title,
  count,
  expanded,
  onToggle,
}: {
  title: string;
  count?: number;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const content = (
    <>
      {onToggle ? (expanded ? <ChevronDown className="mr-1 h-3 w-3" /> : <ChevronRight className="mr-1 h-3 w-3" />) : null}
      <span className="truncate">{title}</span>
      {count !== undefined && count > 0 ? (
        <span className="ml-auto tabular-nums text-[10px] text-[var(--color-text-subtle)]">{count}</span>
      ) : null}
    </>
  );
  return (
    onToggle ? (
      <button type="button" aria-expanded={expanded} onClick={onToggle} className="giteye-section-label flex min-h-8 w-full items-center px-3 pb-1 pt-3 text-left hover:text-[var(--color-text-primary)]">
        {content}
      </button>
    ) : (
      <div className="giteye-section-label flex items-center px-3 pb-1 pt-3">{content}</div>
    )
  );
}

export interface SidebarCountBadge {
  key: string;
  icon: ReactNode;
  value: number;
  title: string;
}

export function SidebarNavItem({
  icon,
  label,
  active = false,
  indent = false,
  count,
  countBadges,
  tone = "default",
  onClick,
  onDoubleClick,
  title,
  onContextMenu,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  indent?: boolean;
  count?: number;
  countBadges?: SidebarCountBadge[];
  tone?: "default" | "warning";
  onClick?: () => void;
  onDoubleClick?: () => void;
  title?: string;
  onContextMenu?: (event: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={title}
      onContextMenu={onContextMenu}
      className={cn(
        "giteye-row flex w-full items-center gap-2.5 rounded-md text-left text-[13px] transition-colors",
        "mx-1.5 w-[calc(100%-0.75rem)]",
        indent ? "pl-6 pr-2" : "px-2",
        active
          ? "giteye-nav-active"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]",
      )}
    >
      {active ? (
        <span className="text-[var(--color-accent)]">{icon}</span>
      ) : (
        <span
          className={
            tone === "warning"
              ? "text-[var(--color-warning)]"
              : "text-[var(--color-text-muted)]"
          }
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", active && "font-semibold text-[var(--color-text-primary)]")}>
          {label}
        </span>
      </span>
      {countBadges ? (
        <span className="flex shrink-0 items-center gap-1">
          {countBadges
            .filter((badge) => badge.value > 0)
            .map((badge) => (
              <span
                key={badge.key}
                title={badge.title}
                className={cn(
                  "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  active
                    ? "bg-[var(--color-info-bg)] text-[var(--color-accent)]"
                    : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]",
                )}
              >
                {badge.icon}
                {badge.value}
              </span>
            ))}
        </span>
      ) : (
        count !== undefined &&
        count > 0 && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              active
                ? "bg-[var(--color-info-bg)] text-[var(--color-accent)]"
                : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]",
            )}
          >
            {count}
          </span>
        )
      )}
    </button>
  );
}

export function SidebarNote({ children }: { children: ReactNode }) {
  return (
    <div className="px-7 py-1 text-[12px] italic text-[var(--color-text-muted)]">
      {children}
    </div>
  );
}
