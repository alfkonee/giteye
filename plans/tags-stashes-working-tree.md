# Tags and stashes in the working-tree graph

## Context

Make tag targets and stash origins visible and actionable where users browse repository history, rather than requiring a switch to separate management views.

Initial findings:
- `src/components/commit-history/CommitHistory.tsx` renders a virtualized commit graph plus a working-tree row and active-operation row.
- `src/components/commit-history/CommitListItem.tsx` has tag-capable ref pills, but the history backend currently strips tag decorations. Only two refs are shown and only branches are actionable; overflow is a tooltip.
- `src/components/repository/LocalGitViews.tsx` already implements tag creation/push/local and remote deletion, and stash creation/apply/pop/drop with previews and confirmation dialogs.
- Graph layout currently accepts only `CommitSummary[]`; the virtualizer also indexes only commits. Stash placement requires one shared displayed-row model, not a separate overlay that disrupts connectors.
- `WorkingTreeRow.tsx` is currently shown only when changes exist and has no context actions; add a stash action there without making saved snapshots act like live uncommitted work.
- `src-tauri/src/git/commit_service.rs::get_commit_history` roots its walk at branches/remotes (not explicit HEAD, tags, or stash bases) and removes `tag: ...` refs. Include those legitimate history roots without walking stash index/untracked implementation commits.
- `src/components/layout/PanelLayout.tsx` already uses `react-resizable-panels`; its details panel has a percentage-only `minSize={20}` and visibility depends only on the active view, leaving a “No Selection” placeholder and divider visible.

## Approach

Confirmed scope: History graph only, with full tag/stash management. No new repository-navigation sections.

### Graph and interaction model

- Tags remain labels on their peeled target commits, not extra commits. A tag opens details without changing HEAD; right-click opens its own actions. Replace the passive `+N` tooltip with an accessible ref chooser so every hidden tag remains actionable.
- Stashes become typed snapshot rows, visually distinct from ordinary commits, connected only to their first-parent/base commit. Show stash selector, message, original branch (when known), timestamp, and short hash. Multiple stashes at one base remain separate rows.
- Compose a single virtualized history row list so stash rows and commit rows share geometry, stable keys, and continuous graph lines. Preserve commit topology, working-tree HEAD attachment, and active-operation annotations.
- Keep stash inspection out of commit range selection and history-surgery actions. Stash selection opens read-only contents and metadata in the existing detail pane.
- Add a typed, repository-scoped tag/stash inspection selection alongside existing commit selection; clear the competing selection and reset it on repository switch. Tags show type, annotation/tagger/date when available, full name, and peeled target; stashes show saved files grouped by staged/unstaged/untracked. Do not persist a mutable `stash@{n}` selector as identity.
- Provide tag creation at a commit context and stash creation from live uncommitted work. Preserve dirty-worktree checks, operation guards, previews, confirmations, and refresh.

### Details sidebar sizing and visibility

- Reuse the existing resizable panel group and handle in `PanelLayout.tsx`; the details sidebar remains drag- and keyboard-resizable. Enforce a **320 px minimum width** in horizontal/desktop mode, deriving the library's percentage minimum from the measured container width rather than relying on `minSize={20}` or CSS clipping. Clamp the restored size when the window changes.
- Show the details pane only when the active view supports details and has a relevant selection: commit, commit range, live working tree, selected file, tag, or stash. Derive visibility from selection, not whether data has finished loading; loading/error states for a selected entity stay visible.
- With no selection, remove the details panel **and its resize handle** from layout and keyboard navigation. The main history/workspace fills the released width; render no blank rail or “No Selection” placeholder.
- Preserve the last user-adjusted details size across hide/show during the session. Keep main-pane scroll/selection stable when the details panel opens or closes.
- Retain the current stacked layout at widths up to 820 px: full available width, vertical resizing with an appropriate minimum height, and no horizontal overflow. The 320 px desktop minimum must not force overflow in a narrower window.
- Selection clearing, removed stash/tag targets, and repository/view switches recompute visibility immediately; any valid remaining selection continues to show its own details.


