import { useEffect, useRef } from "react";

let closeActiveMenu: (() => void) | null = null;

/**
 * Keeps at most one context menu open app-wide: when a menu opens, the
 * previously open menu (from any surface) is closed first.
 */
export function useExclusiveMenu(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const close = () => onCloseRef.current();
    const previous = closeActiveMenu;
    closeActiveMenu = close;
    previous?.();
    return () => {
      if (closeActiveMenu === close) closeActiveMenu = null;
    };
  }, [open]);
}
