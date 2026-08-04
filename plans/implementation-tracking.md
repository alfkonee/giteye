# GitEye Implementation Tracker

Tracks the GitEye feature/fix audit backlog as GitHub issues on `alfkonee/giteye` (#57–#102).

Use the accompanying **`giteye-implementation-tracking`** skill to keep this file in sync: fix labels + issue numbers on creation, flip checkboxes on completion, and update the summary counts. Keep this file's status as the single source of truth for "done".

## How to update

1. Implement an issue and open/merge its PR.
2. Flip its box from `[ ]` to `[x]` and add the merged PR number.
3. Update the **Progress** counts below.
4. Commit the tracking change with the closing PR/git message.

## Progress

- **Total:** 46  **Done:** 1  **Pending:** 45
- P0 (release blockers): 1/10
- P1 (high value): 0/17
- P2 (differentiators): 0/14
- P3 (expansion): 0/5

**Legend:** `[ ]` = open · `[x]` = done. `PR` column = merged PR that closed it.

---

## P0 — Security, privacy & release reliability

- [ ] **A01** `enhancement` [#57](https://github.com/alfkonee/giteye/issues/57) Store AI API keys in the OS keychain instead of ai_config.json
- [ ] **A02** `bug` [#58](https://github.com/alfkonee/giteye/issues/58) Add a restrictive Content Security Policy and remove risky global Tauri exposure
- [ ] **A03** `bug` [#59](https://github.com/alfkonee/giteye/issues/59) Make application tracing opt-in, bounded by retention, and disabled by default in release
- [ ] **A04** `enhancement` [#60](https://github.com/alfkonee/giteye/issues/60) Add signed in-app auto-update with channels, progress, and rollback guidance
- [ ] **A05** `bug` [#61](https://github.com/alfkonee/giteye/issues/61) Introduce one typed error envelope and a single frontend error renderer
- [ ] **A06** `bug` [#62](https://github.com/alfkonee/giteye/issues/62) Bound and stream diff payloads; detect oversized text and binary files before loading
- [ ] **A07** `bug` [#63](https://github.com/alfkonee/giteye/issues/63) Replace the fixed 3s gh timeout with cancellable, per-operation timeouts and retries
- [ ] **A08** `bug` [#64](https://github.com/alfkonee/giteye/issues/64) Add frontend unit/component tests and live Tauri workflow tests to CI
- [ ] **A09** `bug` [#65](https://github.com/alfkonee/giteye/issues/65) Add graceful shutdown and interrupted-job recovery on startup
- [x] **A10** `bug` [#66](https://github.com/alfkonee/giteye/issues/66) Use the upstream-setup workflow from every Push/Pull entry point — closed by PR

## P1 — Daily usability & polish

- [ ] **A11** `bug` [#67](https://github.com/alfkonee/giteye/issues/67) Lazy-load repository views, Review Studio, diagnostics, settings, and syntax grammars
- [ ] **A12** `bug` [#68](https://github.com/alfkonee/giteye/issues/68) Replace window.prompt/confirm/alert with shared action dialogs
- [ ] **A13** `bug` [#69](https://github.com/alfkonee/giteye/issues/69) Render provider comments as sanitized GitHub-flavored Markdown in Review Studio
- [ ] **A14** `enhancement` [#70](https://github.com/alfkonee/giteye/issues/70) Add Publish branch / Create pull request from Toolbar, Branches, and History
- [ ] **A15** `enhancement` [#71](https://github.com/alfkonee/giteye/issues/71) Support review threads: reply, edit, delete, resolve, unresolve, and suggested changes
- [ ] **A16** `enhancement` [#72](https://github.com/alfkonee/giteye/issues/72) Add rerun/cancel checks, auto-merge, merge queue, and required-check explanations
- [ ] **A17** `enhancement` [#73](https://github.com/alfkonee/giteye/issues/73) Add commit/tag signing configuration and signing controls
- [ ] **A18** `enhancement` [#74](https://github.com/alfkonee/giteye/issues/74) Add a branch cleanup dashboard with safe batch operations
- [ ] **A19** `enhancement` [#75](https://github.com/alfkonee/giteye/issues/75) Add line-level and arbitrary-selection staging
- [ ] **A20** `enhancement` [#76](https://github.com/alfkonee/giteye/issues/76) Add binary and rich file previews to the diff viewer
- [ ] **A21** `enhancement` [#77](https://github.com/alfkonee/giteye/issues/77) Build a unified Undo and Recovery Center
- [ ] **A22** `bug` [#78](https://github.com/alfkonee/giteye/issues/78) Split the long Settings page into searchable categories
- [ ] **A23** `enhancement` [#79](https://github.com/alfkonee/giteye/issues/79) Add system theme, density, font, diff typography, and color-blind palettes
- [ ] **A24** `enhancement` [#80](https://github.com/alfkonee/giteye/issues/80) Add discoverable and customizable keyboard shortcuts
- [ ] **A25** `enhancement` [#81](https://github.com/alfkonee/giteye/issues/81) Add native desktop notifications and actionable notification preferences
- [ ] **A26** `bug` [#82](https://github.com/alfkonee/giteye/issues/82) Complete accessibility pass: keyboard, screen-reader, contrast, zoom, reduced-motion
- [ ] **A27** `enhancement` [#83](https://github.com/alfkonee/giteye/issues/83) Add Create diagnostic bundle with preview and redaction

## P2 — Competitive differentiators

- [ ] **A28** `enhancement` [#84](https://github.com/alfkonee/giteye/issues/84) Add GitLab first-class support, then Bitbucket
- [ ] **A29** `enhancement` [#85](https://github.com/alfkonee/giteye/issues/85) Add real provider account management and multiple-account selection
- [ ] **A30** `enhancement` [#86](https://github.com/alfkonee/giteye/issues/86) Turn Repo Hub Team Workspaces into real repository groups
- [ ] **A31** `enhancement` [#87](https://github.com/alfkonee/giteye/issues/87) Add linked issues, assignments, milestones, and issue-to-branch workflows
- [ ] **A32** `enhancement` [#88](https://github.com/alfkonee/giteye/issues/88) Add patch import/export, clipboard patches, and email-format patches
- [ ] **A33** `enhancement` [#89](https://github.com/alfkonee/giteye/issues/89) Add partial clone and sparse-checkout management
- [ ] **A34** `enhancement` [#90](https://github.com/alfkonee/giteye/issues/90) Add local OpenAI-compatible/Ollama endpoints and an AI request preview
- [ ] **A35** `enhancement` [#91](https://github.com/alfkonee/giteye/issues/91) Add opt-in AI branch summaries, change explanations, review assistance, and commit splitting
- [ ] **A36** `enhancement` [#92](https://github.com/alfkonee/giteye/issues/92) Add a visual drag-and-drop interactive rebase planner with undo/redo
- [ ] **A37** `enhancement` [#93](https://github.com/alfkonee/giteye/issues/93) Add a repository health dashboard
- [ ] **A38** `enhancement` [#94](https://github.com/alfkonee/giteye/issues/94) Add GitHub release and changelog management
- [ ] **A39** `enhancement` [#95](https://github.com/alfkonee/giteye/issues/95) Add an optional embedded terminal tied to the active repository/worktree
- [ ] **A40** `enhancement` [#96](https://github.com/alfkonee/giteye/issues/96) Integrate file history and blame into the diff/file details pane
- [ ] **A41** `enhancement` [#97](https://github.com/alfkonee/giteye/issues/97) Add commit templates, trailers, co-authors, and recent-message history

## P3 — Longer-term expansion

- [ ] **A42** `enhancement` [#98](https://github.com/alfkonee/giteye/issues/98) Add a first-run tour and task-based empty states
- [ ] **A43** `enhancement` [#99](https://github.com/alfkonee/giteye/issues/99) Add an internationalization foundation
- [ ] **A44** `enhancement` [#100](https://github.com/alfkonee/giteye/issues/100) Add configurable external editor, diff, merge, and terminal integrations
- [ ] **A45** `enhancement` [#101](https://github.com/alfkonee/giteye/issues/101) Add safe custom actions rather than a broad plugin API initially
- [ ] **A46** `enhancement` [#102](https://github.com/alfkonee/giteye/issues/102) Add stable command/deep-link URLs
