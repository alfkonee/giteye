# Advanced Native Git Gaps Plan

## Context

GitEye already exposes a broad native Git surface: repository open/init/clone, status and staging, commits, branches, remotes, stashes, tags, LFS, SSH keys, credential-helper config, diffs, worktrees, submodules, rebase/conflict handling, and GitHub PR review. The goal of this plan is to identify the next native Git gaps that would make the GUI compelling for advanced Git users rather than just covering baseline workflows.

Current implementation signals reviewed so far:

- Frontend command surface is centralized in `src/lib/tauri-api.ts`.
- Backend command registration is in `src-tauri/src/lib.rs:25-110`.
- Main app views route through `src/components/layout/PanelLayout.tsx:36-62`.
- README feature inventory is in `README.md:63-112`, with known limitations in `README.md:176-182`.
- Working tree currently supports file-level stage/unstage/stage-all/unstage-all through `src/components/working-tree/FileStatusList.tsx:88-310` and `src-tauri/src/commands/status.rs:21-45`.
- Diff retrieval currently returns raw file/commit diff text through `src-tauri/src/git/diff_service.rs:19-45` and `src-tauri/src/commands/diff.rs:6-18`.

> [!IMPORTANT]
> User direction: prioritize **patch-level workflows** first, keep the roadmap **provider-neutral/native Git only**, and present the result as a **ranked multi-milestone roadmap**.

## Approach

Prioritize advanced-user features that are native Git operations, fit the existing Tauri/Rust command architecture, and can be surfaced in focused views without turning the app into a raw terminal wrapper.

Recommended ranked roadmap:

1. **Patch-level workflows — first tranche**: hunk/line staging, hunk/file discard and restore, patch apply/export, and selected-path stashes. This is the highest daily-use gap for advanced Git users and builds directly on the existing working tree and diff panes.
2. **Remote/ref power tools — completed second tranche**: force-with-lease push, upstream tracking management, prune remotes, remote add/edit/delete, branch rename, and push/delete remote branches/tags.
3. **History surgery — completed third tranche**: cherry-pick, revert, reset soft/mixed/hard with preview, amend, and guided reflog recovery.
4. **Search and archaeology — completed fourth tranche**: commit search, file history, blame, grep, pickaxe (`-S`/`-G`), reflog browser, and lost commit recovery.
5. **Bisect and diagnostics — completed fifth tranche**: guided `git bisect`, `git fsck`, repository maintenance/gc, and signature verification.
6. **Advanced merge/rebase UX — completed sixth tranche**: merge strategy/options, rebase onto/upstream selection, rerere visibility, and conflict file status map.
7. **Submodule/worktree depth — completed seventh tranche**: recursive clone/init, submodule branch tracking, detached worktree affordances, and repair/prune details.
8. **Safety and previews — completed cross-cutting tranche**: dry-run summaries for destructive operations, operation transcript, force-with-lease defaults, and undo/recovery hints via reflog/stashes.

## Files to modify

Likely critical files:

| Area | Files |
|---|---|
| Frontend command API | `src/lib/tauri-api.ts`, `src/lib/git-data.ts` |
| App navigation/views | `src/components/layout/PanelLayout.tsx`, `src/components/layout/Sidebar.tsx`, `src/types/git.ts` |
| Working tree/diff UX | `src/components/working-tree/WorkingTree.tsx`, `src/components/working-tree/FileStatusList.tsx`, `src/components/diff-viewer/DiffViewer.tsx` |
| History UX | `src/components/commit-history/CommitHistory.tsx`, `src/components/commit-history/CommitDetails.tsx` |
| Branch/remote UX | `src/components/branches/BranchList.tsx`, `src/components/repository/LocalGitViews.tsx` |
| Backend command registration | `src-tauri/src/lib.rs`, `src-tauri/src/commands/mod.rs` |
| Backend services/models | `src-tauri/src/git/*_service.rs`, `src-tauri/src/models/*.rs` |

First-tranche additions likely needed:

| Area | Files |
|---|---|
| Patch models | `src/types/git.ts`, `src-tauri/src/models/mod.rs`, new or extended model file for hunks/patch previews |
| Patch commands | `src-tauri/src/commands/status.rs` or new `src-tauri/src/commands/patch.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs` |
| Patch service | `src-tauri/src/git/diff_service.rs` for parsing/preview, plus new `src-tauri/src/git/patch_service.rs` for applying selected hunks safely |
| Diff actions UI | `src/components/diff-viewer/DiffViewer.tsx`, `src/components/diff-viewer/UnifiedDiffFallback.tsx` |
| Working tree actions | `src/components/working-tree/FileStatusList.tsx`, `src/components/working-tree/WorkingTree.tsx` |

## Reuse

Existing patterns to reuse:

- Existing file-level stage/unstage flow in `src/components/working-tree/FileStatusList.tsx:88-310`; this should become the parent workflow for hunk-level actions rather than a separate screen.
- Existing file-level commands in `src-tauri/src/commands/status.rs:21-45`: `git add --`, `git restore --staged --`, `git add -A`, and `git reset HEAD`.
- Existing diff retrieval in `src-tauri/src/git/diff_service.rs:19-45`; extend it to return parseable hunks or add a parallel `get_file_patch` command while keeping raw diff text for rendering.
- Tauri invoke wrapper pattern in `src/lib/tauri-api.ts:32-384`.
- Query/mutation invalidation and notice lifecycle in `src/lib/git-data.ts`.
- Current multi-view shell routing in `src/components/layout/PanelLayout.tsx:36-62`.
- Existing advanced Git view precedent: `src/components/workspaces/WorktreesSubmodules.tsx`, `src/components/rebase/RebaseConflictResolver.tsx`, and `src/components/repository/LocalGitViews.tsx`.

## Steps

- [x] Capture user priority: patch-level workflows first, provider-neutral only, ranked roadmap.
- [x] Add a patch data model that can represent hunk operations with staged/unstaged side and patch text.
- [x] Add backend patch operations for stage hunk, unstage hunk, discard hunk, discard file, apply patch, and stash selected paths.
- [x] Extend the diff viewer to render hunk action controls while preserving the existing unified/split-mode behavior.
- [x] Extend working tree file actions with discard and selected-path stash affordances.
- [x] Add roadmap entries for remote/ref power tools, history surgery, search/archaeology, bisect/diagnostics, advanced merge/rebase, and deeper submodule/worktree handling.
- [x] Define safety rules for destructive operations: confirmations, force-with-lease defaults in roadmap, and reflog/stash recovery notes in roadmap.
- [x] Specify test repositories and manual flows for verification.

## Verification

Planned verification approach:

- Type-check frontend with `bunx tsc` after implementation.
- Check backend with `cargo check` and `cargo fmt --check` in `src-tauri` after implementation.
- Manually validate patch operations in disposable repositories covering clean, dirty, staged+unstaged same-file, renamed, deleted, binary, untracked, conflicted, and line-ending-sensitive states.
- Manually validate destructive actions with confirmation/previews and reflog/stash recovery notes.
- Include at least one safety/regression pass for destructive or history-rewriting commands.

## Completion notes

- Implemented native hunk stage/unstage/discard/apply commands through a new Rust patch service.
- Added validation for renamed/copied hunk patches so advanced rename+edit workflows are not rejected.
- Added working-tree hunk controls in the unified diff viewer plus copy-patch export for selected hunks.
- Added selected-path stash and file discard actions in the working tree, with confirmations for partially staged files.
- Improved existing Git feature surfacing: active rebase now appears in sidebar/status, branch deletion is available from branch context menus, and worktree/submodule sidebar placeholders no longer falsely report absence before lazy load.
- Verified with `bunx tsc`, `cargo test patch_service`, `cargo check`, and `cargo fmt --check`.

### Remote/ref power tools completion

- Implemented branch rename and upstream set/clear commands and context-menu actions.
- Implemented add/edit/delete/prune remote commands and Remotes view controls.
- Implemented explicit push branch, force-with-lease push, delete remote branch, push tag, and delete remote tag flows.
- Preserved safety defaults: no raw force push, destructive remote deletes require confirmation, and tag pushes use explicit `refs/tags/*` refspecs to avoid branch/tag ambiguity.
- Verified with `bunx tsc`, `cargo test branch_service`, `cargo test remote_service`, `cargo test tag_service`, `cargo check`, and `cargo fmt --check`.

