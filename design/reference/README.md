# GitEye Design References

These images are the approved visual source of truth for the GitEye desktop design system and feature roadmap.

| File | Screen purpose | Feature scope | Planned components |
|---|---|---|---|
| [`repo-hub.png`](repo-hub.png) | Global home dashboard for starting work. | Recent/favorite repositories, connected GitHub accounts, activity, health summaries, clone/open/new actions. | App shell, dashboard cards, repository lists, account panels, activity feed, action buttons. |
| [`repository-workspace.png`](repository-workspace.png) | Core local repository workspace. | Staged/unstaged/ignored files, commit form, branch sync health, commit graph/details, stacked PR rail. | Repository sidebar, toolbar, status panels, commit form, graph list, detail cards, status bar. |
| [`stacked-pr-board.png`](stacked-pr-board.png) | Stack-aware pull request planning board. | PR stack ordering, stack health, reviewers, labels, linked issues, timeline, rebase/squash/land/update-base actions. | PR cards, reorder lanes, split buttons, health badges, timeline, summary panels. |
| [`diff-review-studio.png`](diff-review-studio.png) | Focused review and code diff surface. | File tree, side-by-side diffs, conversations, suggestions, checks, reviewers, impact summary. | File tree, tab strip, split diff panel, comment threads, check rows, impact cards. |
| [`worktrees-submodules.png`](worktrees-submodules.png) | Repository extension for linked checkouts and nested repos. | Worktree list/create/switch/remove, submodule status/update/sync/bump/open, details, recent activity. | Data tables, action toolbars, detail panels, activity timeline, status badges. |
| [`rebase-conflict-resolver.png`](rebase-conflict-resolver.png) | Guided rebase and conflict resolution workspace. | Rebase todo editing, conflicted files, 3-way merge, deterministic assistant shell, before/after preview, guarded continue/abort/skip. | Todo timeline, conflict file list, 3-way diff, merge result editor, assistant panel, confirmation dialogs. |

Baseline capture size: 1490×1024. Implementation must preserve the visual hierarchy at that size and adapt to broader desktop windows.