### Context actions

| Target | Actions |
|---|---|
| Commit | Existing commit actions; Create tag… at this commit. |
| Tag label / ref chooser | Inspect tag and target; Checkout detached…; Create branch here…; Push to remote…; Delete local…; Delete from remote…; Copy name / target hash. |
| Stash row | Inspect changes; Apply…; Pop…; Create branch from stash…; Drop…; Copy selector / stash hash; Locate base commit. |
| Live working-tree row | Create stash… with optional message and include-untracked choice. |

Distinguish local deletion from remote deletion and explain that successful pop removes the stash. Checkout must explicitly disclose detached HEAD. Branch-from-stash starts at the original base and restores saved work rather than branching at the stash merge commit. No implicit checkout/application on selection or double-click.

### Data, safety, and refresh

- Extend `StashEntry` with base/index/untracked parent OIDs parsed from `%P`; original branch text is informational and may no longer exist. Reuse existing peeled `GitTag.commitHash`.
- Root committed history at HEAD, branches, remotes, commit-target tags, and every stash base; preserve pagination and exclude stash WIP/index/untracked objects unless independently reachable through a legitimate branch/tag. Non-commit tags must not break history or expose checkout actions.
- Put a stash row immediately before its loaded base, newest first for a shared base. Before an older base loads, keep the stash discoverable as a clearly marked off-window snapshot with base hash and Locate base action; do not fabricate a connection to HEAD. Locate base loads history until the target is available. Use typed row keys rather than assuming stash and commit OIDs cannot overlap.
- Address inspection/application by immutable stash OID. Pop/drop/branch operations also carry the displayed selector and expected OID; revalidate before destructive steps and reject changed/ambiguous entries rather than act on a renumbered selector. Repository-local mutation serialization and identity checks must not be described as an atomic lock against external Git.
- Keep existing `apply/pop --index` semantics. Untracked contents are restored natively; `--include-untracked` belongs to stash creation/inspection, not apply/pop (`git stash -h` checked during planning).
- Add read-only stash file/detail queries and bounded per-file diffs for staged (`base → index`), unstaged (`index → WIP`), and untracked (third-parent tree) contents. Reuse binary/truncation handling and do not route stash merge objects through ordinary commit inspection.
- Add detached tag checkout using existing revision resolution/clean-worktree guard; reuse branch creation with the peeled target OID. Require clean state and no active operation for checkout and branch-from-stash. Gate stash create/apply/pop against active operations/unresolved conflicts; leave read-only inspection available. Disclose successful branch-from-stash consumption, preserve the stash on application failure, and refresh even after partial failure.
- Extract shared tag/stash action controllers from the existing management views so graph and management screens use the same previews, prompts, confirmations, guards, and errors. Reuse these controllers in those existing views; no new sidebar sections.
- Refresh stash lists on refs events; refresh refs plus worktree state after stash mutations, including errors that leave conflicts. Preserve selection by immutable identity across renumbering, clear removed entries, and keep tag inspection independent of branch-query availability.

## Files to modify

| Area | Critical files |
|---|---|
| History presentation | `src/components/commit-history/CommitHistory.tsx`, `CommitListItem.tsx`, `WorkingTreeRow.tsx`, `CommitDetails.tsx`, `commit-graph.ts`, `commit-refs.tsx`, `HistorySurgeryActions.tsx` |
| New focused UI/helper modules | `src/components/commit-history/history-rows.ts`, `StashRow.tsx`, `GitRefContextMenu.tsx`, `GitRefDetails.tsx`; `src/hooks/useGitRefActions.ts` |
| Selection/detail routing and sidebar sizing/visibility | `src/stores/app-store.ts`, `src/components/layout/PanelLayout.tsx` |
| Data/API | `src/types/git.ts`, `src/lib/tauri-api.ts`, `src/lib/git-data.ts` |
| Existing management views | `src/components/repository/LocalGitViews.tsx` |
| Git contracts/services | `src-tauri/src/models/stash.rs`, `src-tauri/src/git/commit_service.rs`, `stash_service.rs`, `diff_service.rs`, `tag_service.rs`, `history_service.rs` |
| Tauri exposure | `src-tauri/src/commands/stashes.rs`, `tags.rs`, `src-tauri/src/lib.rs` |
| Regressions/fixtures/docs | New `tests/history-rows.test.js`, existing `tests/operation-graph.test.js`, in-module Rust tests, `scripts/seed-qa-repositories.mjs`, `docs/manual-qa.md`, `README.md` |