### History surgery completion

- Implemented native cherry-pick and revert commands that require a clean worktree before starting.
- Implemented reset preview plus soft/mixed/hard reset commands; hard reset requires explicit discard confirmation.
- Implemented amend HEAD from both the commit box and selected HEAD commit actions, with staged-file count surfaced in the amend confirmation.
- Implemented reflog listing, detached checkout from a reflog selector, and recovery branch creation from reflog entries.
- Exposed history surgery actions in commit list rows, commit details, and a collapsible reflog recovery panel.
- Verified with `bunx tsc`, `cargo test history_service`, `cargo check`, and `cargo fmt --check`.

### Search and archaeology completion

- Implemented bounded read-only backend commands for commit search, file history with rename following, blame, `git grep`, and pickaxe `-S`/`-G` searches.
- Added typed archaeology result models and Tauri/query wrappers.
- Added a discoverable Search & Archaeology repository view wired through the sidebar, panel routing, and command palette.
- Preserved read-only safety: all archaeology commands use result limits and argv-based Git invocation, with no shell interpolation.
- Verified with `bunx tsc`, `cargo test archaeology_service`, `cargo check`, and `cargo fmt --check`.

### Bisect and diagnostics completion

- Implemented typed bisect state/actions for start, good, bad, skip, and reset with explicit worktree-movement metadata.
- Implemented `git fsck` summaries that preserve non-zero diagnostic output as structured results instead of collapsing everything into command failure.
- Implemented repository maintenance/gc commands behind explicit UI confirmation.
- Implemented commit/tag signature verification summaries.
- Added a Diagnostics & Bisect repository view wired through sidebar, panel routing, and command palette.
- Verified with `bunx tsc`, `cargo test diagnostics_service`, `cargo check`, and `cargo fmt --check`.

### Advanced merge/rebase UX completion

- Implemented option-aware merges with no-ff, squash, and allowlisted safe strategy options.
- Implemented rebase onto/upstream commands with optional autostash and clean-worktree safeguards.
- Implemented rerere status/config commands and local rerere toggle.
- Implemented operation summary detection for rebase, merge, cherry-pick, revert, and conflict status mapping.
- Added an Advanced Merge & Rebase panel that embeds the existing conflict resolver when relevant.
- Verified with `bunx tsc`, `cargo test git::branch_service::tests::`, `cargo test git::rebase_service::tests::`, `cargo check`, and `cargo fmt --check`.

### Submodule/worktree depth completion

- Implemented recursive submodule init/update with optional remote tracking.
- Implemented submodule branch tracking updates and recursive status detail without shell-based `git submodule foreach`.
- Implemented worktree move, lock, unlock, repair, repair preview, and prune dry-run detail commands.
- Improved the existing Worktrees/Submodules view with advanced actions, detached/locked/prunable affordances, and repair/prune preview panels.
- Preserved path safety by validating relative submodule paths and argv-only Git calls.
- Verified with `bunx tsc`, `cargo test git::submodule_service::tests`, `cargo test git::worktree_service::tests`, `cargo check`, and `cargo fmt --check`.

### Safety and previews completion

- Added an operation transcript that retains recent Git action history after transient notices expire.
- Added recovery hints to risky operations, including resets, discards, force-with-lease pushes, remote deletes, maintenance/gc, rebase, and conflict-prone history actions.
- Added backend/frontend previews for amend and rebase, plus dry-run previews for remote push/delete branch/tag flows and remote prune.
- Surfaced preview text in confirmations with best-effort caveats where remote refs may change between preview and execution.
- Verified with `bunx tsc`, full `cargo test`, `cargo check`, and `cargo fmt --check`.

## Decisions

- First tranche: **Patch-level workflows**.
- Scope: **Native Git only**, no provider-specific dependencies for these roadmap items.
- Plan shape: **Ranked roadmap** with a detailed first milestone.
