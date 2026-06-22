# Core Git UX Polish Plan

## Context

GitEye already has a broad native Git surface, but the current app model and UI still feel single-repository and synchronous in places. The requested polish focuses on making core Git workflows feel responsive, stable, and center-stage:

- Open and work with multiple repositories at once.
- Run long-running Git actions without blocking the UI.
- View command progress, logs, and results inside the app.
- Separate core local Git features from platform/collaboration features like PR/MR reviews.
- Improve general responsiveness and stability.

Initial code findings:

- The frontend is currently organized around one `activeRepoPath` in `src/stores/app-store.ts:4-54`, with route changes resetting shared selection state in `src/stores/app-store.ts:72-100`.
- `src/app/App.tsx:23-27` renders either the global repository hub or one `RepositoryWorkspace`, so multi-repo support needs a workspace/session model, not only a repo switcher.
- `src/components/layout/Sidebar.tsx:233-310` mixes local Git views and platform views, and duplicates PR access as both `Stacked PRs` and `Pull Requests`.
- Main panel routing is hardcoded from a flat `ViewType` switch in `src/components/layout/PanelLayout.tsx:64-95`.
- Backend commands are registered centrally in `src-tauri/src/lib.rs:25-176`; repository open/init/clone lives in `src-tauri/src/commands/repository.rs`.
- Git execution is mostly blocking/final-result based via `Command::output()` in `src-tauri/src/git/cli.rs:14-82`.
- The watcher already uses Tauri events with `app.emit("git-state-changed", ...)` in `src-tauri/src/watcher.rs:68-74`, which is a useful pattern for streamed background job events.
- A frontend event bridge exists in `src/lib/git-watch.tsx:13-44`; it listens for `git-state-changed` and invalidates by repo/reason, but it is single-active-repo oriented and is not mounted from `src/app/providers.tsx:19-23`.
- `NoticeCenter`/`notice-store` can surface job status, but it is intentionally small and ephemeral (`MAX_NOTICES = 8`, `MAX_TRANSCRIPT_ENTRIES = 40` in `src/stores/notice-store.ts:56-58`), so full command logs should use a separate job/output store.

## Approach

Recommended direction: introduce a workspace-first app shell where repositories are first-class sessions, Git operations are executed through a backend job runner with streamed progress/output, and navigation is driven by a grouped view registry that clearly separates core local Git from collaboration/platform features.

Concrete defaults for this polish pass:

- Use **top repository tabs** for the first multi-repo UX. Do not add a second workspace rail in the first pass.
- Show **Collaboration/Platform** navigation only when provider integration data exists or the user explicitly opens/enables it.
- Scope the command log to **GitEye-triggered jobs only**. Do not add a free-form custom command runner in this pass.
- Implement the **background job runner + command log** as the first vertical slice, because multi-repo responsiveness and reliable session polish depend on this execution model.

High-level UX target:

1. Top repository tabs show all open repositories, per-repo dirty/branch/background-job status, and quick close/reopen controls.
2. Core Git views are the center-stage default: Working Tree, History, Branches, Remotes, Stashes, Tags, Worktrees/Submodules, Merge/Rebase, Search/Diagnostics.
3. Platform/collaboration views move to a distinct conditional section: GitHub/GitLab/Bitbucket PR/MR review, Stacked PRs, Review Studio.
4. Long-running actions create background jobs with stable IDs, cancelability where safe, status events, and full stdout/stderr/result details available in an in-app command log.
5. The backend job runner owns a per-repo mutation gate/queue: mutating/ref-changing jobs are serialized per repository, while read-only jobs may run in parallel and invalidate only the affected repository state.
6. Expensive UI lists/diffs keep virtualization/lazy loading, while backend work is bounded, cancelable where appropriate, and invalidates only the affected repository state.

## Files to modify

