# Git Interactions and Related Data Views Audit

## Context

This report audits the Git interactions built so far and validates the application data views that depend on live Git state. The audit focuses on the current implementation after the commit graph, Commit Files list, diff display, and live Git-state refresh work.

> [!IMPORTANT]
> This is an audit/report for review. It does not propose code changes as already-applied work; it identifies what is currently covered, what validates cleanly, and what follow-up work should be prioritized.

## Audit summary

| Area | Status | Evidence |
| --- | --- | --- |
| Central data layer | Covered | `src/lib/git-data.ts` exports query keys, query options, mutation options, and `invalidateGitState`. |
| Low-level Tauri bridge | Covered | `src/lib/tauri-api.ts` maps frontend calls to Tauri commands. |
| Backend command registration | Covered | `src-tauri/src/lib.rs:25-75` registers repository, status, commits, branches, remotes, diffs, worktrees, submodules, rebase, GitHub, and watcher commands. |
| External repo watcher | Covered with caveats | `src-tauri/src/watcher.rs` emits `git-state-changed`; `src/lib/git-watch.tsx` listens and invalidates active repo queries. |
| Component data access | Mostly covered | Main components use `useQuery` / `useMutation` with `gitQueries` / `gitMutations`; no component-level direct `gitApi` imports were found. |
| Repo Hub / switching UX | Incomplete | Recent/favorite repo management and toolbar repo switching do not yet match the reference-design expectations. |
| Validation gates | Passing | TypeScript diagnostics clean, `bun run build` passed, `cargo test` passed. |

## Git interaction inventory

### Queries

`src/lib/git-data.ts` currently centralizes query options for:

| Query family | Query option | Primary data views |
| --- | --- | --- |
| Repository | `repositoryInfo`, `recentRepositories` | `src/components/layout/AppShell.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/working-tree/WorkingTree.tsx`, `src/components/repository/RepositoryWelcome.tsx` |
| Working tree | `status`, `stagedFiles`, `unstagedFiles`, `fileDiff` | `src/components/working-tree/WorkingTree.tsx`, `src/components/working-tree/FileStatusList.tsx`, `src/components/layout/PanelLayout.tsx` |
| Commit history | `commits`, `commitDetails`, `commitDiff` | `src/components/commit-history/CommitHistory.tsx`, `src/components/commit-history/CommitDetails.tsx`, `src/components/layout/PanelLayout.tsx` |
| Branches/remotes | `branches`, `remotes` | `src/components/layout/Toolbar.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/branches/BranchList.tsx` |
| Workspaces | `worktrees`, `submodules` | `src/components/workspaces/WorktreesSubmodules.tsx`, `src/components/layout/Sidebar.tsx` |
| Rebase/conflicts | `rebaseState`, `conflictContent` | `src/components/rebase/RebaseConflictResolver.tsx`, `src/components/layout/Sidebar.tsx` |
| GitHub/PR metadata | `githubOverview`, `pullRequestDiff` | `src/components/stacked-prs/StackedPrBoard.tsx`, `src/components/review-studio/DiffReviewStudio.tsx`, `src/components/working-tree/WorkingTree.tsx` |

### Mutations

`src/lib/git-data.ts` centralizes mutation options for:

| Mutation group | Operations covered | Refresh behavior |
| --- | --- | --- |
| Repository | open, init, clone | Sets active repo and invalidates recent repos plus active repo subtree. |
| Working tree | stage file, unstage file, stage all, unstage all, commit | Invalidates active repo subtree. `CommitBox` also clears selected working-tree file after commit. |
| Branches | checkout, create, delete | Invalidates active repo subtree. |
| Remotes | fetch, pull, push | Mutation options exist and invalidate active repo subtree, but visible toolbar buttons are not wired yet. |
| Worktrees | create, remove, prune | Invalidates active repo subtree. |
| Submodules | update, sync, bump, open | Mutating operations invalidate active repo subtree; opening delegates to repository open flow. |
| Rebase | continue, abort, skip, mark resolved, update todo | Invalidates active repo subtree. |
| Pull requests | checkout, update branch, merge | Invalidates active repo subtree. |

