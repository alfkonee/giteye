# GitEye Implementation Tracker

Tracks the GitEye feature/fix audit backlog as GitHub issues on `alfkonee/giteye` (#57–#102).

Use the accompanying **`giteye-implementation-tracking`** skill to keep this file in sync: fix labels + issue numbers on creation, flip checkboxes on completion, and update the summary counts. Keep this file's status as the single source of truth for "done".

## How to update

1. Implement an issue and open/merge its PR.
2. Flip its box from `[ ]` to `[x]` and add the merged PR number.
3. Update the **Progress** counts below.
4. Commit the tracking change with the closing PR/git message.

## Progress

- **Total:** 46  **Done:** 11  **Dropped:** 5  **Pending:** 30
- P0 (release blockers): 7/10
- P1 (high value): 3/17
- P2 (differentiators): 1/14 (1 dropped)
- P3 (expansion): 0/5 (4 dropped)

**Legend:** `[ ]` = open · `[x]` = done · `[-]` = closed as out of scope. `PR` reference = merged PR that closed it.

Last reconciled against GitHub: **2026-08-20** (audit + implementation wave, PR [#112](https://github.com/alfkonee/giteye/pull/112)).

---

## P0 — Security, privacy & release reliability

- [x] **A01** `enhancement` [#57](https://github.com/alfkonee/giteye/issues/57) Store AI API keys in the OS keychain instead of ai_config.json — closed by PR [#105](https://github.com/alfkonee/giteye/pull/105)
- [x] **A02** `bug` [#58](https://github.com/alfkonee/giteye/issues/58) Add a restrictive Content Security Policy and remove risky global Tauri exposure — closed by PR [#107](https://github.com/alfkonee/giteye/pull/107)
- [x] **A03** `bug` [#59](https://github.com/alfkonee/giteye/issues/59) Make application tracing opt-in, bounded by retention, and disabled by default in release — landed in `aa6d44e` via PR [#105](https://github.com/alfkonee/giteye/pull/105); verified and closed during the 2026-08-20 audit
- [ ] **A04** `enhancement` [#60](https://github.com/alfkonee/giteye/issues/60) Add signed in-app auto-update with channels, progress, and rollback guidance
- [ ] **A05** `bug` [#61](https://github.com/alfkonee/giteye/issues/61) Introduce one typed error envelope and a single frontend error renderer — *partial: backend unified on `AppError`; envelope still a flat string, no single frontend renderer*
- [x] **A06** `bug` [#62](https://github.com/alfkonee/giteye/issues/62) Bound and stream diff payloads; detect oversized text and binary files before loading — closed by PR [#112](https://github.com/alfkonee/giteye/pull/112)
- [x] **A07** `bug` [#63](https://github.com/alfkonee/giteye/issues/63) Replace the fixed 3s gh timeout with cancellable, per-operation timeouts and retries — closed by PR [#112](https://github.com/alfkonee/giteye/pull/112)
- [ ] **A08** `bug` [#64](https://github.com/alfkonee/giteye/issues/64) Add frontend unit/component tests and live Tauri workflow tests to CI — *blocks the automated a11y check in A26*
- [x] **A09** `bug` [#65](https://github.com/alfkonee/giteye/issues/65) Add graceful shutdown and interrupted-job recovery on startup — closed by PR [#104](https://github.com/alfkonee/giteye/pull/104)
- [x] **A10** `bug` [#66](https://github.com/alfkonee/giteye/issues/66) Use the upstream-setup workflow from every Push/Pull entry point — closed by PR [#103](https://github.com/alfkonee/giteye/pull/103)

## P1 — Daily usability & polish

- [ ] **A11** `bug` [#67](https://github.com/alfkonee/giteye/issues/67) Lazy-load repository views, Review Studio, diagnostics, settings, and syntax grammars — *no `React.lazy`/`Suspense` anywhere; syntax highlighting is CSS-only so there is no grammar to split*
- [ ] **A12** `bug` [#68](https://github.com/alfkonee/giteye/issues/68) Replace window.prompt/confirm/alert with shared action dialogs — *116 native callsites across 22 files; no shared Dialog primitive in `ui/`*
- [x] **A13** `bug` [#69](https://github.com/alfkonee/giteye/issues/69) Render provider comments as sanitized GitHub-flavored Markdown in Review Studio — landed in `183474b` (`src/components/ui/Markdown.tsx`) via PR [#110](https://github.com/alfkonee/giteye/pull/110); verified and closed during the 2026-08-20 audit
- [ ] **A14** `enhancement` [#70](https://github.com/alfkonee/giteye/issues/70) Add Publish branch / Create pull request from Toolbar, Branches, and History — *no create-PR path exists; only upstream-aware push*
- [ ] **A15** `enhancement` [#71](https://github.com/alfkonee/giteye/issues/71) Support review threads: reply, edit, delete, resolve, unresolve, and suggested changes — *only top-level review submit + new line comments exist*
- [ ] **A16** `enhancement` [#72](https://github.com/alfkonee/giteye/issues/72) Add rerun/cancel checks, auto-merge, merge queue, and required-check explanations — *checks are read-only; merge offers `--admin` bypass only*
- [ ] **A17** `enhancement` [#73](https://github.com/alfkonee/giteye/issues/73) Add commit/tag signing configuration and signing controls — *no GPG/SSH signing anywhere; verification exists only under Diagnostics*
- [ ] **A18** `enhancement` [#74](https://github.com/alfkonee/giteye/issues/74) Add a branch cleanup dashboard with safe batch operations — *no merged/stale/gone classification, no multi-select*
- [ ] **A19** `enhancement` [#75](https://github.com/alfkonee/giteye/issues/75) Add line-level and arbitrary-selection staging — *hunk granularity shipped in PR [#111](https://github.com/alfkonee/giteye/pull/111); sub-hunk patch synthesis still absent*
- [ ] **A20** `enhancement` [#76](https://github.com/alfkonee/giteye/issues/76) Add binary and rich file previews to the diff viewer — *binary state is a text placeholder*
- [x] **A21** `enhancement` [#77](https://github.com/alfkonee/giteye/issues/77) Build a unified Undo and Recovery Center — closed by PR [#112](https://github.com/alfkonee/giteye/pull/112) (Recovery Center dialog: reflog undo + lost commits)
- [ ] **A22** `bug` [#78](https://github.com/alfkonee/giteye/issues/78) Split the long Settings page into searchable categories — *`SettingsPlaceholder.tsx` is 664 lines, 8 inline categories, no search, no dirty state*
- [ ] **A23** `enhancement` [#79](https://github.com/alfkonee/giteye/issues/79) Add system theme, density, font, diff typography, and color-blind palettes — *0 of 5 knobs exposed; density/size tokens exist in `design-system.ts` + `index.css` but are unwired*
- [x] **A24** `enhancement` [#80](https://github.com/alfkonee/giteye/issues/80) Add discoverable and customizable keyboard shortcuts — closed by PR [#112](https://github.com/alfkonee/giteye/pull/112) (central registry + ShortcutsDialog remap + persistence)
- [ ] **A25** `enhancement` [#81](https://github.com/alfkonee/giteye/issues/81) Add native desktop notifications and actionable notification preferences — *no `tauri-plugin-notification`; `notifyInfo` is an in-app toast*
- [ ] **A26** `bug` [#82](https://github.com/alfkonee/giteye/issues/82) Complete accessibility pass: keyboard, screen-reader, contrast, zoom, reduced-motion — *partial: aria/focus-visible/reduced-motion primitives broadly present but unvalidated; blocked by A08 (no test stage) and A12 (native dialogs)*
- [ ] **A27** `enhancement` [#83](https://github.com/alfkonee/giteye/issues/83) Add Create diagnostic bundle with preview and redaction — *redaction primitives exist (`redact_git_job_args`, `redactTraceText`); no bundle, no preview*

## P2 — Competitive differentiators

- [-] **A28** `enhancement` [#84](https://github.com/alfkonee/giteye/issues/84) Add GitLab first-class support, then Bitbucket — **closed 2026-08-20 as out of scope:** no provider abstraction exists, every collaboration call shells out to `gh`, and P0 blockers are still open. Reopen as (1) provider abstraction, then (2) per-provider implementations.
- [ ] **A29** `enhancement` [#85](https://github.com/alfkonee/giteye/issues/85) Add real provider account management and multiple-account selection — *rescoped to GitHub multi-account (personal + enterprise host) now that A28 is dropped*
- [ ] **A30** `enhancement` [#86](https://github.com/alfkonee/giteye/issues/86) Turn Repo Hub Team Workspaces into real repository groups — *Team Workspaces and Activity Feed are static placeholder cards; scope cut to named groups + pinned repos + persistence + export/import*
- [ ] **A31** `enhancement` [#87](https://github.com/alfkonee/giteye/issues/87) Add linked issues, assignments, milestones, and issue-to-branch workflows — *rescoped to issue→branch/worktree; milestone/assignment management and linked-issue-beside-checks to be split out*
- [ ] **A32** `enhancement` [#88](https://github.com/alfkonee/giteye/issues/88) Add patch import/export, clipboard patches, and email-format patches — *partial: `apply_patch` + dry-run + path validation exist; no format-patch/am/export or `.rej` reporting*
- [ ] **A33** `enhancement` [#89](https://github.com/alfkonee/giteye/issues/89) Add partial clone and sparse-checkout management — *clone is a bare `git clone`; no sparse-checkout anywhere*
- [ ] **A34** `enhancement` [#90](https://github.com/alfkonee/giteye/issues/90) Add local OpenAI-compatible/Ollama endpoints and an AI request preview — *4 hardcoded cloud providers, no base-URL override*
- [ ] **A35** `enhancement` [#91](https://github.com/alfkonee/giteye/issues/91) Add opt-in AI branch summaries, change explanations, review assistance, and commit splitting — *existing AI surface is exactly 2 features: commit-message suggestion + conflict resolution*
- [ ] **A36** `enhancement` [#92](https://github.com/alfkonee/giteye/issues/92) Add a visual drag-and-drop interactive rebase planner with undo/redo — *partial: todo editing + draft-first apply exist; no DnD, no undo/redo, no graph planner*
- [ ] **A37** `enhancement` [#93](https://github.com/alfkonee/giteye/issues/93) Add a repository health dashboard — *fsck/gc/maintenance live under Diagnostics; no unified dashboard, no stale-branch detection*
- [ ] **A38** `enhancement` [#94](https://github.com/alfkonee/giteye/issues/94) Add GitHub release and changelog management — *git tags only; split into release lifecycle + changelog generation*
- [ ] **A39** `enhancement` [#95](https://github.com/alfkonee/giteye/issues/95) Add an optional embedded terminal tied to the active repository/worktree — *no pty crate, no xterm; `CustomCommandView` is one-shot*
- [x] **A40** `enhancement` [#96](https://github.com/alfkonee/giteye/issues/96) Integrate file history and blame into the diff/file details pane — closed by PR [#112](https://github.com/alfkonee/giteye/pull/112) (diff/blame/history toggle + BlameTable/FileHistoryList)
- [ ] **A41** `enhancement` [#97](https://github.com/alfkonee/giteye/issues/97) Add commit templates, trailers, co-authors, and recent-message history — *CommitBox has sign-off/skip-hooks/allow-empty + AI suggestion only*

## P3 — Longer-term expansion

- [-] **A42** `enhancement` [#98](https://github.com/alfkonee/giteye/issues/98) Add a first-run tour and task-based empty states — **closed 2026-08-20:** empty states shipped (`common/EmptyState.tsx` used across all views) plus the toolchain first-run gate; a scripted tour is speculative while the shell is still being redesigned.
- [-] **A43** `enhancement` [#99](https://github.com/alfkonee/giteye/issues/99) Add an internationalization foundation — **closed 2026-08-20 as out of scope:** ~750+ JSX text nodes hardcoded, no i18n library, no second-locale demand; extraction would freeze copy across an actively-changing UI.
- [ ] **A44** `enhancement` [#100](https://github.com/alfkonee/giteye/issues/100) Add configurable external editor, diff, merge, and terminal integrations — *only the generic opener plugin exists; real advanced-user value and a cheaper answer than A39*
- [-] **A45** `enhancement` [#101](https://github.com/alfkonee/giteye/issues/101) Add safe custom actions rather than a broad plugin API initially — **closed 2026-08-20 as speculative:** security-sensitive subsystem with no demand; `CustomCommandView` plus A44 cover the real need.
- [-] **A46** `enhancement` [#102](https://github.com/alfkonee/giteye/issues/102) Add stable command/deep-link URLs — **closed 2026-08-20 as premature:** navigation is zustand state with no router, no URL scheme or deep-link plugin registered, and no external link producer exists. The useful half (stable palette command IDs) already shipped.

## Audit notes (2026-08-20)

- **Label hygiene, not yet applied:** #64 (missing tests), #67 (code splitting), #68 (dialog migration) and #78 (settings split) are labelled `bug` but are enhancements/tech debt. #62 and #63 are genuine defects and should keep `bug`.
- **Recommended next order:** A06 (#62 unbounded diffs — the remaining hang risk), A07 (#63 timeouts/retries), A08 (#64 test harness, which unblocks A26), then A12 (#68) → A26 (#82).
- **Cheap wins shipped:** A21 (#77), A40 (#96), and A24 (#80) landed in PR [#112](https://github.com/alfkonee/giteye/pull/112).
- **Dead UI to fix or remove:** Team Workspaces + Activity Feed placeholder cards (`RepositoryWelcome.tsx`), and the disabled `Add Account` button. The dead ⌘N/⌘O/⌘/ footer hints were replaced with real bindings in A24.
