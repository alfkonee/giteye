import { AlertTriangle } from "lucide-react";
import { cn } from "../../lib/cn";

interface ErrorCalloutProps {
  message: string;
  className?: string;
}

export function ErrorCallout({ message, className }: ErrorCalloutProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-[var(--radius-control)] border px-3 py-2.5 text-[12px] leading-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        className,
      )}
      style={{
        color: "var(--color-danger)",
        backgroundColor: "var(--color-danger-bg)",
        borderColor: "var(--color-danger-border)",
      }}
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 text-[var(--color-text-primary)]">{message}</span>
    </div>
  );
}
