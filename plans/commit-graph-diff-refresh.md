# Commit Graph, Commit Files, Diff Display, and Git-State Refresh Plan

## Context

The history view currently shows a dense commit list in `src/components/commit-history/CommitHistory.tsx` and `src/components/commit-history/CommitListItem.tsx`, but the graph column is only a single vertical stub rather than a real commit tree. The commit detail pane in `src/components/commit-history/CommitDetails.tsx` lists changed files but does not connect those files to a diff display. `src-tauri/src/git/diff_service.rs` and `src/lib/tauri-api.ts` already expose `get_commit_diff`, but the frontend does not currently use it in the history detail pane.

After Git mutations, query invalidation is scattered across direct custom hooks (`src/hooks/useGitStatus.ts`, `src/hooks/useBranches.ts`, `src/hooks/useCommitHistory.ts`, `src/hooks/useRepository.ts`, `src/hooks/useAdvancedGit.ts`). Some operations refresh only their local query family, so live Git-state displays like repo info, status, history, branch lists, submodules/worktrees, PR metadata, rebase state, and visible diffs can become stale after operations such as commit, stage/unstage, checkout, worktree/submodule updates, PR checkout/merge, or rebase actions.

The current codebase does not appear to have filesystem watching for external Git changes. `src-tauri/Cargo.toml` has no watcher dependency, and `src-tauri/src/lib.rs` only wires commands/plugins, so external refresh will need new Tauri-side watcher support plus a frontend event listener.

> [!IMPORTANT]
> Data architecture requirement: consolidate all current direct custom data hooks into the TanStack Query data/mutation layer. Components should use `useQuery`/`useMutation` with shared query/mutation option factories from the main data layer, not bespoke direct hooks that each call `gitApi` and manage their own query keys/invalidation.

## Approach

1. Create a centralized TanStack Query Git data module for all Git query keys, query option factories, mutation option factories, and live-state invalidation.
2. Consolidate the current direct custom hooks into that module: migrate `useGitStatus`, `useBranches`, `useCommitHistory`, `useRepository`, and `useAdvancedGit` behavior into shared query/mutation factories, then update consuming components to call `useQuery(...)` / `useMutation(...)` from TanStack Query with those factories.
3. Add repository filesystem watching so external Git changes trigger the same centralized TanStack Query invalidation path. Since `src-tauri/Cargo.toml` does not currently include a watcher dependency, plan to add `notify` on the Tauri side and emit debounced repo-change events to the React app.
4. Replace the commit list's placeholder graph stub with a richer SourceTree/GitKraken-style graph model: colored lanes, branch/ref labels, merge/diverge arcs, and readable handling for dense histories.
5. Wire the Commit Files list to the existing diff pipeline so selecting a changed file opens the whole selected commit diff and scrolls/focuses the selected file within that diff.
6. Polish the diff display integration so commit diffs use `DiffViewer` consistently, including loading/error/empty/binary states and selected-file focus behavior.

## Files to modify

