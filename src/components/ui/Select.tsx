import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  /** Shown on the trigger when value matches no option or is empty. */
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  listClassName?: string;
  id?: string;
  ariaLabel?: string;
}

const MENU_MAX_HEIGHT = 264;

interface MenuPosition {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled = false,
  size = "md",
  className,
  listClassName,
  id,
  ariaLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selectedOption = useMemo(() => options.find((option) => option.value === value), [options, value]);

  const closeMenu = (refocus = false) => {
    setOpen(false);
    setMenuPos(null);
    if (refocus) triggerRef.current?.focus();
  };

  const openMenu = () => {
    if (disabled || options.length === 0) return;
    const current = options.findIndex((option) => option.value === value);
    setHighlighted(current >= 0 && !options[current].disabled ? current : nextEnabled(options, -1, 1));
    setMenuPos(computeMenuStyle(triggerRef.current));
    setOpen(true);
  };

  const commit = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    if (option.value !== value) onValueChange(option.value);
    closeMenu(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      // Portal lives under document.body, so check both trees.
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setOpen(false);
        setMenuPos(null);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => setMenuPos(computeMenuStyle(triggerRef.current));
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [open]);

  useEffect(() => {
    if (!open || highlighted < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted]);

  const onKeyDownTrigger = (event: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        closeMenu(true);
        break;
      case "Tab":
        setOpen(false);
        setMenuPos(null);
        break;
      case "ArrowDown":
        event.preventDefault();
        setHighlighted((current) => nextEnabled(options, current, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlighted((current) => nextEnabled(options, current, -1));
        break;
      case "Home":
        event.preventDefault();
        setHighlighted(nextEnabled(options, -1, 1));
        break;
      case "End":
        event.preventDefault();
        setHighlighted(nextEnabled(options, options.length, -1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        commit(highlighted);
        break;
    }
  };

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={listRef}
            role="listbox"
            id={listId}
            aria-label={ariaLabel}
            style={{
              position: "fixed",
              top: menuPos.top,
              bottom: menuPos.bottom,
              left: menuPos.left,
              minWidth: menuPos.width,
              maxHeight: MENU_MAX_HEIGHT,
            }}
            className={cn(
              "z-[9999] overflow-y-auto overscroll-contain rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.45),0_2px_8px_rgba(0,0,0,0.3)]",
              listClassName,
            )}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlighted;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  data-index={index}
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onMouseEnter={() => !option.disabled && setHighlighted(index)}
                  onClick={() => commit(index)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium outline-none transition-colors",
                    isSelected
                      ? "bg-[var(--color-accent-muted)] text-[var(--color-text-primary)]"
                      : isHighlighted
                        ? "bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]"
                        : "text-[var(--color-text-secondary)]",
                    option.disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" /> : null}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative", size === "md" ? "w-full" : undefined, className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onKeyDownTrigger}
        className={cn(
          "flex w-full items-center justify-between gap-2 border border-[var(--color-border-muted)] bg-[var(--color-bg-inset)] px-2.5 text-left font-medium text-[var(--color-text-primary)] outline-none transition-colors",
          "hover:border-[var(--color-border)] focus-visible:border-[var(--color-border-accent)] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-focus-ring)_28%,transparent)]",
          "disabled:pointer-events-none disabled:opacity-60",
          size === "md" ? "min-h-9 rounded-[var(--radius-control)] text-[12.5px]" : "min-h-6 rounded-lg px-2 text-[11px]",
          className,
        )}
      >
        <span className={cn("min-w-0 truncate", !selectedOption && "text-[var(--color-text-muted)]")}>
          {selectedOption?.label ?? placeholder ?? "Select…"}
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform", open && "rotate-180")}
        />
      </button>
      {menu}
    </div>
  );
}

function computeMenuStyle(anchor: HTMLElement | null): MenuPosition | null {
  if (!anchor) return null;
  const rect = anchor.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  // Open downward unless there is clearly more room above.
  const upward = spaceBelow < Math.min(MENU_MAX_HEIGHT, spaceAbove) && spaceAbove > spaceBelow;
  return upward
    ? { bottom: Math.round(window.innerHeight - rect.top + 4), left: Math.round(rect.left), width: Math.round(rect.width) }
    : { top: Math.round(rect.bottom + 4), left: Math.round(rect.left), width: Math.round(rect.width) };
}

function nextEnabled(options: SelectOption[], from: number, direction: 1 | -1): number {
  let index = from;
  for (let step = 0; step < options.length; step += 1) {
    index = (index + direction + options.length) % options.length;
    if (!options[index].disabled) return index;
  }
  return from >= 0 && from < options.length && !options[from].disabled ? from : -1;
}