## Related data view validation

| View | Data source(s) | Validation result | Notes |
| --- | --- | --- | --- |
| Repo Hub / Welcome | `recentRepositories`, repository open/init/clone mutations | Partial | Data is loaded and the first five recent repos can be reopened from `src/components/repository/RepositoryWelcome.tsx:201-203` / `src/components/repository/RepositoryWelcome.tsx:339-386`, but there is no full recent-repository list, no scrollable recent list, no View All affordance from the reference designs, no repo actions menu, and favorites are placeholder-only in `src/components/repository/RepositoryWelcome.tsx:391-401`. |
| App shell / repo switcher | `repositoryInfo`, `branches` | Partial | The shell displays repo state, but the repo-name control in `src/components/layout/Toolbar.tsx:57-65` currently sends the user back to Repo Hub with `setActiveRepoPath(null)` instead of opening a repo-switch dropdown/drawer. A dedicated Home button should own navigation to Repo Hub; the repo dropdown should switch repositories with inline search. |
| Toolbar branch menu | `branches`, `checkoutBranch` | Partial | Branch menu is wired. Fetch/Pull/Push/Sync and top-right refresh buttons are visible but not wired to mutations/invalidations. |
| Sidebar counters | `branches`, `repositoryInfo`, `status`, `githubOverview`, `worktrees`, `submodules`, `rebaseState` | Pass | Uses central queries in `src/components/layout/Sidebar.tsx:35-41`. |
| Working Tree | `status`, `stagedFiles`, `unstagedFiles`, `repositoryInfo`, `githubOverview` | Pass | Manual refresh calls `invalidateGitState`; stage/unstage actions use central mutations. |
| Working-tree diff pane | `fileDiff` | Pass | `PanelLayout` renders `DiffViewer` for selected working-tree files. |
| Commit History graph | `commits` with parent hashes | Pass | `CommitHistory` derives graph layout from commit summary parents via `src/components/commit-history/commit-graph.ts`. |
| Commit Details | `commitDetails` | Pass | Shows metadata and changed files for selected commit. |
| Commit Files -> Diff | `commitDiff` plus `selectedCommitFilePath` | Pass | Selecting a commit file opens the whole commit diff and focuses the selected file in `PanelLayout`. |
| Branches view | `branches`, checkout/create/delete mutations | Pass | Uses central data layer; remote branches are listed but not actionable. |
| Worktrees/Submodules | `worktrees`, `submodules`, worktree/submodule mutations | Pass | Uses central data layer and shows mutation errors. |
| Rebase Conflicts | `rebaseState`, `conflictContent`, rebase mutations | Pass | Uses central data layer and selection recovery for changing conflict lists. |
| Stacked PRs | `githubOverview`, PR mutations | Pass with provider dependency | UI falls back when provider metadata is unavailable. |
| Review Studio | `githubOverview`, `pullRequestDiff` | Pass with provider dependency | Uses first live PR as current PR; not yet a user-selectable PR diff view. |

## Refresh behavior assessment

Current refresh coverage is broad:

1. Successful Git mutations call `invalidateGitState(queryClient, repoPath)`, which invalidates the active repo query subtree plus recent repositories.
2. The Tauri watcher emits `git-state-changed` for active repository filesystem changes.
3. `GitStateWatcher` listens for those events and invalidates the active repo subtree.
4. A 2.5s visible-window fallback invalidation exists to cover watcher gaps.
5. Most live Git queries also have a 2.5s `refetchInterval`.

### Findings

