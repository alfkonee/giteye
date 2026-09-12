# Feature Gap Roadmap Plan

## Context

Full features audit of GitEye (Tauri 2 + React 19 + Rust, 191 backend commands, 16 routed views) found an exceptionally complete backend with a largely wired frontend. Gaps are concentrated in diff richness, signing, provider depth, and platform features. Cross-referenced against the project's own backlog (`plans/implementation-tracking.md`, reconciled 2026-08-20) — most gaps are already tracked; this plan consolidates them into a ranked implementation roadmap.

Current state signals:

- Routing centralized in `src/lib/view-registry.tsx`; state in `src/stores/app-store.ts` and `src/lib/git-data.ts`.
- Working tree supports **hunk-level** stage/unstage/discard (`diff-viewer/DiffViewer.tsx` wired via `PanelLayout.tsx:43-92`); line-level selection is absent (#75).
- Binary diffs render as a text placeholder (#76).
- Signature *verification* exists under Diagnostics; signing *configuration* does not (#73).
- Conflict resolution is side-picking + AI (`rebase/RebaseConflictResolver.tsx`); no inline editable 3-way text editor.
- AI providers hardcoded to 4 cloud vendors, no base-URL override / local models (#90/#91).
- Only 2 keyboard shortcuts (Mod+K palette, Mod+` log); ~116 native `window.prompt/confirm/alert` callsites (#68).
- Tests: ~29 pure Node unit tests only; no component/E2E/integration coverage (A08). `src/features/*` directories are empty scaffolding.

> [!IMPORTANT]
> User direction: rank by user value; each milestone must be shippable independently.

## Approach

Ranked roadmap:

1. **Milestone 1 — Diff richness** *(highest daily-use value)*
   - Line-level staging: sub-hunk selection in `DiffViewer.tsx`, extending the existing hunk pipeline (`git/patch_service.rs`) to synthesize partial-hunk patches from selected line ranges.
   - Binary/image diff rendering: side-by-side old/new image view for common formats (png/jpg/gif/webp), byte-size delta for other binaries; new command returning file blobs via asset protocol scope.
2. **Milestone 2 — Signing**
   - Configure commit/tag signing (GPG or SSH): per-repo and global `user.signingkey`/`gpg.format`/`commit.gpgsign` UI alongside existing identity settings (`commands/config.rs`, `config_service.rs`); surface verification badges already computed by `verify_git_signature` in history views.
3. **Milestone 3 — Merge conflict editor**
   - Inline editable 3-way text editor (ours/base/theirs) in `RebaseConflictResolver.tsx`, reusing existing `get_conflict_content`/`mark_file_resolved` commands; AI resolve remains as a secondary action.
4. **Milestone 4 — GitHub depth**
   - Review thread reply/resolve (#71) via existing `gh api` plumbing in `github_service.rs`.
   - CI write actions: rerun/cancel checks, enable auto-merge (#72).
   - Issue browsing (#87) reusing the overview cache and timeline endpoint pattern (`github_service.rs:1134`).
5. **Milestone 5 — Platform features**
   - Auto-update via `tauri-plugin-updater` (#60), native notifications via `tauri-plugin-notification` for long-running job completion (#81), crash reporting hook.
6. **Milestone 6 — AI flexibility**
   - Custom OpenAI-compatible base URL + local model support (Ollama/LM Studio) in `ai_service.rs` and `settings/AiModelCombobox.tsx` (#90/#91).
7. **Milestone 7 — UX polish tranche**
   - Keyboard shortcut sheet + expanded default bindings (extend `lib/shortcuts.ts`); drag-and-drop staging onto the commit box; drag-reorder interactive-rebase todo; format-patch/am export-import (#88/A32); replace remaining native `prompt/confirm/alert` callsites with dialogs (#68); i18n scaffolding.

## Files to modify

| Milestone | Files |
|---|---|
| 1 | `src/components/diff-viewer/DiffViewer.tsx`, `src-tauri/src/git/patch_service.rs`, `src-tauri/src/commands/patch.rs`, `src-tauri/src/lib.rs`, `src/types/git.ts` |
| 2 | `src-tauri/src/git/config_service.rs`, `src-tauri/src/commands/config.rs`, `src/components/settings/SettingsPlaceholder.tsx`, `src/components/commit-history/*` |
| 3 | `src/components/rebase/RebaseConflictResolver.tsx`, `src/lib/git-data.ts` |
| 4 | `src-tauri/src/git/github_service.rs`, `src-tauri/src/commands/github.rs`, `src/components/review-studio/DiffReviewStudio.tsx`, `src/components/ci/*`, `view-registry.tsx` |
| 5 | `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `capabilities/*.json`, job completion paths in `job_runner.rs` consumers |
| 6 | `src-tauri/src/git/ai_service.rs`, `src/components/settings/*` |
| 7 | `src/lib/shortcuts.ts`, `src/components/working-tree/FileStatusList.tsx`, `src/components/common/*`, global sweep of native dialog callsites |

## Reuse

- Hunk staging pipeline (`patch_service.rs`) extends naturally to line ranges — no new apply mechanism needed.
- Existing dry-run preview pattern applies to any new destructive action.
- `gh api` runner with timeout/output-bounding/backoff in `github_service.rs` covers all Milestone 4 endpoints.
- Keychain storage pattern (`keychain.rs`) reusable if signing key passphrases need storage.
- Command/job runner gives streaming logs for long operations (updater downloads, patch imports).

## Verification

- Milestone 1: stage individual lines → `git diff --cached` shows exactly the selection; image diff renders for png/jpg fixtures; add component tests (first frontend tests, closing part of A08).
- Milestone 2: sign a test commit with a local GPG key; history shows verified badge without running Diagnostics manually.
- Milestone 3: create a conflicted fixture repo; edit middle-pane resolution; continue rebase succeeds.
- Milestone 4: post a reply on a review thread fixture PR and resolve it; rerun a failed check.
- Milestone 5: updater endpooint smoke-tested against a staged release; notification fires after a >5s push job.
- Milestones 6–7: point AI config at a local Ollama instance and generate a commit message; every replaced native dialog renders the in-app equivalent.
