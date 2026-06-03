# GitEye Manual QA

Use `node scripts/seed-qa-repositories.mjs` from the repository root to create disposable QA repositories under `.giteye-qa/`.

| State | Seed path | Screens to verify |
|---|---|---|
| Clean | `.giteye-qa/clean-repo` | Repo Hub recent/open, Repository Workspace clean status, history graph. |
| Dirty | `.giteye-qa/dirty-repo` | Staged/unstaged file panels, commit form, diff viewer, status bar summaries. |
| Worktree | `.giteye-qa/worktree-repo` | Worktrees/Submodules screen, worktree list/detail/actions, dirty linked worktree state. |
| Submodule | `.giteye-qa/submodule-parent` | Submodule list/detail/actions, pinned/current commit, update/sync/bump controls. |
| Rebase conflict | `.giteye-qa/conflict-repo` | Rebase & Conflict Resolver, conflict file discovery, 3-way content panes, guarded continue/abort/skip. |

Capture the mapped design screens at 1490×1024 and at least one wider desktop size. Compare against `design/reference/` for density, gutters, footer/status bar placement, color hierarchy, and responsive behavior.
