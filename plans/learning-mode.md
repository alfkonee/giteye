# Git Learning Mode Plan

## Context

GitEye should offer an optional Learning Mode that explains what the application is doing on the user's behalf, reveals the corresponding Git concepts and commands at an appropriate depth, and periodically checks recall through command-entry challenges. Progress should persist across sessions and culminate in earned experience and badges without obstructing normal Git work.

Current architecture discovered:

- Git actions enter through the typed frontend facade in `src/lib/tauri-api.ts` and are implemented by Tauri command handlers and Rust Git services.
- Background jobs (currently fetch, pull, push, merge, rebase, clone, LFS, submodule, and selected worktree operations) expose redacted `command` plus `args` through `GitJobEvent`/`GitJobRecord`; `src/lib/git-watch.tsx` ingests their lifecycle and `src/components/common/CommandLogConsole.tsx` renders the exact command/output.
- Core beginner actions—including stage/unstage, commit, branch create/switch, and stash operations—run synchronously and currently return `void`; they do not enter the job log or expose an exact command receipt. Their React Query mutations are centralized in `src/lib/git-data.ts`, so completed learning actions can be observed there once the backend returns structured receipts.
- App-wide preferences are persisted in the Rust `AppSettings` model (`src-tauri/src/storage.rs`) and hydrated into Zustand by `src/lib/app-settings-sync.tsx`. Settings writes can carry stale snapshots, so frequently updated progress must use a separate locked/versioned document rather than sharing `app_settings.json`.
- Root-level overlays/listeners are composed in `src/app/providers.tsx`, providing a natural mount point for an app-wide teaching surface.
- Global Settings already has tabbed navigation in `src/components/settings/SettingsPlaceholder.tsx`; Learning Mode should be configured there rather than in repository-specific settings.
- Radix Tooltip is installed but no tooltip primitive is currently exported; the feature should add one shared accessible wrapper rather than hand-rolled hover behavior.
- The app data directory is already the canonical home for local managed state. A disposable practice repository can live under that directory and remain separate from recents and active user repositories.

## Approach

Add a local-first, opt-in Learning Mode for beginner-to-intermediate users. Invite users once with a dismissible, non-modal first-run card, then keep permanent controls in Settings → Learning. Add a top-level Learning Center beside Repo Hub and Settings for curriculum progress, overall level, concept badges, challenge history, and the unlocked Practice Lab.

Use an adaptive inline coach: concise guidance anchored to the action the user just completed, expandable detail, and an automatic explanation depth that progresses from mental models to exact commands, internals, safety, and recovery. Settings can temporarily force beginner, intermediate, or automatic depth. Normal operations reveal their actual redacted command after success; destructive or history-rewriting operations reveal the command in the existing confirmation/preview before execution.

Keep operational truth in the Git execution path. Introduce a backend-produced `GitActionReceipt` for selected synchronous operations containing a stable action ID and the exact redacted command sequence actually chosen by the service. Feed successful receipts from centralized React Query mutations into the coordinator. Translate only successful terminal background `GitJobEvent`s into the same learning-event shape. Refactor argument construction into shared Rust builders wherever preview and execution must agree; never reconstruct commands from button labels or duplicate Git rules in React.

Keep receipts ephemeral. The persisted profile records curriculum/action IDs, counters, XP, badges, attempts, cadence timestamps, and unlocks—never repository paths, commit messages, command arguments, or job output. Reuse the job runner's credential redaction and add learning-specific placeholders for free-form values such as commit messages.

Store low-frequency preferences (`enabled`, automatic/manual depth, challenge opt-in, first-run invitation state) in `AppSettings`. Store the frequently updated, versioned global profile in a separate locked `learning_progress.json` with defaults, normalization, backup recovery, atomic writes, and serialized frontend saves. Optional Learning Center export/import uses its own versioned profile bundle and is never silently included in general settings export.

Master a concept only after two qualifying successful actions plus one passed command challenge. Repeated identical actions may reinforce a lesson but cannot farm mastery/XP within the same session. XP raises an overall learner level; durable concept badges mark Foundations, Branches, Remotes, Integration, and History. Failed/canceled actions and dismissed/incorrect challenges award no mastery.

