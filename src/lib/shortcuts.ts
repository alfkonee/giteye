import { useEffect, useRef } from "react";

/**
 * Central registry for global keyboard shortcuts.
 *
 * Bindings are stored in a canonical "Mod+K" form where "Mod" matches either
 * Ctrl or Meta (the app treats them identically across platforms). Remaps are
 * persisted to localStorage so they survive restarts.
 */

export type ShortcutId = "command-palette" | "toggle-command-log";

export interface ShortcutDefinition {
  id: ShortcutId;
  label: string;
  description: string;
  defaultBinding: string;
}

const STORAGE_KEY = "giteye:shortcut-overrides:v1";

export const SHORTCUTS: ShortcutDefinition[] = [
  {
    id: "command-palette",
    label: "Open command palette",
    description: "Search and run any command or view",
    defaultBinding: "Mod+K",
  },
  {
    id: "toggle-command-log",
    label: "Toggle command log console",
    description: "Show or hide the streamed Git job console",
    defaultBinding: "Mod+`",
  },
];

function readOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function getShortcutBinding(id: ShortcutId): string {
  const definition = SHORTCUTS.find((shortcut) => shortcut.id === id);
  if (!definition) return "";
  return readOverrides()[id] ?? definition.defaultBinding;
}

export function saveShortcutBinding(id: ShortcutId, binding: string) {
  const overrides = readOverrides();
  const definition = SHORTCUTS.find((shortcut) => shortcut.id === id);
  if (!definition) return;
  if (binding === definition.defaultBinding) {
    delete overrides[id];
  } else {
    overrides[id] = binding;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function resetShortcuts() {
  localStorage.removeItem(STORAGE_KEY);
}

function hasMod(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

/** Whether two canonical bindings collide (same mod/shift/alt + key). */
export function bindingsCollide(left: string, right: string): boolean {
  if (!left || !right) return false;
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * Canonical binding from a keydown event, or null when the event has no
 * bindable key (bare modifiers, etc.).
 */
export function bindingFromEvent(event: KeyboardEvent): string | null {
  const key = event.key;
  if (
    !key ||
    key === "Control" ||
    key === "Meta" ||
    key === "Shift" ||
    key === "Alt" ||
    key === "AltGraph"
  ) {
    return null;
  }
  const parts: string[] = [];
  if (hasMod(event)) parts.push("Mod");
  if (event.shiftKey) parts.push("Shift");
  if (event.altKey) parts.push("Alt");
  const keyLabel = key.length === 1 ? key.toUpperCase() : key;
  parts.push(keyLabel);
  return parts.join("+");
}

function matchesBinding(event: KeyboardEvent, binding: string): boolean {
  if (!binding) return false;
  const parts = binding.split("+");
  const modRequired = parts.includes("Mod");
  const shiftRequired = parts.includes("Shift");
  const altRequired = parts.includes("Alt");
  const keyPart = parts[parts.length - 1] ?? "";
  const key = event.key.toLowerCase();
  const keyMatch = keyPart.toLowerCase() === key;
  return (
    keyMatch &&
    (!modRequired || hasMod(event)) &&
    (!shiftRequired || event.shiftKey) &&
    (!altRequired || event.altKey)
  );
}

/**
 * Registers a global keydown listener for a shortcut, honoring remaps.
 * The handler is read from a ref so re-renders do not re-subscribe.
 */
export function useShortcut(id: ShortcutId, handler: () => void, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const listener = (event: KeyboardEvent) => {
      if (matchesBinding(event, getShortcutBinding(id))) {
        event.preventDefault();
        handlerRef.current();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [id, enabled]);
}
