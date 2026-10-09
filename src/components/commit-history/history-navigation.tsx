import { createContext, useContext } from "react";
import type { HistoryFocusSelection } from "../../types/git";

/**
 * Read-only navigation actions for the history graph, provided by
 * CommitHistory and consumed by row menus so jumps, focus, and the
 * single-history popup work without prop-drilling through row layers.
 */
export interface HistoryNavigation {
 /** Locate a revision's tip in the graph, loading more history if needed. */
 jumpToRef: (refLabel: string) => void;
 /** Locate an already-known commit hash in the graph. */
 jumpToHash: (hash: string | null | undefined) => void;
 /** Resolve and locate the common ancestor of a pair, reporting errors in history. */
 jumpToMergeBase: (fromRef: string, toRef: string) => void;
 /** Fade every lane outside the given ref's ancestry. */
 focusHistory: (focus: HistoryFocusSelection) => void;
 /** Open the single-history popup for a revision. */
 openRefHistory: (rev: string, label: string) => void;
}

export const HistoryNavigationContext = createContext<HistoryNavigation | null>(
 null,
);

/** Null outside the history graph; menus then hide their navigation items. */
export function useHistoryNavigation(): HistoryNavigation | null {
 return useContext(HistoryNavigationContext);
}