Schedule a challenge after roughly three to five relevant successful actions, only when no Git operation, confirmation, recovery dialog, or other challenge is active. Cap challenges at one per 15 minutes and two per app session; every challenge can be snoozed or dismissed. Send challenge text through the same strict backend argv lexer used by Practice Lab, then grade the returned tokens semantically against accepted command forms, including safe equivalents, optional `git`, and harmless flag ordering; explain the canonical answer. Typed challenge answers never execute against a user repository.

After the Foundations curriculum is mastered, unlock an optional Practice Lab. Create/reset a GitEye-owned repository under app data, never add it to recents, and accept only parsed, exercise-scoped allowlisted `git` argv. Reject shell operators, command substitution, redirection, global Git configuration/path overrides, path escape, non-Git programs, and unrelated/destructive subcommands. Show the predicted exercise effect, require explicit execution, run argv directly without a shell, and grade the resulting repository state rather than exit code alone. Do not reuse the current arbitrary custom-command endpoint or its whitespace-only frontend parser.

## Curriculum

- **Foundations** — working tree/index/HEAD mental model; status; stage/unstage file, hunk, and all; commit; create and switch basic branches. Completing its action evidence and challenges unlocks the Practice Lab.
- **Branches** — local versus remote-tracking branches, rename/delete, upstream tracking, safe switch strategies, and fast-forward behavior.
- **Remotes** — remote names/URLs, fetch versus pull, push/upstream setup, and why force-with-lease differs from force.
- **Integration** — stash/apply/pop, merge, merge conflicts, ours/theirs meaning, continue/abort, and rerere at an introductory level.
- **History** — amend, rebase, cherry-pick, revert, reset modes, reflog recovery, and the distinction between public and local history rewriting.

Each curriculum item defines prerequisites, qualifying action IDs, beginner/intermediate explanations, canonical and equivalent command patterns, risk/recovery notes, challenge templates, practice fixtures/postconditions, XP, and badge criteria. Advanced diagnostics, bisect, LFS, worktrees, submodules, GitHub/`gh`, and arbitrary custom commands remain out of first-release mastery scope.

## Files to modify

| File | Planned change |
|---|---|
| `src/types/app.ts`, `src-tauri/src/storage.rs`, `src/lib/app-settings-sync.tsx` | Add and safely hydrate/persist Learning Mode preferences and first-run invitation state without racing device-owned settings. |
| `src/types/learning.ts`, `src-tauri/src/models/learning.rs` | Define action receipts/previews, curriculum/profile schema, mastery evidence, challenge results, badges/levels, profile bundle, and practice requests/results. |
| `src-tauri/src/learning_storage.rs`, `src-tauri/src/commands/learning.rs`, `src-tauri/src/lib.rs` | Implement locked/versioned progress storage, atomic load/save/reset, explicit profile export/import, practice commands, and Tauri registration. |
| `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` | Add a small argv lexer such as `shlex`; one Rust parser serves both non-executing challenge tokenization and Practice Lab validation, while execution still uses `Command::args`, never a shell. |
| `src/lib/tauri-api.ts`, `src/stores/learning-store.ts`, `src/lib/learning/*` | Add typed APIs, serialized profile updates, curriculum registry, mastery/XP engine, semantic grader, cadence selector, and job/receipt adapters. |
| `src/lib/git-data.ts` | Feed successful synchronous receipts into one learning completion helper at the centralized mutation boundary. |
| `src-tauri/src/models/job.rs`, `src-tauri/src/git/job_runner.rs`, `src/lib/git-watch.tsx` | Reuse redacted background-job truth and emit learning outcomes only for successful terminal jobs; add an explicit learning action ID only where `kind` is not semantic enough. |
| Selected `src-tauri/src/commands/{status,branches,stashes,history,rebase,remotes}.rs` and matching `src-tauri/src/git/*_service.rs` | Return receipts for curriculum actions and share exact argv builders between risky previews and execution. |
| `src/types/git.ts`, `src/stores/app-store.ts`, `src/components/layout/AppSidebar.tsx`, `src/components/repository/RepositoryWelcome.tsx` | Add the top-level `learning` route/navigation and render the Learning Center with correct app-chrome title/subtitle. |
| `src/app/providers.tsx`, `src/components/settings/CliSetup.tsx`, `src/components/settings/SettingsPlaceholder.tsx` | Mount the coordinator, serialize first-run offers so cards never stack, and add Learning preference/depth controls. |
| `src/components/ui/Tooltip.tsx`, `src/components/ui/index.ts`, `src/components/learning/*` | Add the accessible Radix tooltip wrapper, inline coach, challenge card, Learning Center, badges/levels, profile controls, and Practice Lab. |
| `src/components/working-tree/{FileStatusList,CommitBox,WorkingCommitDetails}.tsx`, `src/components/layout/Toolbar.tsx`, `src/components/branches/*`, `src/components/repository/LocalGitViews.tsx`, `src/components/git-workspace/IntegratePanel.tsx`, `src/components/commit-history/HistorySurgeryActions.tsx` | Add stable coach anchors and include backend command previews in existing risky-action confirmations without duplicating progression logic. |
| `src/components/common/CommandLogConsole.tsx` | Add “Explain this command” links for curriculum jobs while retaining the command log as execution detail, not a second progress source. |
| `src-tauri/src/git/learning_practice_service.rs` | Own the contained seeded repository, argv allowlists, effect previews, direct execution, postcondition grading, reset, and deletion. |
| `src/index.css` | Add theme-complete, responsive coach/challenge/center/badge/lab styles using existing tokens and reduced-motion behavior. |
| `tests/learning-mode.test.js` and Rust module tests | Cover observable progression/cadence/grading plus storage, redaction, parser, containment, allowlist, and practice postconditions. |
| `README.md`, `docs/manual-qa.md` | Document opt-in behavior, privacy/storage, progress export, Practice Lab safety boundary, and end-to-end manual checks. |