| Area | Likely files |
|---|---|
| Workspace/session state | `src/stores/app-store.ts`, `src/types/git.ts`, possibly a new `src/stores/workspace-store.ts` |
| App shell and multi-repo UI | `src/app/App.tsx`, `src/components/repository/RepositoryWelcome.tsx`, `src/components/repository/RepositoryWorkspace.tsx`, `src/components/layout/AppShell.tsx`, `src/components/layout/Toolbar.tsx` |
| Navigation registry/grouping | `src/components/layout/Sidebar.tsx`, `src/components/layout/PanelLayout.tsx`, `src/types/git.ts`, possibly new `src/lib/view-registry.tsx` |
| Git job API and frontend state | `src/lib/tauri-api.ts`, `src/lib/git-data.ts`, `src/lib/git-watch.tsx`, `src/stores/notice-store.ts`, new job/log store and UI components |
| Backend job runner | `src-tauri/src/lib.rs`, `src-tauri/src/git/cli.rs`, new `src-tauri/src/git/job_runner.rs`, new `src-tauri/src/commands/jobs.rs`, new/extended models in `src-tauri/src/models/*` |
| Existing backend command migration | Long-running operations in `src-tauri/src/commands/repository.rs`, `remotes.rs`, `worktrees.rs`, `submodules.rs`, `rebase.rs`, `diagnostics.rs`, `github.rs` |
| Command log UI | `src/components/common/NoticeCenter.tsx`, plus new command log drawer/panel component |

## Reuse

- Existing Tauri invoke wrapper pattern in `src/lib/tauri-api.ts`.
- Existing TanStack Query key/invalidation patterns in `src/lib/git-data.ts`.
- Existing transient operation status UX from `src/stores/notice-store.ts` and `src/components/common/NoticeCenter.tsx`, but only as a summary/link to full logs.
- Existing watcher/event bridge patterns from `src-tauri/src/watcher.rs` and `src/lib/git-watch.tsx` for repo-scoped event emission and query invalidation; the frontend subscription layer must be reinstated and expanded for all open repositories.
- Existing repository storage utilities for recents/favorites in `src-tauri/src/storage.rs` and repository commands in `src-tauri/src/commands/repository.rs`.
- Existing list virtualization precedent in `src/components/commit-history/CommitHistory.tsx` for performance-sensitive views.

## Steps

- [ ] Add a backend Git job runner with job IDs, lifecycle state, streamed stdout/stderr events, final result records, and cancel support for safe operations.
- [ ] Add a per-repo mutation queue/gate inside the job runner so destructive/ref-changing jobs cannot race within the same repo, while read-only jobs can still run concurrently.
- [ ] Add frontend job/log state that subscribes to structured backend job events and renders a command log drawer/panel with searchable per-job output.
- [ ] Wire `NoticeCenter` to show brief job status plus a link/open action for the full command log, without using notices as the log storage.
- [ ] Migrate the first long-running Git commands to the job runner: clone, fetch, pull, push, submodule update/sync, worktree operations, rebase/merge operations, diagnostics/maintenance, and provider review loading.
- [ ] Rework `GitStateWatcher` into a mounted multi-repo event subscription layer for all open repositories, so backend job completion and file-system changes refresh the right repo automatically.
- [ ] Define a multi-repository workspace/session model with per-repo route, selected file/commit/branch/PR state, and active repository ID/path.
- [ ] Add top-tab multi-repo shell UI with open/close controls, per-repo status badges, job activity badges, and safe state restoration when switching repos.
- [ ] Replace the flat `ViewType` navigation coupling with a grouped view registry used by both the sidebar and panel renderer.
- [ ] Reorganize navigation so core local Git features are primary and platform/collaboration views are conditionally separated.
- [ ] Keep fast read-only queries as direct commands where appropriate, but make them non-blocking and scoped to the active/open repository.
- [ ] Add performance polish: lazy provider loading, targeted query invalidation per repo, virtualized large result lists, bounded output retention, and loading/empty/error states.
- [ ] Add stability polish: job cancellation cleanup, stale-result guards per repo, safe concurrent-operation limits per repository, and clear recovery guidance for failed Git jobs.

## Verification

Planned verification after implementation:

- Frontend type-check with `bunx tsc`.
- Backend validation with `cargo check`, relevant unit tests, and `cargo fmt --check` in `src-tauri`.
- Manual background-job test: run fetch/pull/clone/submodule update while navigating other repos; confirm UI stays responsive and logs stream into the app.
- Manual command-log test: inspect stdout/stderr, command metadata, status, duration, repo path, and final results for success, failure, and canceled jobs.
- Manual concurrency test: start two mutating jobs in the same repo and verify they are queued/serialized; start read-only jobs across multiple repos and verify they can run concurrently.
- Manual multi-repo session test: open at least three repositories, switch between top tabs, verify each keeps independent active view and selections.
- Manual IA test: confirm core Git views are primary and PR/MR/review views are visually separated from local Git workflows and hidden until relevant.
- Performance smoke test with a large history and many changed files to confirm virtualization/lazy loading still works.
