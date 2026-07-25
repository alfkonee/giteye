import { useEffect } from "react";
import { recordTrace } from "../../lib/invoke-trace";
import { useAppStore } from "../../stores/app-store";

export function FrontendTraceCollector() {
  useEffect(
    () =>
      useAppStore.subscribe((state, previousState) => {
        if (state.route === previousState.route) return;
        recordTrace("navigation", "navigation.change", {
          from: previousState.route,
          to: state.route,
        });
      }),
    [],
  );

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button, a, input, select, textarea, [role]") : null;
      recordTrace("frontend", "ui.click", {
        target: target
          ? {
              tag: target.tagName.toLowerCase(),
              id: target.id || null,
              role: target.getAttribute("role"),
              type: target.getAttribute("type"),
              title: target.getAttribute("title"),
              ariaLabel: target.getAttribute("aria-label"),
              testId: target.getAttribute("data-testid"),
            }
          : { tag: event.target instanceof Element ? event.target.tagName.toLowerCase() : "unknown" },
        button: event.button,
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const editable = target?.isContentEditable || target?.matches("input, textarea") || false;
      recordTrace("frontend", "ui.keydown", {
        key: editable && event.key.length === 1 ? "[text-input]" : event.key,
        target: target?.tagName.toLowerCase() ?? "unknown",
        editable,
        modifiers: {
          alt: event.altKey,
          control: event.ctrlKey,
          meta: event.metaKey,
          shift: event.shiftKey,
        },
        repeat: event.repeat,
      });
    };

    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  return null;
}