## Reuse

- `GitJobEvent`/`GitJobRecord` status, redacted command/args, timestamps, and `kind` in `src-tauri/src/models/job.rs`, `src-tauri/src/git/job_runner.rs`, and `src/lib/git-watch.tsx`.
- Centralized `gitMutations` success/error lifecycle in `src/lib/git-data.ts`; all known core call sites already use these factories.
- `CommandLogConsole` in `src/components/common/CommandLogConsole.tsx` for exact tracked command/output inspection.
- `AppSettings` defaults, normalization, locking, backup recovery, and device-field preservation in `src-tauri/src/storage.rs`; mirror these durability rules in the separate progress store.
- `CliSetupOffer` in `src/components/settings/CliSetup.tsx` as the established dismissible non-modal invitation pattern, coordinated rather than duplicated.
- Existing confirmation and dry-run surfaces in `AppDialogProvider`, `git-preview.ts`, branch push flows, reset/amend/history actions, and integration controls for pre-execution risky command disclosure.
- `AppSidebar`, `RepositoryWelcome`, `AppChrome`, and `GlobalViewType` for the top-level Learning Center route.
- `GitCli` direct argv execution plus existing argument/path validators; Practice Lab adds a stricter exercise allowlist and must not call `run_custom_git_command`.
- Shared `Button`, `Badge`, `Panel`, `Input`, `Textarea`, semantic CSS tokens, `cn`, and the global reduced-motion rule.

## Steps

