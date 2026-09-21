# GitEye Manual QA

Use `node scripts/seed-qa-repositories.mjs` from the repository root to create disposable QA repositories under `.giteye-qa/`.

| State | Seed path | Screens to verify |
|---|---|---|
| Clean | `.giteye-qa/clean-repo` | Repo Hub recent/open, Repository Workspace clean status, history graph. |
| Dirty | `.giteye-qa/dirty-repo` | Staged/unstaged file panels, commit form, diff viewer, status bar summaries. |
| Worktree | `.giteye-qa/worktree-repo` | Worktrees/Submodules screen, worktree list/detail/actions, dirty linked worktree state. |
| Submodule | `.giteye-qa/submodule-parent` | Submodule list/detail/actions, pinned/current commit, update/sync/bump controls. |
| Rebase conflict | `.giteye-qa/conflict-repo` | Updated-target/replayed-commit labels, progress/todo, skip/continue/abort, persistent resolver. |
| Merge conflict | `.giteye-qa/merge-conflict` | Active-operation graph overlay; add/add, text, binary, and deletion conflicts; guarded draft/stage/continue. |
| Squash conflict | `.giteye-qa/squash-conflict` | Resolve/stage, then ordinary commit; never offer merge continuation or abort. |
| Cherry-pick conflict | `.giteye-qa/cherry-pick-conflict` | Shared dialog with picked-commit labels and continuation/abort. |
| Revert conflict | `.giteye-qa/revert-conflict` | Current HEAD vs reverted commit's parent, shared continuation/abort. |
| Nested gitlink conflicts | `.giteye-qa/gitlink-conflict` | Divergent pointer cards; open `libs/child`, then `nested`; resolve inside-out, stage each child HEAD in its parent. No pointer action may modify child files. |

Capture the mapped design screens at 1490×1024 and at least one wider desktop size. Compare against `design/reference/` for density, gutters, footer/status bar placement, color hierarchy, and responsive behavior.

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