No new dependencies or settings are needed. Preserve the watcher event taxonomy; repair the frontend invalidation coverage instead.

## Reuse

- `gitQueries.tags/stashes`, existing tag/stash mutations, `refreshGitStateAfterAction`, query keys and action notices: `src/lib/git-data.ts`.
- Tag remote dry-run/confirmation and stash preview/apply/pop/drop dialogs: `src/components/repository/LocalGitViews.tsx`; move these into one shared action controller, not copies.
- `buildDisplayRefs`, `describeRef`, `RefPill`: `src/components/commit-history/commit-refs.tsx`. Retain branch activation behavior, but do not gate tags on branch-query completion.
- `useExclusiveMenu`, viewport clamping and existing portal/item styling: history context menus. New menus must also support focus-on-open, arrows, Escape, and focus restoration.
- `branch_service::create_branch` for branch-from-tag; shared revision resolution and clean-state helpers in `history_service.rs` for detached tag checkout. Expose honestly named tag actions rather than calling a reflog-named API from tag UI.
- Bounded diff execution and existing `DiffResult`/`DiffViewer` binary/truncation behavior: `src-tauri/src/git/diff_service.rs`, `src/components/diff-viewer/DiffViewer.tsx`.
- Existing Rust temporary-repository harnesses and `tests/operation-graph.test.js` behavioral invariant style.
- Existing `Panel`, `PanelGroup`, `PanelResizeHandle`, and the 820 px responsive-layout branch: `src/components/layout/PanelLayout.tsx`; no replacement resizing library.

## Steps

- [x] **Backend contracts:** add stash parent metadata, identity-aware stash requests, contents/file-diff queries, branch-from-stash and detached-tag checkout commands; register APIs and migrate every existing stash caller.
- [x] **History roots:** include HEAD, commit-target tags and stash bases; restore tag decorations. Keep stash internal ancestry out of ordinary history. Filter `isTag` from branch-only merge/rebase menus so new decorations do not become accidental branch actions.
- [x] **Data and selection:** add queries/mutations and typed ref inspection selection, share action controllers with existing views, and repair refs/worktree invalidation including partial failures.
- [x] **Graph integration:** compose typed displayed rows, continuous base connectors, off-window stash visibility, stable keys, correct loader counting and commit-only comparison. Preserve HEAD/operation graph semantics and add keyboard-operable stash creation on the live working-tree row.
- [x] **Actions/details:** implement tag/ref overflow menus, tag metadata and target navigation, grouped stash diffs, full action matrix, previews/confirmations and operation gates.
- [x] **Details sidebar:** enforce the measured 320 px desktop minimum; conditionally remove the panel and divider when no relevant selection exists; preserve session size and main-pane state; retain narrow-window vertical resizing.
- [x] **Proof:** add isolated behavioral regressions and fixture coverage, run integration checks, then exercise context actions and detail paths in the real Tauri UI against disposable repositories/remotes.

## Verification

After implementation (not during planning):