| Severity | Finding | Evidence | Recommendation |
| --- | --- | --- | --- |
| High | Repo Hub recent repositories are incomplete. | `RepositoryWelcome` slices recents to five entries and renders an overflow-hidden fixed-height list; `FavoriteList` is placeholder-only. | Add a full recent-repositories view/drawer with scrolling, View All button, reopen actions, per-repo action menu, and favorite/unfavorite support aligned to the reference designs. |
| High | Repo-name dropdown does not switch repos inline. | `Toolbar` repo-name button calls `setActiveRepoPath(null)`, taking the user to Repo Hub. | Split responsibilities: add a dedicated Home button for Repo Hub navigation, and make the repo-name control open a searchable recent/favorite repo switcher dropdown/drawer. |
| High | Toolbar Fetch/Pull/Push/Sync buttons are visible but not wired. | `src/components/layout/Toolbar.tsx:112-116` renders buttons without mutation handlers. | Wire these buttons to `gitMutations.fetch`, `gitMutations.pull`, `gitMutations.push`, and a defined sync flow. Surface pending/error states. |
| Medium | Toolbar top-right refresh button is visible but not wired. | `src/components/layout/Toolbar.tsx:139` renders refresh without `onClick`. | Call `invalidateGitState(queryClient, activeRepoPath)` and show a pending indicator. |
| Medium | Live refresh is intentionally aggressive. | `src/lib/git-data.ts` query intervals plus `src/lib/git-watch.tsx` fallback invalidation both run around every 2.5s. | Keep for correctness now, but later tune with stale-time, focused-window-only polling, or watcher-first refresh once watcher reliability is proven. |
| Medium | GitHub metadata queries rely on invalidation/fallback rather than their own refetch interval. | `githubOverview` / `pullRequestDiff` do not set `refetchInterval`; other core Git queries do. | Decide whether provider-backed views should poll independently or stay invalidation-only to avoid API churn. |
| Low | Direct custom hook files still exist. | `src/hooks/use*.ts` wrap central query/mutation options. | Accept as compatibility wrappers if unused by components; otherwise remove in a cleanup pass after import stability is confirmed. |
| Low | Remote branches are display-only in Branches view. | `src/components/branches/BranchList.tsx:110-123` lists remote branches without checkout/track action. | Add explicit checkout tracking behavior if expected. |
| Low | Review Studio picks first PR automatically. | `src/components/review-studio/DiffReviewStudio.tsx:100-102`. | Add PR selection when multiple PRs are available. |

## Verification performed

- TypeScript workspace diagnostics: no issues found.
- `bun run build`: passed.
- `cargo test` in `src-tauri`: passed, 14 tests.
- Static code audit confirmed component-level data access is centralized around `gitQueries` / `gitMutations` rather than direct `gitApi` calls.

## Recommended follow-up plan

- [ ] Add Repo Hub full recent-repository list/drawer with scroll, View All affordance, reopen action, per-repo action menu, and empty/loading/error states.
- [ ] Add repository favorites persistence and UI: favorite/unfavorite from Repo Hub and repo switcher, and populate the Favorite Repositories card with real data.
- [ ] Split Home navigation from repo switching: add a dedicated Home button and convert the toolbar repo-name control into a searchable recent/favorite repo switcher dropdown/drawer.
- [ ] Wire toolbar Fetch/Pull/Push/Sync buttons to central mutations and add pending/error UI.
- [ ] Wire toolbar refresh button to `invalidateGitState`.
- [ ] Add user-facing mutation feedback for branch/worktree/submodule/rebase/PR operations where currently minimal.
- [ ] Tune refresh strategy after watcher reliability is validated on macOS/Linux/Windows: reduce duplicate polling where safe.
- [ ] Add targeted tests for Repo Hub recent/favorite state, repo switcher behavior, commit graph layout, and query-key invalidation behavior.
- [ ] Add manual QA scenarios for full repo switching, favorites, fetch/pull/push, and external refresh.

## Review conclusion

The central Git data layer and most related data views are structurally sound and currently pass build/test validation, but Repo Hub and repo switching should not be marked complete. The most important UX gaps are: incomplete recent/favorite repository management, the repo-name control navigating home instead of acting as a searchable switcher, and visible remote toolbar actions not yet connected to the mutation layer. The biggest architectural risk is refresh cost from overlapping watcher-driven invalidation and polling; it favors correctness but should be tuned after broader QA.
