import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, X } from "lucide-react";
import {
  SHORTCUTS,
  type ShortcutId,
  bindingFromEvent,
  bindingsCollide,
  getShortcutBinding,
  resetShortcuts,
  saveShortcutBinding,
} from "../../lib/shortcuts";

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [bindings, setBindings] = useState<Record<string, string>>(() =>
    Object.fromEntries(SHORTCUTS.map((shortcut) => [shortcut.id, getShortcutBinding(shortcut.id)])),
  );

  const refresh = () =>
    setBindings(
      Object.fromEntries(SHORTCUTS.map((shortcut) => [shortcut.id, getShortcutBinding(shortcut.id)])),
    );

  // Capture the next keypress while recording a binding.
  useEffect(() => {
    if (!recording) return;
    const onCapture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const binding = bindingFromEvent(event);
      if (binding) {
        saveShortcutBinding(recording, binding);
        setRecording(null);
        refresh();
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRecording(null);
    };
    window.addEventListener("keydown", onCapture, true);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("keydown", onCapture, true);
      window.removeEventListener("keydown", onEscape);
    };
  }, [recording]);

  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-6 pt-[10vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="w-full max-w-md overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="divide-y divide-[var(--color-border-muted)]">
          {SHORTCUTS.map((shortcut) => {
            const binding = bindings[shortcut.id] ?? shortcut.defaultBinding;
            const isRecording = recording === shortcut.id;
            const collision = SHORTCUTS.some(
              (other) =>
                other.id !== shortcut.id &&
                bindingsCollide(binding, bindings[other.id] ?? other.defaultBinding),
            );
            return (
              <li key={shortcut.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium text-[var(--color-text-primary)]">{shortcut.label}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)]">{shortcut.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {collision ? (
                    <span className="text-[10px] font-medium text-[var(--color-warning)]">conflict</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setRecording(isRecording ? null : shortcut.id)}
                    className={`rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
                      isRecording
                        ? "border-[var(--color-accent)] bg-[var(--color-bg-selected)] text-[var(--color-accent)]"
                        : "border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    {isRecording ? "Press keys…" : binding}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-2.5">
          <span className="text-[10.5px] text-[var(--color-text-subtle)]">
            Click a binding, then press the new keys. Escape cancels.
          </span>
          <button
            type="button"
            onClick={() => {
              resetShortcuts();
              refresh();
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border-muted)] px-2 py-1 text-[11px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset all
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
