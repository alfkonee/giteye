# Merge and Rebase UX Revamp Plan

## Context

GitEye currently starts merges/rebases from the unified Git workspace, reports active operations in a compact banner, and puts conflict handling in the workspace’s lower drawer. The existing resolver is rebase-specific, renders current/incoming/result as read-only text, stages whole-file side choices immediately, and can generate an AI result that is displayed but cannot be reviewed in an editable result buffer and applied from the same flow.

The revamp should make an in-progress merge or rebase visually understandable from history, move conflict resolution into a focused dialog rather than a page/drawer, support side/hunk selection plus manual editing, and make AI output a reviewable proposal that never changes or stages a file without user acceptance.

## Approach

Recommended direction:

1. Make one backend `OperationSnapshot` the source of truth for merge, rebase, cherry-pick, and revert. Include a stable operation ID, source/current/target commit summaries, operation-specific progress, conflict capabilities, and allowed actions. Remove the duplicate rebase-state polling path after migrating its consumers.
2. Render a pinned active-operation pseudo-row above History. Reuse the working-tree row’s dashed-node visual language: a solid target/HEAD lane, dashed source/current-step lane, directional connector, and explicit `from → into/onto` labels. Decorate matching real commit rows when those commits are in the loaded virtualized window; do not draw a fragile SVG across unloaded rows or pretend the pending result is a commit.
3. Replace the conflict drawer with one operation-aware, dismissible dialog for all four operations. Preserve rebase todo/progress/skip controls and operation-specific labels while sharing file navigation, resolution, continue, and abort behavior.
4. Build a real three-way resolution workspace: base/current/incoming panes, structured conflict regions, editable result, whole-file and per-region choices, save-without-staging, and a final unresolved-file check. “Both” is exposed as the unambiguous ordered choices `Current then incoming` and `Incoming then current`. `Mark resolved` revision-checks, saves the current buffer, and stages that exact content as one guarded action.
   The backend supplies semantic side labels for each operation. The UI and AI prompt must not blindly call stage 2 “ours” and stage 3 “theirs”: during a rebase, Git’s sides represent the updated target and the commit being replayed, which is the reverse of many users’ intuition.
   Treat index mode `160000` as a first-class submodule/gitlink conflict, not text or binary content. The parent resolver shows base/current/incoming submodule commits and safe pointer choices; an initialized submodule can be opened as its own GitEye repository and use the same resolver recursively for conflicts inside it.
5. Guard every result write with the content revision returned by the backend. If an external editor or Git command changes the worktree file, refuse a stale save, retain the in-app draft, and offer compare/reload/overwrite choices rather than silently replacing either version.
6. Add an external-editor escape hatch through the existing Tauri opener. On focus return or explicit reload, fetch a new content revision and reconcile it with any dirty in-app draft.
7. Upgrade AI resolution from a detached raw string to a structured proposal loaded from repository state server-side. Add a dedicated Merge Resolver AI setting with `Use default AI configuration` as the default and an optional provider/model override; the resolver receives the effective configuration plus only the selected file’s bounded, previewable source/target history and returns resolved content, summary, rationale, warnings/ambiguities, and the operation/content revisions used.
8. Prepare AI proposals sequentially as a review queue for eligible text conflicts. Each response is stale-checked, reviewed as a diff, explicitly accepted into the editable buffer, optionally edited, saved, and separately marked resolved. AI never writes, stages, continues, or handles binary/non-UTF-8 files.
9. Keep per-operation drafts in memory across dialog close and repository-tab switches, keyed by repository plus stable operation ID. Saved worktree drafts naturally survive app restart; unsaved editor buffers do not. Clear session drafts only when the operation ID changes or completes, with a warning for dirty buffers.

## Files to modify

Critical paths:

