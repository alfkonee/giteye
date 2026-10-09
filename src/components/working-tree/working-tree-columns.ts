import { useSyncExternalStore } from "react";
import type { FileStatus } from "../../types/git";

export const STATUS_TEXT: Record<FileStatus, string> = {
 modified: "Modified",
 added: "Added",
 deleted: "Deleted",
 renamed: "Renamed",
 copied: "Copied",
 untracked: "Untracked",
 ignored: "Ignored",
 conflict: "Conflict",
 typechange: "Type change",
};

/**
 * Optional columns for the working-tree List view. The status badge, path,
 * and row actions are core and always rendered, as are the Staged / Unstaged /
 * Ignored section lanes; only these extras are user-selectable.
 */
export type WorkingTreeColumnId = "statusLabel" | "directory" | "oldPath" | "partial";

export const WORKING_TREE_COLUMNS: ReadonlyArray<{
 id: WorkingTreeColumnId;
 label: string;
 description: string;
 width: string;
}> = [
  { id: "statusLabel", label: "Status", description: "Status as text (Modified, Added…)", width: "76px" },
  { id: "directory", label: "Folder", description: "Containing folder in its own column", width: "minmax(0,0.7fr)" },
  { id: "oldPath", label: "Renamed from", description: "Original path of renamed files", width: "minmax(0,0.7fr)" },
  { id: "partial", label: "Partial", description: "Marks files with changes in both staged and unstaged", width: "84px" },
 ];

export const DEFAULT_WORKING_TREE_COLUMNS: ReadonlyArray<WorkingTreeColumnId> = [];

const STORAGE_KEY = "giteye.workingTree.columns";

/** Repairs stored values: unknown ids dropped, duplicates removed, registry order kept. */
export function parseStoredColumns(raw: string | null): WorkingTreeColumnId[] {
 if (raw === null) return [...DEFAULT_WORKING_TREE_COLUMNS];
 let parsed: unknown;
 try {
  parsed = JSON.parse(raw);
 } catch {
  return [...DEFAULT_WORKING_TREE_COLUMNS];
 }
 if (!Array.isArray(parsed)) return [...DEFAULT_WORKING_TREE_COLUMNS];
 const chosen = new Set(parsed.filter((value): value is string => typeof value === "string"));
 return WORKING_TREE_COLUMNS.map((column) => column.id).filter((id) => chosen.has(id));
}

/** Grid template for a List-view row: badge | path | enabled extras | actions. */
export function listGridTemplate(columns: ReadonlyArray<WorkingTreeColumnId>): string {
 const extras = WORKING_TREE_COLUMNS.filter((column) => columns.includes(column.id)).map(
  (column) => column.width,
 );
 return ["16px", "minmax(0,1fr)", ...extras, "64px"].join(" ");
}

function readColumns(): WorkingTreeColumnId[] {
 try {
  return parseStoredColumns(localStorage.getItem(STORAGE_KEY));
 } catch {
  return [...DEFAULT_WORKING_TREE_COLUMNS];
 }
}

let current: WorkingTreeColumnId[] | null = null;
const listeners = new Set<() => void>();

function snapshot(): WorkingTreeColumnId[] {
 current ??= readColumns();
 return current;
}

export function setWorkingTreeColumns(columns: ReadonlyArray<WorkingTreeColumnId>) {
 current = parseStoredColumns(JSON.stringify(columns));
 try {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
 } catch {
  // Storage may be unavailable; the in-memory choice still applies.
 }
 for (const listener of listeners) listener();
}

/** One global selection shared by every working-tree list (staged and unstaged). */
export function useWorkingTreeColumns(): WorkingTreeColumnId[] {
 return useSyncExternalStore(
  (listener) => {
   listeners.add(listener);
   return () => listeners.delete(listener);
  },
  snapshot,
  snapshot,
 );
}
