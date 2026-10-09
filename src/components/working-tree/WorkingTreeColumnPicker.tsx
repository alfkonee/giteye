import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Columns3 } from "lucide-react";
import { useExclusiveMenu } from "../../lib/exclusive-menu";
import {
  setWorkingTreeColumns,
  useWorkingTreeColumns,
  WORKING_TREE_COLUMNS,
} from "./working-tree-columns";

/** Checkbox menu for optional List-view columns; core columns are listed but locked. */
export function WorkingTreeColumnPicker() {
  const columns = useWorkingTreeColumns();
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = () => {
    setPosition(null);
    trigger.current?.focus();
  };
  useExclusiveMenu(Boolean(position), close);

  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitemcheckbox"]:not([aria-disabled="true"])')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [position]);

  const toggle = (id: (typeof WORKING_TREE_COLUMNS)[number]["id"]) =>
    setWorkingTreeColumns(
      columns.includes(id) ? columns.filter((column) => column !== id) : [...columns, id],
    );

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        title="Choose List view columns"
        className="inline-flex h-5 items-center gap-1 rounded px-1 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        onClick={(event) => {
          if (position) {
            close();
            return;
          }
          const bounds = event.currentTarget.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(bounds.right - 232, window.innerWidth - 240)),
            top: Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - 240)),
          });
        }}
      >
        <Columns3 className="h-3 w-3" aria-hidden="true" />
        Columns
      </button>
      {position &&
        createPortal(
          <div className="fixed inset-0 z-[100]" role="presentation" onMouseDown={close}>
            <div
              ref={menu}
              role="menu"
              aria-label="List view columns"
              className="giteye-context-menu fixed rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-1 shadow-[var(--shadow-elevated)]"
              style={{ ...position, width: 232 }}
              onMouseDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                event.preventDefault();
                const items = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]:not([aria-disabled="true"])'),
                );
                const index = items.indexOf(document.activeElement as HTMLElement);
                items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
              }}
            >
              <div className="giteye-context-header">Always shown: status, path, actions</div>
              {WORKING_TREE_COLUMNS.map((column) => {
                const checked = columns.includes(column.id);
                return (
                  <button
                    key={column.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    title={column.description}
                    className="giteye-context-item w-full"
                    onClick={() => toggle(column.id)}
                  >
                    <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-[var(--color-border)]">
                      {checked ? <Check className="h-3 w-3 text-[var(--color-accent)]" /> : null}
                    </span>
                    <span className="giteye-context-label">{column.label}</span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
