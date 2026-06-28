import type { MouseEvent, ReactNode } from "react";
import { GitBranch, Minus, Square, X } from "lucide-react";
import { cn } from "../../lib/cn";
import {
  getWindowControlPlacement,
  runWindowChromeAction,
  type WindowChromeAction,
  type WindowControlPlacement,
} from "../../lib/window-controls";

interface AppChromeProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export function AppChrome({ title, subtitle, children, className }: AppChromeProps) {
  const controlPlacement = getWindowControlPlacement();

  const handleTitlebarMouseDown = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (event.defaultPrevented || event.button !== 0 || target.closest("[data-giteye-no-drag]")) {
      return;
    }

    if (event.detail > 1) {
      if (event.detail === 2) {
        void runWindowChromeAction("toggleMaximize").catch((error) => {
          console.warn("Unable to run window action toggleMaximize", error);
        });
      }
      return;
    }

    const action: WindowChromeAction = "drag";
    void runWindowChromeAction(action).catch((error) => {
      console.warn(`Unable to run window action ${action}`, error);
    });
  };

  return (
    <div className={cn("giteye-shell flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]", className)}>
      <header
        className="giteye-window-chrome grid shrink-0 select-none grid-cols-[160px_minmax(0,1fr)_160px] items-center"
        data-control-placement={controlPlacement}
        onMouseDown={handleTitlebarMouseDown}
      >
        <div className="flex min-w-0 items-center px-3">
          {controlPlacement === "left" ? <WindowControls placement={controlPlacement} /> : <WindowBrand />}
        </div>

        <div className="flex min-w-0 items-center justify-center gap-2 px-3 text-center" data-giteye-drag-region>
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
          <span className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-[var(--color-window-title)]">
            {title}
          </span>
          {subtitle ? (
            <span className="hidden min-w-0 truncate text-[11px] text-[var(--color-window-subtitle)] lg:inline">
              {subtitle}
            </span>
          ) : null}
        </div>

        <div className="flex min-w-0 items-center justify-end px-3">
          {controlPlacement === "right" ? <WindowControls placement={controlPlacement} /> : <WindowBrand />}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function WindowBrand() {
  return (
    <div className="hidden min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-window-subtitle)] sm:flex" data-giteye-drag-region>
      <span className="h-2 w-2 rounded-full bg-[var(--color-accent)] shadow-[0_0_16px_var(--color-accent)]" />
      <span className="truncate">GitEye</span>
    </div>
  );
}

function WindowControls({ placement }: { placement: WindowControlPlacement }) {
  const controls: Array<{ action: WindowChromeAction; label: string; icon: ReactNode; tone?: "close" }> =
    placement === "left"
      ? [
          { action: "close" as const, label: "Close window", icon: <X className="h-3.5 w-3.5" />, tone: "close" as const },
          { action: "minimize" as const, label: "Minimize window", icon: <Minus className="h-3.5 w-3.5" /> },
          { action: "toggleMaximize" as const, label: "Maximize or restore window", icon: <Square className="h-3 w-3" /> },
        ]
      : [
          { action: "minimize" as const, label: "Minimize window", icon: <Minus className="h-3.5 w-3.5" /> },
          { action: "toggleMaximize" as const, label: "Maximize or restore window", icon: <Square className="h-3 w-3" /> },
          { action: "close" as const, label: "Close window", icon: <X className="h-3.5 w-3.5" />, tone: "close" as const },
        ];

  return (
    <div className="flex items-center gap-1.5" data-giteye-no-drag>
      {controls.map((control) => (
        <WindowControlButton key={control.action} action={control.action} label={control.label} tone={control.tone}>
          {control.icon}
        </WindowControlButton>
      ))}
    </div>
  );
}

function WindowControlButton({
  action,
  children,
  label,
  tone,
}: {
  action: WindowChromeAction;
  children: ReactNode;
  label: string;
  tone?: "close";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="giteye-window-control"
      data-tone={tone}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={() => {
        void runWindowChromeAction(action).catch((error) => {
          console.warn(`Unable to run window action ${action}`, error);
        });
      }}
    >
      {children}
    </button>
  );
}
