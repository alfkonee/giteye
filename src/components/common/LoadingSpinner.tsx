import { cn } from "../../lib/cn";

interface LoadingSpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function LoadingSpinner({ className, size = "md" }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-3.5 w-3.5 border-2",
    md: "h-5 w-5 border-2",
    lg: "h-7 w-7 border-[3px]",
  };

  return (
    <div
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-[var(--color-border-strong)] border-t-[var(--color-accent)] border-r-[var(--color-accent)]",
        sizeClasses[size],
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}