| Area | Files |
|---|---|
| Workspace entry, banner, dialog lifecycle | `src/components/git-workspace/GitWorkspace.tsx`, `src/components/layout/AppShell.tsx`, `src/components/layout/Sidebar.tsx` |
| Start/preview merge and rebase | `src/components/git-workspace/IntegratePanel.tsx`, `src/components/branches/BranchContextMenu.tsx`, `src/components/commit-history/HistorySurgeryActions.tsx` |
| Commit graph operation row/labels | `src/components/commit-history/CommitHistory.tsx`, `src/components/commit-history/commit-graph.ts`, `src/components/commit-history/CommitListItem.tsx`, `src/components/commit-history/WorkingTreeRow.tsx` |
| Shared resolver dialog/editor | replace `src/components/rebase/RebaseConflictResolver.tsx` with operation-neutral components under `src/components/conflicts/` while retaining extracted rebase-todo controls |
| Frontend contracts, queries, mutations, draft session | `src/types/git.ts`, `src/lib/tauri-api.ts`, `src/lib/git-data.ts`, `src/stores/app-store.ts`, `src/hooks/useAdvancedGit.ts` |
| Backend operation/conflict state and guarded writes | `src-tauri/src/models/rebase.rs`, `src-tauri/src/git/rebase_service.rs`, `src-tauri/src/commands/rebase.rs`, `src-tauri/src/commands/jobs.rs` |
| Job conflict-state UX and cherry-pick/revert migration | `src-tauri/src/models/job.rs`, `src-tauri/src/git/job_runner.rs`, `src-tauri/src/commands/history.rs`, `src-tauri/src/git/history_service.rs`, `src/types/git.ts`, `src/stores/job-store.ts`, `src/lib/git-watch.tsx`, `src/components/common/CommandLogConsole.tsx` |
| Merger AI configuration, context, and structured response | `src-tauri/src/git/ai_service.rs`, `src-tauri/src/commands/ai.rs`, `src-tauri/src/commands/settings_io.rs`, `src/components/settings/SettingsPlaceholder.tsx`, `src/components/settings/AiModelCombobox.tsx`, `src/lib/tauri-api.ts`, `src/lib/git-data.ts` |
| External editor preference | `src/types/app.ts`, `src-tauri/src/storage.rs`, `src-tauri/src/commands/app_settings.rs`, `src/components/settings/SettingsPlaceholder.tsx` |
| Submodule/gitlink conflict support | `src-tauri/src/models/submodule.rs`, `src-tauri/src/git/submodule_service.rs`, `src-tauri/src/commands/submodules.rs`, `src/components/workspaces/WorktreesSubmodules.tsx`, `src/components/layout/PanelLayout.tsx` |
| CodeMirror editor dependency | `package.json`, `bun.lock` |
| Refresh and registration | `src-tauri/src/watcher.rs`, `src-tauri/src/lib.rs` |
| QA fixtures/documentation | `scripts/seed-qa-repositories.mjs`, `docs/manual-qa.md` |

## Reuse

- `get_operation_summary` in `src-tauri/src/git/rebase_service.rs` already detects all four operations, their marker heads, and unmerged porcelain-v2 entries. Extend and rename this contract instead of adding a parallel operation API.
- `get_conflict_content`, `mark_file_resolved`, and index stages 1/2/3 already provide the base/current/incoming foundation. Split side application from staging; replace the current lossy string read with capability-aware byte/encoding metadata and revision-checked writes.
- `WorkingTreeRow` already renders a dashed pseudo-commit aligned to the real graph, while `layoutCommitGraph` exposes lane/color metadata. Reuse both for the pinned operation row and row badges.
- `GitWorkspace` already auto-surfaces an operation once and owns the reopen banner. Replace its conflicts drawer with dialog state; keep `IntegratePanel` as the start-operation drawer.
- `RebaseConflictResolver` already has todo drafting, autosquash, progress, file selection, and operation actions. Extract those behaviors; remove its read-only three-pane/page layout and its rebase-only state query.
- `DiffViewer`/`@pierre/diffs` already provide syntax-highlighted split/unified patch review and hunk navigation. Reuse them for AI/current-result review, not for editing; they expose no editable merge surface.
- `openPath(path, openWith?)` from `@tauri-apps/plugin-opener` already supports a specific application and the capability is registered. Reuse it rather than introducing shell command execution.
- `GitStateWatcher` and `invalidateGitStateByReason` already refresh Git metadata, but arbitrary worktree file writes are not watched. Conflict content therefore needs its own revision/reload path rather than relying on global query invalidation.
- `recover_git_operation` already maps continue/abort for all four operation types through the per-repository job queue. Fold rebase’s duplicate continue/abort commands into a typed shared operation action with a just-before-run unresolved-index preflight; keep skip rebase-only.
- Merge/rebase starts already use the job runner, but nonzero conflict stops are recorded as generic failures; cherry-pick/revert bypass the runner and do not refresh operation state on error. Route all four through the same lifecycle and classify a nonzero exit with a valid on-disk operation/conflict state as `attentionRequired`, not a failed operation.
- A squash merge intentionally has no `MERGE_HEAD` and cannot use `git merge --continue`; after conflicts are resolved it must route to an ordinary squash commit. Preserve the generic conflict fallback for operations started outside GitEye, and only expose actions the backend can prove are valid.
- Existing AI provider/key/prompt configuration remains authoritative. Replace `resolve_conflict_with_ai(base, ours, theirs) -> string`, which has no path/history or structured validation, with an operation/file request that assembles bounded context in Rust.
- The current AI configuration already has provider catalogs/live model lookup, environment/keychain credential precedence, a merge-specific prompt, and non-secret export/import. Extend that file with an optional merge-resolution workflow override; do not create a second credential store or copy the default model into the override.
- `submodule_service` already detects parent-level gitlink conflicts, initialized/dirty/current/pinned state, validates submodule paths, and opens a submodule as a repository. Reuse that navigation and `RepositoryParent` relationship rather than treating nested worktrees as ordinary files or building a recursive editor into the parent dialog.