| Area | Files |
| --- | --- |
| Central TanStack Query data layer | Add main data/mutation module(s), e.g. `src/lib/git-query.ts`, `src/lib/git-mutations.ts`, or `src/lib/git-data.ts` |
| Direct hook consolidation | Migrate/remove or reduce `src/hooks/useGitStatus.ts`, `src/hooks/useBranches.ts`, `src/hooks/useCommitHistory.ts`, `src/hooks/useRepository.ts`, `src/hooks/useAdvancedGit.ts` so they no longer own direct `gitApi` calls/invalidation |
| Component query usage | Update components currently consuming those hooks, including `src/components/layout/AppShell.tsx`, `src/components/layout/Toolbar.tsx`, `src/components/layout/PanelLayout.tsx`, `src/components/working-tree/*`, `src/components/commit-history/*`, `src/components/workspaces/WorktreesSubmodules.tsx`, `src/components/rebase/RebaseConflictResolver.tsx`, `src/components/review-studio/DiffReviewStudio.tsx`, and `src/components/repository/RepositoryWelcome.tsx` |
| Commit history UI | `src/components/commit-history/CommitHistory.tsx`, `src/components/commit-history/CommitListItem.tsx`, `src/components/commit-history/CommitDetails.tsx` |
| Detail pane and diff wiring | `src/components/layout/PanelLayout.tsx`, `src/types/git.ts`, `src/lib/tauri-api.ts`, `src/stores/app-store.ts` |
| Diff viewer focus support | `src/components/diff-viewer/DiffViewer.tsx`, `src/components/diff-viewer/PierreDiffViewer.tsx`, `src/components/diff-viewer/UnifiedDiffFallback.tsx`, `src/components/diff-viewer/DiffViewer.types.ts` |
| External repo watching | `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, likely new watcher command/module under `src-tauri/src/`, and a frontend listener provider/hook that uses the central query invalidation helper |

## Reuse

- Reuse the existing TanStack Query provider in `src/app/providers.tsx:1-23`.
- Reuse `src/lib/tauri-api.ts` as the low-level command bridge only; the new data layer should be the only place that turns those API calls into query/mutation options.
- Reuse existing query semantics from `src/hooks/useGitStatus.ts`, `src/hooks/useBranches.ts`, `src/hooks/useCommitHistory.ts`, `src/hooks/useRepository.ts`, and `src/hooks/useAdvancedGit.ts` while consolidating their duplicated query keys and invalidation rules.
- Reuse existing `gitApi.getCommitDiff` in `src/lib/tauri-api.ts:102-103` for whole-commit diffs through TanStack Query query options.
- Reuse existing backend command `get_commit_diff` in `src-tauri/src/commands/diff.rs:15-18` and service `src-tauri/src/git/diff_service.rs:42-56`.
- Reuse existing `DiffViewer` abstraction in `src/components/diff-viewer/DiffViewer.tsx` rather than adding a second diff renderer.
- Reuse existing app selection state in `src/stores/app-store.ts`, but add commit-diff focus state separately from working-tree file selection so history file selection does not conflict with working-tree file selection.
- Reuse Tauri event/listener patterns from `@tauri-apps/api` for external repo-change events; add the minimal Rust watcher support needed because no filesystem watcher is currently present.

## Steps

- [x] Confirm desired behavior: Commit Files selection should show the whole commit diff and scroll/focus the selected file.
- [x] Confirm desired graph depth: implement a richer SourceTree/GitKraken-style graph rather than a compact lane-only graph.
- [x] Confirm refresh scope: refresh after both in-app Git operations and external repository changes.
- [x] Incorporate architecture feedback: consolidate all current direct custom data hooks into TanStack Query query/mutation factories.
- [x] Add a central Git data module that exports query-key factories, query option factories, mutation option factories, and a shared `invalidateGitState(queryClient, repoPath, options?)` helper.
- [x] Move all current direct hook query/mutation definitions into the central module: repository, status, staged/unstaged files, working-tree diffs, commits, commit details, commit diffs, branches, remotes, worktrees, submodules, rebase, GitHub overview, PR diffs, and PR actions.
- [x] Update components to use `useQuery` and `useMutation` directly with the central module's option factories, rather than importing bespoke data hooks for each Git operation.
- [x] Remove obsolete hook logic or leave only non-data UI-composition wrappers if a component ergonomics wrapper is still useful; wrappers must not define their own query keys, direct `gitApi` calls, or invalidation behavior.
- [x] Ensure the central invalidation helper refreshes repo info, status, staged/unstaged files, commits, commit details, file diffs, commit diffs, branches, rebase state/conflict content, worktrees, submodules, GitHub overview, and PR diffs as appropriate.
- [x] Update all Git mutation definitions to call the shared invalidation helper on success, including commit/stage/unstage, branch operations, worktree/submodule actions, rebase actions, PR checkout/update/merge actions, and any existing/future remote fetch/pull/push hooks.
- [x] Add a debounced external repo watcher in Tauri using `notify`, watching both the worktree and `.git` metadata where possible, and emit a lightweight event such as `git-state-changed` with the repo path and reason.
- [x] Add a frontend listener provider/hook that subscribes to the repo-change event for the active repository and calls the same shared TanStack Query invalidation helper.
- [x] Ensure committing clears or revalidates stale working-tree and commit selections so the commit page/history view reflects the new HEAD immediately.
- [x] Extend commit history data to include parent hashes in `CommitSummary`; update `src-tauri/src/git/commit_service.rs`/`src-tauri/src/models/commit.rs` and `src/types/git.ts` so the graph can be computed from the history query without fetching every commit detail row.
- [x] Build a graph-lane layout helper for colored lanes, branch labels, and merge/diverge arcs; keep rendering virtualized-list friendly by precomputing row graph metadata in `CommitHistory`.
- [x] Replace the placeholder graph column in `CommitListItem` with the rich graph rendering, while keeping row height and virtualization stable.
- [x] Add TanStack Query options for whole-commit diffs and selection/focus state for commit files.
- [x] Make Commit Files rows selectable/clickable and render the whole selected commit diff in `PanelLayout`, passing the selected file path to `DiffViewer` so it can scroll/focus the file header.
- [x] Add file-focus support to the fallback diff viewer and verify whether `@pierre/diffs` supports a reliable file-anchor/focus API; if not, use the fallback or a wrapper-level anchor strategy for selected-file focus.
- [x] Preserve current working-tree file diff behavior and ensure commit-file selection does not conflict with working-tree file selection.

## Verification

- Run `npm run build` to verify TypeScript and Vite build.
- Run `cargo test` in `src-tauri` if backend diff, watcher, or commit-service code changes.
- During review, confirm no component imports direct custom Git data hooks for data retrieval/mutation when equivalent central TanStack Query option factories exist.
- Manual QA using seeded repositories from `npm run qa:seed` if needed:
  - Commit a staged change and verify repo info, working tree, history, commit details, file lists, and diff panes refresh without navigating away.
  - Stage/unstage files and verify all visible Git-state panels update through the central TanStack Query invalidation path.
  - Checkout/create/delete branches and verify branch, repo info, status, and history refresh.
  - Select commits in a repo with linear history, branches, and merges and verify colored lanes, labels, and merge arcs are stable and readable while scrolling.
  - Select changed files in Commit Details and verify the whole commit diff opens and scrolls/focuses the selected file.
  - Modify the active repo externally with CLI Git commands and direct file edits, then verify active Git-state displays refresh after the debounce interval.

Completed verification:
- `bun run build` passes.
- `cargo test` in `src-tauri` passes.
- Manual Tauri QA verified history graph rendering, commit details, changed-file click opening a focused full commit diff, and live refresh wiring.

## Decisions

- Commit Files clicks show the whole selected commit diff and scroll/focus the selected file.
- The commit graph should be richer than a compact GitHub-style lane graph: use colored lanes, branch/ref labels, and merge/diverge arcs in the commit list.
- Live Git-state refresh must cover both Git operations initiated inside the app and external repository changes detected on disk.
- All current direct custom Git data hooks should be consolidated into the main TanStack Query data/mutation layer; components should use `useQuery`/`useMutation` with shared query/mutation factories.