- [ ] Define stable action IDs and implement the five curriculum modules with prerequisites, qualifying actions, explanation variants, semantic answer forms, XP/level thresholds, concept badges, and practice postconditions.
- [ ] Add versioned preferences/profile models. Persist preferences through existing settings sync; persist progress separately with normalization, backup recovery, atomic writes, reset, and explicit standalone export/import.
- [ ] Add the `learning` global route, AppSidebar entry, app-chrome titles, Settings → Learning preferences, and the full Learning Center with level, XP, badges, lesson states, challenge history, and locked/unlocked Practice Lab.
- [ ] Add backend `GitActionReceipt`/`GitActionPreview` types. Instrument first-release synchronous curriculum actions and reuse exact argv builders for execution and risky previews; extend tracked jobs only where `kind` cannot identify the lesson.
- [ ] Adapt successful receipts and successful terminal jobs into one frontend learning event. Exclude reads, previews, queue/running states, failures, cancellations, and duplicate terminal events; never persist repository-specific payloads.
- [ ] Implement the progression engine: two qualifying successful observations plus one passed challenge per concept, session anti-farming, deterministic XP/levels/badges, prerequisite gates, and idempotent event recording.
- [ ] Implement the coordinator and coach anchors. Show concise post-success explanations for normal actions, inject command sections into existing risky confirmations, expand to level-appropriate internals/recovery, and deep-link tracked jobs to the command log.
- [ ] Implement semantic challenge grading over argv from the shared backend lexer: optional prompt/`git` prefix, safe flag-order equivalence, curated alternate commands, operand validation, canonical feedback, snooze/dismiss, and the selected cadence/safety gates.
- [ ] Build the serialized first-run invitation flow so Learning and CLI offers never overlap; enabling routes to the Learning Center, dismissing persists once, and pause/disable immediately clears active coach/challenge UI.
- [ ] Build Practice Lab after Foundations mastery: create a contained seeded repo, select an exercise, parse/validate against its allowlist, preview predicted effects, execute directly after confirmation, grade Git state, and support reset/delete without touching recents or active repositories.
- [ ] Add explicit profile export/import with schema/version validation, unknown-ID handling, merge-versus-replace confirmation, and no repository/command/user-content data.
- [ ] Add focused behavioral tests, update README/manual QA, remove any throwaway fixtures/scripts, and verify dark/light/responsive/accessibility states.

## Verification

- [ ] Run `bun test tests/learning-mode.test.js` for observable mastery, anti-farming, semantic alternatives, cadence caps, snooze/disable behavior, and profile merge/replace behavior.
- [ ] Run focused Rust tests for learning storage migration/recovery, receipt redaction, quoted argv parsing, global-option/metacharacter/path-escape rejection, exercise allowlists, sandbox containment, and repository-state postconditions.
- [ ] Run `bun run build` and the relevant `cargo test` targets after focused tests pass.
- [ ] Start the Tauri app with seeded QA repositories; use the Tauri driver to verify the first-run invitation never overlaps CLI onboarding, enable Learning Mode, navigate the Learning Center, and capture dark/light screenshots.
- [ ] In a real seeded repository, stage/unstage files and hunks, commit, create/switch branches, stash, fetch/pull/push, merge, and complete one history-editing flow. Verify normal guidance appears only after success with the actual redacted command and the command-log deep link works for jobs.
- [ ] Exercise amend/reset/branch delete/force-with-lease/rebase confirmations and verify the backend-derived command plus risk/recovery explanation appears before execution and matches the command eventually run.
- [ ] Fail and cancel representative operations, replay a duplicate terminal job event, and repeat one action rapidly; verify no false mastery, duplicate XP, badge, or challenge scheduling.
- [ ] Trigger eligible actions across several repositories and sessions; verify one global profile, two-observation-plus-challenge mastery, automatic depth advancement/manual override, 15-minute/two-per-session challenge caps, and persistence after restart.
- [ ] Fail and pass semantic command challenges using optional `git`, reordered safe flags, quoting, and accepted alternate commands; verify canonical feedback and that no answer executes outside Practice Lab.
- [ ] Unlock Practice Lab after Foundations, then try shell operators, `git -c`, `--git-dir`, absolute/parent paths, unrelated subcommands, and malformed quoting; verify all are rejected before execution. Run an allowed exercise, verify its postcondition, reset/delete the sandbox, and confirm the active repository and recents are unchanged.
- [ ] Export the learning profile, reset progress, import with both merge and replace paths, and verify badges/XP return while repository paths, commands, commit messages, and output are absent from the bundle.
- [ ] Pause and disable the mode during a pending coach/challenge; verify all learning UI disappears immediately and normal Git behavior remains unchanged.
- [ ] Keyboard-test coach expansion, challenge input, snooze/dismiss, Learning Center navigation, confirmation focus return, and Practice Lab controls; verify screen-reader labels, focus order/trapping where modal, zoom/responsive layout, and reduced motion.
