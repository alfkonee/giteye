import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { AiModelView } from "../../lib/tauri-api";
import { cn } from "../../lib/cn";

/** Gap between the combobox and its listbox. */
const DROPDOWN_OFFSET = 4;
/** Minimum distance the listbox keeps from the viewport edges. */
const VIEWPORT_MARGIN = 8;

interface DropdownAnchor {
  left: number;
  top: number;
  bottom: number;
  width: number;
  viewportHeight: number;
}

interface AiModelComboboxProps {
  value: string;
  onChange: (model: string) => void;
  models: AiModelView[];
  isLoading: boolean;
  warning: string | null;
  placeholder: string;
  onRefresh: () => void;
  disabled?: boolean;
}

export function AiModelCombobox({
  value,
  onChange,
  models,
  isLoading,
  warning,
  placeholder,
  onRefresh,
  disabled = false,
}: AiModelComboboxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [anchor, setAnchor] = useState<DropdownAnchor | null>(null);
  const selectedModel = models.find((model) => model.id === value);
  const selectedText = selectedModel?.label ?? value;
  const normalizedFilter = filter.trim().toLocaleLowerCase();
  const filteredModels = useMemo(
    () =>
      normalizedFilter
        ? models.filter(
            (model) =>
              model.id.toLocaleLowerCase().includes(normalizedFilter) ||
              model.label.toLocaleLowerCase().includes(normalizedFilter),
          )
        : models,
    [models, normalizedFilter],
  );
  const virtualizer = useVirtualizer({
    count: filteredModels.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 8,
  });
  const dropdownHeight = Math.min(320, Math.max(40, filteredModels.length * 40));

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      // The listbox is portalled out of the root, so it needs its own containment check.
      if (rootRef.current?.contains(target) || parentRef.current?.contains(target)) return;
      setOpen(false);
      setFilter("");
    };
    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => document.removeEventListener("mousedown", closeOnOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }

    const syncAnchor = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next: DropdownAnchor = {
        left: rect.left,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        viewportHeight: window.innerHeight,
      };
      // Capture-phase scroll also fires while scrolling inside the listbox itself,
      // so only re-render when the combobox actually moved.
      setAnchor((current) => (current && sameAnchor(current, next) ? current : next));
    };
    syncAnchor();
    window.addEventListener("scroll", syncAnchor, true);
    window.addEventListener("resize", syncAnchor);
    return () => {
      window.removeEventListener("scroll", syncAnchor, true);
      window.removeEventListener("resize", syncAnchor);
    };
  }, [open]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, filteredModels.length - 1)));
  }, [filteredModels.length]);

  const selectModel = (model: AiModelView) => {
    onChange(model.id);
    setOpen(false);
    setFilter("");
  };

  const moveActive = (nextIndex: number) => {
    const boundedIndex = Math.min(Math.max(nextIndex, 0), filteredModels.length - 1);
    setActiveIndex(boundedIndex);
    virtualizer.scrollToIndex(boundedIndex, { align: "auto" });
  };

  const listHeight = isLoading || filteredModels.length === 0 ? 56 : dropdownHeight;
  const dropdownStyle = anchor ? dropdownPosition(anchor, listHeight) : null;

  return (
    <div ref={rootRef} className="relative">
      <div className="flex gap-2">
        <input
          value={open ? filter : selectedText}
          onFocus={() => {
            if (disabled) return;
            setFilter("");
            setOpen(true);
            setActiveIndex(Math.max(0, filteredModels.findIndex((model) => model.id === value)));
          }}
          onClick={() => !disabled && setOpen(true)}
          onChange={(event) => {
            setFilter(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              if (!open) setOpen(true);
              moveActive(activeIndex + 1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              moveActive(activeIndex - 1);
            } else if (event.key === "Enter" && open && filteredModels[activeIndex]) {
              event.preventDefault();
              selectModel(filteredModels[activeIndex]);
            } else if (event.key === "Escape") {
              setOpen(false);
              setFilter("");
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="giteye-input min-w-0 flex-1 text-[12px]"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="ai-model-listbox"
          aria-activedescendant={open && filteredModels[activeIndex] ? `ai-model-option-${activeIndex}` : undefined}
        />
        <button
          type="button"
          onClick={onRefresh}
          disabled={disabled || isLoading}
          className="giteye-btn giteye-btn-secondary giteye-btn-sm shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Refresh models
        </button>
      </div>

      {open && dropdownStyle && createPortal(
        <div
          ref={parentRef}
          id="ai-model-listbox"
          role="listbox"
          className="fixed z-[110] overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] shadow-[var(--shadow-elevated)]"
          style={dropdownStyle}
        >
          {isLoading ? (
            <div className="flex h-full items-center px-3 text-[12px] text-[var(--color-text-muted)]">Loading models…</div>
          ) : filteredModels.length === 0 ? (
            <div className="flex h-full items-center px-3 text-[12px] text-[var(--color-text-muted)]">No models available</div>
          ) : (
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const model = filteredModels[virtualRow.index];
                const selected = model.id === value;
                return (
                  <button
                    key={model.id}
                    id={`ai-model-option-${virtualRow.index}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(virtualRow.index)}
                    onClick={() => selectModel(model)}
                    className={cn(
                      "absolute left-0 top-0 flex w-full items-center gap-3 px-3 text-left hover:bg-[var(--color-bg-hover)]",
                      selected && "giteye-selected-row",
                      activeIndex === virtualRow.index && "bg-[var(--color-bg-hover)]",
                    )}
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-[var(--color-text-primary)]">{model.label}</span>
                      <span className="block truncate font-mono text-[10px] text-[var(--color-text-muted)]">{model.id}</span>
                    </span>
                    {model.contextLength !== null && (
                      <span className="giteye-chip shrink-0">{formatContextLength(model.contextLength)} ctx</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>,
        document.body,
      )}

      {warning && <p className="mt-1.5 text-[11px] text-[var(--color-warning)]">{warning}</p>}
    </div>
  );
}

function sameAnchor(a: DropdownAnchor, b: DropdownAnchor) {
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.bottom === b.bottom &&
    a.width === b.width &&
    a.viewportHeight === b.viewportHeight
  );
}

/** Places the listbox below the combobox, flipping above it when there is more room there. */
function dropdownPosition(anchor: DropdownAnchor, listHeight: number) {
  const spaceBelow = anchor.viewportHeight - anchor.bottom - DROPDOWN_OFFSET - VIEWPORT_MARGIN;
  const spaceAbove = anchor.top - DROPDOWN_OFFSET - VIEWPORT_MARGIN;
  const flipUp = listHeight > spaceBelow && spaceAbove > spaceBelow;
  const height = Math.min(listHeight, Math.max(56, flipUp ? spaceAbove : spaceBelow));

  return {
    left: anchor.left,
    width: anchor.width,
    height,
    top: flipUp
      ? Math.max(VIEWPORT_MARGIN, anchor.top - DROPDOWN_OFFSET - height)
      : anchor.bottom + DROPDOWN_OFFSET,
  };
}

function formatContextLength(contextLength: number) {
  if (contextLength >= 1_000) {
    return `${Math.round(contextLength / 1_000)}k`;
  }
  return String(contextLength);
}
