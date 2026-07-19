import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";
import type { ComponentTone } from "../../types/design-system";

export type BadgeTone = Exclude<ComponentTone, "neutral"> | "neutral" | "accent";

const toneAttr: Record<BadgeTone, string | undefined> = {
  neutral: undefined,
  accent: "accent",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "accent",
  purple: "accent",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: ReactNode;
}

export function Badge({ tone = "neutral", icon, className, children, ...props }: BadgeProps) {
  return (
    <span className={cn("giteye-chip", className)} data-tone={toneAttr[tone]} {...props}>
      {icon}
      {children}
    </span>
  );
}

export interface SegmentedControlProps {
  items: Array<{ id: string; label: string; disabled?: boolean }>;
  value: string;
  onChange: (id: string) => void;
  className?: string;
  size?: "sm" | "md";
}

export function SegmentedControl({
  items,
  value,
  onChange,
  className,
}: SegmentedControlProps) {
  return (
    <div className={cn("giteye-segmented", className)} role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          data-state={value === item.id ? "active" : "inactive"}
          disabled={item.disabled}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
