# GitEye Manual QA

Use `node scripts/seed-qa-repositories.mjs` from the repository root to create disposable QA repositories under `.giteye-qa/`.

| State | Seed path | Screens to verify |
|---|---|---|
| Clean | `.giteye-qa/clean-repo` | Repo Hub recent/open, Repository Workspace clean status, history graph. |
| Dirty | `.giteye-qa/dirty-repo` | Staged/unstaged file panels, commit form, diff viewer, status bar summaries. |
| Worktree | `.giteye-qa/worktree-repo` | Worktrees/Submodules screen, worktree list/detail/actions, dirty linked worktree state. |
| Tags/stashes | `.giteye-qa/tags-stashes-repo` | Actionable tag labels/overflow, stash base connections and pagination, saved-file inspection, ref actions, and conditional details sidebar. Uses a disposable local bare remote. |
| Diverged tracking | `.giteye-qa/diverged-tracking-repo` | Diverged-branch jumps, history focus fading, single-history popup, and working-tree List columns. `main` is 2 ahead / 3 behind `origin/main`; `feature/side-lane` carries tag `side-milestone`; the tree has a rename and a partially staged file. |
| Submodule | `.giteye-qa/submodule-parent` | Submodule list/detail/actions, pinned/current commit, update/sync/bump controls. |
| Rebase conflict | `.giteye-qa/conflict-repo` | Updated-target/replayed-commit labels, progress/todo, skip/continue/abort, persistent resolver. |
| Merge conflict | `.giteye-qa/merge-conflict` | Active-operation graph overlay; add/add, text, binary, and deletion conflicts; guarded draft/stage/continue. |
| Squash conflict | `.giteye-qa/squash-conflict` | Resolve/stage, then ordinary commit; never offer merge continuation or abort. |
| Cherry-pick conflict | `.giteye-qa/cherry-pick-conflict` | Shared dialog with picked-commit labels and continuation/abort. |
| Revert conflict | `.giteye-qa/revert-conflict` | Current HEAD vs reverted commit's parent, shared continuation/abort. |
| Nested gitlink conflicts | `.giteye-qa/gitlink-conflict` | Divergent pointer cards; open `libs/child`, then `nested`; resolve inside-out, stage each child HEAD in its parent. No pointer action may modify child files. |

Capture the mapped design screens at 1490×1024 and at least one wider desktop size. Compare against `design/reference/` for density, gutters, footer/status bar placement, color hierarchy, and responsive behavior.

## Tags and stashes workflow

1. Open `tags-stashes-repo`. Verify annotated/lightweight tags, full multiline annotations, long Unicode labels, tag-only reachable history, and actionable ref overflow. Inspecting or copying a ref must not change HEAD, the index, or the working tree.
2. Inspect stashes sharing a base and the stash from a deleted branch. Load past 100 commits or use Locate base commit: stash nodes must connect to the real base, not expose their index/untracked helper commits as history. Commit-range selection must exclude stash rows.
3. Inspect staged, unstaged, and untracked groups, including binary and deleted files. Select individual files and check their saved diffs rather than the current worktree contents.
4. Create a tag from a commit menu; inspect its target, check out detached, and create a branch. Push and delete remotely only against the fixture's local `origin`; remote deletion must leave the local tag until explicitly deleted. Cancel confirmations and check dirty-worktree/active-operation protections.
5. Create a stash from the live working-tree menu, including untracked files. Apply must retain it; successful pop must consume only the selected entry. Create branch from stash must start at its saved base and restore index/worktree state. Verify drop cancellation and explicit confirmation.
6. While a drop confirmation is open, create another stash externally: refuse the stale selector and refresh without deleting another entry. Selection should follow the same saved OID after ordinary renumbering. On clean `main`, pop the deleted-branch stash: its modify/delete conflict must retain the stash and open the existing conflict resolver.
7. Use keyboard menu navigation, Escape/focus restoration, copy actions, and menus near viewport edges. External ref changes must refresh; removed refs and repository/view switches must not leave stale details.
8. Drag and keyboard-resize the details sidebar. On desktop it cannot shrink below 320 px; narrow windows stack vertically without horizontal overflow. Clear selection: no panel, divider, placeholder, or reserved width may remain. Reselect a commit/file/tag/stash: restore the remembered, clamped size without resetting the main view.

