import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: ReactNode;
  trailing?: ReactNode;
  containerClassName?: string;
}

export function Input({
  leadingIcon,
  trailing,
  className,
  containerClassName,
  ...props
}: InputProps) {
  if (!leadingIcon && !trailing) {
    return <input className={cn("giteye-input", className)} {...props} />;
  }

  return (
    <div className={cn("relative", containerClassName)}>
      {leadingIcon ? (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
          {leadingIcon}
        </span>
      ) : null}
      <input
        className={cn(
          "giteye-input",
          leadingIcon && "pl-8",
          trailing && "pr-10",
          className,
        )}
        {...props}
      />
      {trailing ? (
        <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>
      ) : null}
    </div>
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "giteye-input min-h-[4.5rem] resize-none py-2 leading-5",
        className,
      )}
      {...props}
    />
  );
}
