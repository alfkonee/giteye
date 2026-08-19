/**
 * Sentinel "commit" that represents the uncommitted working tree. It is
 * selected like a real commit (top row of the history graph) but resolves to
 * the commit UI in the detail pane instead of commit details.
 */
export const WORKING_TREE_COMMIT_HASH = "__giteye-working-tree__";

export function isWorkingTreeSelection(hash: string | null | undefined) {
  return hash === WORKING_TREE_COMMIT_HASH;
}
