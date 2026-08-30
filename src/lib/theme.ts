import { useSyncExternalStore } from "react";
import type { Theme } from "../types/git";

const mediaQuery =
  typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (!mediaQuery) return () => {};
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    },
    () => mediaQuery?.matches ?? false,
    () => false,
  );
}

export function resolveTheme(theme: Theme, systemPrefersDark: boolean): "dark" | "light" {
  return theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme;
}