## History navigation workflow

1. Open `diverged-tracking-repo`. The History header shows `main ↕ origin/main · 2↑ 3↓`; the dirty working-tree row shows the same counts with `origin/main tip` and `Merge base` chips. Each jump scrolls to and briefly rings the right commit (upstream tip `Upstream-only work 3`, merge base `Shared history 110`). The working-tree row menu offers the same jumps.
2. Right-click a commit carrying a diverged remote branch, or a local branch pill: verify `Go to … tip` / `Go to merge base` items. Branch pills open a menu on right-click; double-click activation is unchanged.
3. Tag pill → `Show only side-milestone's history`: lanes and rows outside that ancestry fade, including the working-tree connector and lanes crossing stash rows. The focused lane (including edges passing through faded rows) stays bright, and the header shows `Focusing side-milestone`. Escape or the header chip clears it. Commits offer `Focus history from this commit`. Focus never changes selection, HEAD, or row order.
4. `View … history…` (commit, tag, or branch menu) opens a popup with only that ref's reachable history and its own lanes; `Load more` extends it. Tab and Shift-Tab remain inside the popup and background controls cannot receive focus. Clicking a row closes the popup and locates the commit in the main graph, loading past the first 100 commits if needed (try `Initial commit`). Escape, ✕, and the backdrop close the popup; Escape inside it must not clear an active focus. Move its branch externally while open: the popup refreshes. A failed merge-base jump reports a persistent history error after its menu closes. Request a merge base, then jump to a tip before it resolves: the newer destination must win, without a stale destination or error replacing it.
5. Select the working-tree row, switch Unstaged/Staged to List, and open `Columns`. Toggle Status, Folder, Renamed from, and Partial: both sections update together; badge, path, actions, and the section lanes always remain. Choices survive a reload. Tree view is unaffected.

## Resolver workflow

1. Open a conflicted fixture. Check the pinned dashed operation row, semantic side labels, dialog auto-open, dismissal, and graph/banner reopening.
2. Choose whole sides, individual regions, or ordered combinations. Previous/Next conflict wraps through highlighted regions and scrolls to the selection; Previous/Next file visits unresolved files. Inline links above each marker block must behave identically to the region controls.
3. Make a manual edit and dismiss/reopen or switch repository tabs. Preserve the buffer and editor selection. Unsaved buffers are memory-only; saved worktree drafts survive restart.
4. Save Draft and confirm `git ls-files -u` still lists the file. Mark resolved and compare the staged content with the reviewed result. Inline action labels must never enter file contents.
5. Change a file externally while its in-app draft is dirty. Refresh or refocus the app: retain both versions, disable Save/Mark until explicit reconciliation, and show compare/reload/deliberate-overwrite choices.
6. Resolve all files, including binary/absent-side decisions, then continue. A job stopping at conflicts must be `attentionRequired`, not failed. Rebase may stop at another step; the same operation session must load the new conflict.
7. For gitlinks, compare raw OIDs and available subjects. Open nested repositories and resolve inside-out. Use submodule HEAD only after committing child changes. An uninitialized unmerged gitlink must be staged to a chosen pointer before explicit initialization through Submodules.
8. Check keyboard focus trapping and restoration, editor search/undo, and narrow/wide layouts. Use a file with separated regions, Unicode, and CRLF to verify navigation offsets and saved bytes.

## AI and editor settings

- General → External conflict editor: configure an application, save unrelated preferences, and verify the path survives. Portable export must omit it.
- AI Provider → Merge Resolver: inherit the default provider/model, enable a custom override, then reset inheritance and change the global default. Confirm the effective configuration follows the selected mode.
- Preview selected/all eligible files. Check every disclosed file, provider/model, bounded history, and truncation before sending. Binary/gitlink conflicts are ineligible.
- Change provider/model/prompt or file content after preview: the old consent token/proposal must be rejected.
- With provider credentials configured, generate proposals, reject without side effects, or accept into the buffer and explicitly save/stage. Verify missing credentials, malformed responses, cancellation, and stale responses remain actionable without changing files.