- Run `bun test`, `bun run build`, and `cargo test --manifest-path src-tauri/Cargo.toml` once after integration; add focused behavioral regressions for graph attachment, peeled tag targets, stash contents, and mutation identity.
- Extend `scripts/seed-qa-repositories.mjs` with a dedicated tags/stashes fixture; document it in `docs/manual-qa.md` and update the feature description in `README.md`.
- Launch an isolated Tauri instance with a distinct app identifier and Vite/MCP ports, using `withGlobalTauri: true` for the MCP bridge. Exercise the actual graph, menus, detail panes, and dialogs—not only backend commands.
- Cover annotated/lightweight tags, tag-only reachable history, detached HEAD, several refs on one commit, long/Unicode names, multiple stashes at one base, different bases, deleted original branches, and pagination beyond 100 commits.
- Inspect staged, unstaged, and untracked stash contents, including binary/deleted files. Verify inspecting/copying changes neither HEAD nor the index/worktree.
- Exercise tag creation, detached checkout, branch creation, local deletion, and push/remote deletion against a disposable local bare remote. Verify cancellation and dirty-worktree protection.
- Exercise stash create/apply/pop/drop and branch-from-stash. Successful pop removes only the intended stash; conflicting pop retains it and exposes conflicts; a renumbering while confirmation is open is detected before execution instead of targeting a different entry. Also verify application success followed by a changed drop target retains the saved entry and reports the changed state.
- Verify external Git tag/stash changes refresh the UI, selection survives stash renumbering, selection clears safely after removal/repository switch, and commit-range comparison never includes stash internals.
- Check keyboard-accessible context/overflow menus, viewport-edge positioning, narrow/wide layouts, scroll continuity, working-tree HEAD attachment, and active-operation overlay preservation.
- In the actual Tauri UI, drag and keyboard-resize details for commits, files, working tree, tags, and stashes. Attempt to shrink below 320 px and resize the window: verify desktop minimum enforcement and no overflow in stacked mode.
- Clear all selections and open a repository with none: verify no details panel, separator, placeholder, reserved width, or hidden focus target remains, and the main pane fills the space. Select an entity again: verify details return at the remembered/clamped size without resetting main-pane scroll. Exercise loading/errors and deletion/repository/view switches.

Acceptance: every listed action works from its graph target; tags/stashes remain discoverable despite ref overflow or pagination; saved contents are complete and read-only until an explicit action; commit/working-tree/operation interactions retain their existing behavior. The details sidebar is resizable with a 320 px desktop minimum and is fully absent, including its divider, when no relevant selection exists.

### Implementation evidence

- `bun test`: 60 passing frontend tests. `cargo test --manifest-path src-tauri/Cargo.toml`: 259 passing backend tests. After the timestamp fix, the focused stash-service suites passed all 10 tests. Final `bun run build` passed.
- Actual isolated Tauri smoke used `tags-stashes-repo` and a disposable local bare remote. Exercised tag inspect/target navigation, detached checkout, branch creation, graph tag creation, push, separate remote/local deletion, overflow and keyboard menus; stash create/apply/pop/drop/branch restoration, grouped saved-file diffs, and Locate base after pagination to 114 commits.
- Dirty tag checkout refused without moving HEAD. Renumbering during drop confirmation rejected the stale selector and retained the saved OID. Conflicting pop retained its stash and exposed the existing conflict resolver. System clipboard contained the copied stash selector; viewport-edge menus stayed inside the window.
- Actual pointer drag changed sidebar width; keyboard resizing stopped above 320 px. Clearing selection removed both details and divider; reselecting restored the same width. A real 780 px window stacked the layout without document overflow.
- Smoke-discovered fixes: ISO stash timestamps for WebKit, explicit layout restoration when remounting details, and structured Tauri error messages. Fixture coverage and user-facing documentation updated.
- Review fixes (`31ef08d`): branch-from-tag now re-verifies the tag's current peeled target in the backend; stash drops confirm that exactly the verified entry disappeared and restore every removed entry via `git stash store` when an external process renumbers entries mid-flight (no silent wrong deletion). Windows CI failure fixed by pinning `core.autocrlf=false` in the stash test fixture. After the fixes: 263 backend and 60 frontend tests pass, `bun run build` passes, and both Greptile P1 threads were resolved with evidence; the non-UTF-8 saved-filename P2 was answered as a scoped follow-up (JSON IPC cannot carry raw non-UTF-8 paths losslessly).