## Implementation sequence

**Progress (2026-09-16): complete — 6/6 implementation steps, 100%.**

| Area | Status | Evidence |
|---|---|---|
| Unified operation lifecycle | Done | Merge, rebase, cherry-pick, revert, and squash smoke workflows completed. |
| Lossless conflict and submodule handling | Done | Guarded-write tests pass; nested parent → child → leaf resolution completed cleanly. |
| History visualization | Done | Pinned operation row, dashed direction, and commit-role badges verified in the live app. |
| Resolver dialog and navigation | Done | Persistent drafts, Previous/Next file and region controls, highlighting, and inline resolution links verified. |
| Merger AI configuration and review queue | Done | Context preview, consent binding, inheritance/custom settings, and missing-key failure verified; successful provider generation still requires credentials. |
| Refresh, cleanup, and QA | Done | Obsolete paths removed, QA fixtures/manual matrix updated, both review findings resolved, production build passes, 47 frontend tests and 244 native tests pass. |

Remaining optional manual coverage: successful remote AI proposal generation, launching a selected external editor, and exact narrow-viewport visual inspection.

### 1. Unify operation state and execution

- [x] Replace `GitOperationSummary` plus separate `RebaseState` polling with one discriminated `OperationSnapshot`: stable operation ID, phase, source/current/target commits, rebase progress/todo, conflicts, semantic side labels, and backend-derived allowed actions.
- [x] Populate the snapshot from `MERGE_HEAD`, `REBASE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `ORIG_HEAD`, rebase metadata, index stages, and HEAD. Keep an explicit unclassified-conflict fallback when Git has no operation marker.
- [x] Migrate `GitWorkspace`, `AppShell`, and `Sidebar` to this query, then remove the duplicate rebase-state API/query and stale booleans.
- [x] Route cherry-pick and revert through `GitJobRunnerState` like merge/rebase. After a nonzero exit, inspect repository state: report `attentionRequired` and open/reopen the resolver when Git stopped for conflicts; reserve `failed` for commands that did not leave a recoverable operation.
- [x] Consolidate continue/abort into typed shared operation actions. Run a fresh unresolved-index and operation-ID preflight inside the existing per-repository mutation lock; keep skip rebase-only.
- [x] Ensure continuation is noninteractive and preserves Git’s prepared message. Handle squash conflicts separately: resolve/stage, then route to the normal commit flow because official Git semantics do not create `MERGE_HEAD` or support merge continuation.

### 2. Make conflict data and writes lossless

- [x] Read index entries as bytes plus stage presence, mode, and object IDs. Classify editable UTF-8 text, line endings/BOM, deleted/absent sides, symlinks, binary, oversized, and non-UTF-8 content without conflating an absent stage with an empty file or using lossy decoding.
- [x] For mode `160000`, return a typed submodule conflict instead of decoding blob content: stage-presence/OIDs, base/current/incoming commit summaries when locally available, initialized/dirty state, nested HEAD, and whether the OIDs are ancestor-related or divergent.
- [x] Add guarded gitlink resolution actions for Current pointer, Incoming pointer, Delete pointer when that side is absent, and Use submodule HEAD after a manual nested resolution. Update only the parent index entry (`160000` or removal) after rechecking operation/path/stage revisions; never overwrite, clean, checkout, initialize, or fetch the nested worktree implicitly.
- [x] If commit metadata or objects are unavailable, keep raw OIDs actionable and offer Open/Refresh paths. Git cannot initialize an unmerged gitlink: first explicitly stage a pointer, then initialize through the existing Submodules controls. A dirty nested worktree may be opened; staging its HEAD warns that uncommitted changes are not represented by the pointer.
- [x] Return semantic base/current/incoming labels and structured conflict regions for editable text. Fall back to safe whole-side/keep/delete actions when a region model cannot be produced.
- [x] Add `save_conflict_result(operationId, path, content, expectedRevision)` to write the worktree without staging only when the operation and SHA-256 content/stage revision still match.
- [x] Add `mark_conflict_resolved(...)` as a guarded save-and-stage transaction. Reserve Git's index lock, prepare a shadow index using Git's blob hashing/filter semantics and `update-index`, recheck operation/path/revision, publish the worktree and index, and conditionally restore prior bytes if publication fails without overwriting newer external edits.
- [x] Remove `checkout_conflict_side`’s immediate staging behavior; side and region selections modify only the in-memory result until Save Draft or Mark resolved.

### 3. Visualize the active operation in History

- [x] Render a pinned pseudo-row above the virtualized history using `WorkingTreeRow` geometry: solid target/HEAD node, dashed source/current-step node and connector, operation badge, progress, and accessible `from → into/onto` text.
- [x] Decorate actual source/current/target commit rows when present in the loaded history. Get compact commit descriptors from `OperationSnapshot` so ref movement or virtualization cannot make the overlay disappear.
- [x] Show the overlay for every active/attention-required phase, including rebase stops without conflicts; replace it with the real commit graph edge once Git completes.

### 4. Replace the drawer with a focused resolver dialog

- [x] Mount one full-viewport responsive, focus-trapped dialog from `GitWorkspace`; auto-open once when a new operation needs attention, allow dismissal without data loss, and retain banner/graph reopen controls.
- [x] Build the shared layout: operation overview/progress, rebase todo when applicable, unresolved/resolved navigator, base/current/incoming comparison, result editor, AI review area, and sticky Save Draft/Mark resolved/Continue/Abort actions.
- [x] Integrate CodeMirror 6 for the result with language-aware highlighting where available, line numbers, search, selection, undo/redo, dirty state, keyboard shortcuts, and a result-vs-saved diff using the existing read-only diff viewer.
- [x] Add Previous/Next conflict-region and file controls, selectable region rows, and an active-region highlight that scrolls into view without changing file content. Verified live with separated CRLF/Unicode conflicts, wraparound, and unchanged worktree revisions.
- [x] Add inline resolution links directly above each conflict block in the result editor, alongside the existing controls. Verified live: current and ordered-both choices change only drafts; Save Draft preserves CRLF/Unicode and leaves the index unmerged; action labels are never written into file contents.
- [x] Apply whole-side and ordered per-region decisions into the editor buffer; provide revert-to-worktree, reset-to-initial-merge, and explicit deletion actions without touching the index.
- [x] Keep dialog session state in memory by repository plus operation ID: selected file, dirty buffers, editor location, and AI proposals. Preserve it across dialog close and repository-tab switches; clear only on confirmed discard, operation replacement, or completion.
- [x] Render submodule conflicts as a commit-pointer comparison card, not CodeMirror: commit OIDs/subjects, relationship, initialized/dirty warnings, Current/Incoming/Delete choices, Use submodule HEAD, and Open submodule. Keep `.gitmodules` itself in the normal text resolver when that file conflicts.
- [x] When Open submodule switches to the child repository, retain the parent dialog session and show the existing parent relationship. After the child operation/HEAD changes, explicitly refresh the parent operation, worktree, and submodule queries; do not rely on the non-recursive parent watcher. Nested submodules repeat the same open-and-resolve flow.
- [x] Add a device-local external-editor executable setting with a file picker and OS-default fallback. Preserve it from delayed general-settings writes like the Git executable path; do not include it in portable settings exports.
- [x] Open the absolute validated conflict path with `openPath(path, configuredEditor)`. On focus return or Reload, compare revisions; if external and in-app edits diverged, preserve both and offer view diff, reload external version, or deliberately overwrite.
- [x] Disable Continue while a buffer is dirty, an eligible conflict is unresolved, or a mutation is pending; the backend preflight remains authoritative against terminal/external races. If rebase continuation reaches another conflict, keep the same dialog session and load the new step.

### 5. Turn AI output into a review queue

- [x] Extend `AiConfigFile`, `AiConfigView`, and `SaveAiConfigRequest` with an optional merge-resolution workflow override. Absence/clear means `inherit default`; a custom override must contain a valid provider and model together. Expose both configured and effective values so the UI and request log can say exactly what will run.
- [x] Add a “Merge Resolver” card under AI settings with `Use default AI configuration` selected by default. Show the inherited provider/model live; when custom is selected, reuse the provider selector, live model combobox, provider-specific credential status, and merge-resolution prompt controls.
- [x] Keep credentials provider-scoped through the existing environment/keychain precedence. Allow the selected merger provider’s key to be configured through the same secure credential path, never persist/export a plaintext key, and report a missing custom-provider credential instead of silently switching providers.
- [x] Include the optional non-secret merger override and merge prompt in settings export/import. Older bundles/config files deserialize to inheritance, and changing the global default immediately changes the effective merger model whenever inheritance is enabled.
- [x] Replace the raw-string AI command with a typed repository/operation/file request. Resolve the effective merge workflow configuration first, then re-read current stage blobs and assemble only bounded file-specific context: semantic side identities, source/target/current commit subjects, relevant per-file history/patches, and explicit truncation metadata.
- [x] Show a context/privacy preview before the first request, including files, history range, provider/model, and truncation; never send arbitrary repository files or secrets outside the selected conflicted content/history.
- [x] Define an `AiConflictProposal` schema with resolved content, concise decision summary, rationale by conflict region, ambiguity/warning list, and the operation/content revisions used. Reject malformed, marker-containing, oversized, stale, or wrong-file responses.
- [x] Encode the decision rubric in the prompt: preserve compatible changes from both sides, follow the current operation intent and recent file-specific history, avoid inventing APIs/dependencies, preserve formatting/newlines, and surface ambiguity rather than guessing.
- [x] Prepare eligible files sequentially with cancel/retry and per-file queued/running/ready/stale/error status. Do not request AI for binary, non-UTF-8, deleted-only, or over-limit inputs.
- [x] Review each proposal as a diff against the current result. Reject with no side effects; Accept only replaces the editor buffer, after which the user may edit, Save Draft, and separately Mark resolved.

### 6. Refresh, remove old paths, and prove the workflow

- [x] Extend repository watching/query invalidation for every operation marker, including `REVERT_HEAD`, and use explicit conflict-content revision refresh because the watcher intentionally does not recurse through arbitrary worktree files.
- [x] Ignore stale conflict/AI responses after repository, operation, step, file, or revision changes; cancel in-flight requests on operation completion/abort.
- [x] Add parent/child invalidation when a repository with `submoduleParent` changes HEAD or completes an operation, so returning to the parent resolver exposes the new submodule HEAD without recursive filesystem watching.
- [x] Remove obsolete resolver page/drawer code, old raw AI signatures, duplicate rebase action commands/queries, immediate-stage side mutations, and migrated hooks/types.
- [x] Expand disposable QA seeding and focused backend tests for all operations, semantic side labels, guarded writes, conflict classes, and paused job classification; update the manual QA matrix.

## Verification

### Recorded verification

- Integrated frontend production build and all 47 frontend tests pass; all 244 native tests pass with isolated global/system Git configuration. Review regressions now cover selected-side executable modes and externally advanced conflict state.
- Real Tauri smoke: merge, rebase, cherry-pick, and revert resolutions continued to idle; squash resolution produced an ordinary commit. Merge/rebase/cherry-pick starts reported `attentionRequired` when paused.
- Real editor smoke: two separated CRLF/Unicode conflicts, Previous/Next wraparound and highlighting, inline current/ordered-both choices, unchanged worktree before Save, preserved bytes after Save, and an unmerged index until explicit Mark resolved.
- Real lifecycle smoke: dialog dismissal/reopening retained drafts; an external file edit retained both versions and blocked writes until reconciliation; Tab wrapped within the dialog.
- Real submodule smoke: opened parent → child → nested child, resolved inside-out through the dialog, staged each merged child HEAD, and completed all three merge commits with clean worktrees and matching `160000` pointers.
- Real settings smoke: delayed general preference saves preserved the external-editor path; portable export omitted it and retained the custom merger override; resetting inheritance followed a changed global model.
- Real AI smoke: context/privacy preview showed the selected file/provider/model; missing consent and missing credentials rejected requests without file changes; the UI displayed an actionable missing-key error.
- Not exercised live: successful remote-provider proposal generation/acceptance (the isolated QA instance has no API key), launching a selected external editor application, and an exact narrow viewport (the compositor did not retain requested dimensions). Proposal validation, stale responses, lossless edge cases, and settings import/export have native/frontend regression coverage.

### Remaining manual scenario matrix

Planned end-to-end scenarios:

- Start clean fast-forward and non-fast-forward merges; verify they complete into the real graph without leaving a stale operation row.
- Start conflicting normal and squash merges; verify only the normal merge offers Continue/Abort, while squash resolution routes to an ordinary commit and never claims `git merge --continue` is available.
- Start normal and `--onto` rebases with one and multiple conflicting commits; verify target/replayed-commit labels, progress/current-step overlay, todo editing, skip, repeated conflict stops, continue, and abort.
- Start conflicting cherry-pick and revert jobs; verify they become `attentionRequired` rather than failed, show correct semantic sides, resolve through the shared dialog, and continue/abort correctly.
- Resolve text conflicts by current, incoming, both ordered ways, mixed per-region choices, manual edits, explicit deletion, and an external file change. Verify Save Draft never stages and Mark resolved stages exactly the revision shown in the editor.
- Cover modify/modify, add/add, delete/modify, rename-related, empty-side, paths containing spaces, symlink/submodule, binary, oversized, and non-UTF-8 conflicts with safe capability-specific UI.
- Race a terminal edit/resolve/abort against an open buffer and in-flight AI request; verify stale writes/proposals are rejected without losing either editor copy.
- Verify Continue is disabled for dirty/unresolved state and rejected by a fresh locked backend preflight while any unmerged index entries remain, then succeeds after all files are resolved.
- Generate one and prepare-all AI proposals with relevant history; reject without worktree changes, accept into the result buffer, edit, review the diff/rationale/warnings, and explicitly mark resolved.
- Verify provider/key/parse errors, cancellation, stale responses when switching files or rebase steps, large-file/context limits, visible truncation, and no unrelated repository content sent to the provider.
- Verify the device-local external-editor selection survives general preference saves, falls back to the OS default when unset, and is excluded from portable settings export.
- Verify Merge Resolver settings in both modes: inherited default, custom provider/model, reset to inheritance, global-default changes flowing through inheritance, provider-specific missing-key errors, and backward-compatible import/export with no secrets.
- Verify dialog keyboard navigation, CodeMirror shortcuts, focus trapping/restoration, screen-reader labels, unsaved-edit dismissal/reopen behavior, and usable narrow/wide layouts.
- Verify parent gitlink conflicts for divergent updates, add/delete, initialized and uninitialized modules, missing local commit metadata, dirty nested worktrees, and `.gitmodules` text conflicts. Confirm pointer selection never mutates nested files, AI is unavailable, and explicit Use submodule HEAD stages the expected `160000` OID.
- Open a conflicted submodule from the parent dialog, resolve its own merge/rebase in a child repository tab, return to the preserved parent session, refresh, select the child HEAD, and complete the parent operation; repeat with one nested submodule level.
- Run focused frontend type checks, CodeMirror component tests only where behavior warrants, and Rust unit/integration tests; then visually exercise the real Tauri app against disposable repositories for every operation.

## Decisions

- Resolver scope: one shared dialog for merge, rebase, cherry-pick, and revert.
- Manual editing: CodeMirror 6 in-app editor plus an external-editor escape hatch.
- External editor: a device-local GitEye executable/app setting with OS-default fallback.
- Resolve semantics: Mark resolved revision-checks, saves, and stages the exact editor buffer in one guarded action; Save Draft remains worktree-only.
- AI scope: prepare a review queue across eligible conflicted text files; acceptance and staging remain per-file.
- Merger AI configuration: inherit the default AI provider/model unless a complete merge-resolution override is explicitly enabled; custom-provider/key failures are surfaced and do not silently fall back at request time.
- Submodules: gitlink conflicts are resolved as commit pointers in the parent; content conflicts inside an initialized submodule are resolved by opening that repository with parent context preserved.
- Dialog lifecycle: dismissible with in-memory persistent drafts and a prominent reopen path while the operation remains active.
  
## Explicit non-goals

- No AI auto-accept, worktree write, staging, operation continuation, formatter, build, or test execution.
- No duplicated merger API-key store; credentials remain provider-scoped and shared through the existing keychain/environment resolution.
- No editable binary/non-UTF-8 merge tool; those conflicts get safe whole-file/deletion/external-tool choices.
- No second commit-graph engine or connector spanning unloaded virtualized rows.
- No redesign of the merge/rebase start panel, general diff viewer, or AI provider configuration beyond the integration points required above.

- No implicit recursive submodule init, fetch, checkout, clean, or conflict resolution; network and nested-worktree mutations remain explicit user actions.