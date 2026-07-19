import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconOnly?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: "giteye-btn-primary",
  secondary: "giteye-btn-secondary",
  ghost: "giteye-btn-ghost",
  danger: "giteye-btn-danger",
  success: "giteye-btn-success",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconOnly = false,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "giteye-btn",
        variantClass[variant],
        size === "sm" && "giteye-btn-sm",
        iconOnly && "giteye-btn-icon",
        className,
      )}
      {...props}
    >
      {icon}
      {!iconOnly ? children : children ? <span className="sr-only">{children}</span> : null}
    </button>
  );
}
