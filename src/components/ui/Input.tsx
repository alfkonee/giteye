import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: ReactNode;
  trailing?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({
  leadingIcon,
  trailing,
  className,
  containerClassName,
  style,
  ...props
}, ref) {
  if (!leadingIcon && !trailing) {
    return <input ref={ref} className={cn("giteye-input", className)} style={style} {...props} />;
  }

  const decorationStyle = {
    ...style,
    ...(leadingIcon ? { paddingLeft: "3rem" } : {}),
    ...(trailing ? { paddingRight: "3rem" } : {}),
  };

  return (
    <div className={cn("relative", containerClassName)}>
      {leadingIcon ? (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
          {leadingIcon}
        </span>
      ) : null}
      <input
        ref={ref}
        className={cn(
          "giteye-input",
          className,
        )}
        style={decorationStyle}
        {...props}
      />
      {trailing ? (
        <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>
      ) : null}
    </div>
  );
});

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
