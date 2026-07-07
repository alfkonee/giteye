# Remaining Gaps — Full Implementation Plan

## Context

> Generated 2026-07-06 from comprehensive code audit. Cross-references `core-git-ux-polish.md`,
> `git-interactions-data-views-audit.md`, README, and `docs/architecture/library-decisions.md`.

**Corrections vs prior audit reports:**
- Toolbar Fetch/Pull/Push/Sync/Refresh buttons **are wired** (`Toolbar.tsx:494-615`) ✅
- Background job runner **exists** (`src-tauri/src/git/job_runner.rs`) ✅
- Multi-repo sessions (`openRepoPaths`, `repoSessions`) **are implemented** (`app-store.ts:56-274`) ✅
- Grouped view registry **exists** (`src/lib/view-registry.tsx`), used by Sidebar ✅
- `@pierre/diffs` **is wired** as primary renderer via `PierreDiffViewer.tsx` ✅
- `CommandLogDrawer`, `NoticeCenter`, toolbar repo/branch switchers, command palette — all real ✅

---

## Tranche 1 — Repo Hub Polish (Low Risk, High UX Impact)

### 1.1 — Wire Sidebar Placeholder Buttons

**Files:** `src/components/repository/RepositoryWelcome.tsx`

Three sidebar buttons render as static, non-functional elements. Replace each with actionable behavior:

| Button | Current state | Target |
|--------|---------------|--------|
| **Search** (⌘K) | Static, no `onClick` | Open a searchable repo filter input or focus existing search field |
| **Notifications** | Static, no `onClick` | Open notice center / operation transcript even when no repo is open |
| **Add Account** | Disabled, tooltip only | Keep disabled (Phase 2+), add descriptive tooltip about roadmap |

**Verification:** Click each button — confirm it does something (navigates, opens panel, or shows contextual tooltip).

---

### 1.2 — Full Recent Repository List

**Files:** `src/components/repository/RepositoryWelcome.tsx`

Current: recent repos capped at 5 entries in a fixed-height non-scrollable list. Favorites list renders from `gitQueries.favoriteRepositories()` (real backend query). Verify favorites list works end-to-end, then:

- [ ] Add scrollable overflow or "Show All" expansion for recent repositories
- [ ] Show total count and "View All" toggle
- [ ] Add per-repo action menu: Open, Star/Unstar, Remove from Recents, Copy Path
- [ ] Add empty state when no recents exist
- [ ] Verify favorites star toggle persists correctly

**Verification:** Open several repos, close them — all appear in Recent Repositories with scrolling. Favorites star/unstar works. Action menu functions.

---

### 1.3 — Separate Home Button from Repo Switcher

**Files:** `src/components/layout/Toolbar.tsx`

Current: the repo-name icon calls `setActiveRepoPath(null)`, navigating home. This conflates Home and repo switching.

- [ ] Add a dedicated **Home** icon button (leftmost in toolbar) that navigates to Repo Hub
- [ ] Repurpose the repo-name button into a searchable dropdown showing recent + favorite repos (`repoSwitchItems` already computed at line 129 — wire it to a dropdown instead of navigating home)

**Verification:** Home button navigates to Repo Hub; repo-name opens a searchable dropdown.

---

### 1.4 — Search Repos Input on Hub

**Files:** `src/components/repository/RepositoryWelcome.tsx`

The top-right search input (line 174) has no `onChange` handler.

- [ ] Add client-side filter on `recentRepos` and `favoriteRepos` by name/path as user types
- [ ] Update displayed lists reactively

**Verification:** Typing in search field filters displayed repo cards.

---

## Tranche 2 — Branch & PR View Enhancements (Medium Risk)

### 2.1 — Remote Branch Checkout/Track Actions

**Files:** `src/components/branches/BranchList.tsx`, `src/components/layout/Sidebar.tsx`

Remote branches are listed but have no inline checkout or create-tracking-branch action. Context menu options only appear on right-click.

- [ ] Add "Checkout" action on remote branch rows in `BranchList` triggering `checkoutBranch` with tracking
- [ ] Add "Track" button creating a local tracking branch from the remote branch
- [ ] Show tracking status indicator on remote branches already tracked locally

**Verification:** Clicking a remote branch checks it out locally; tracking creation works; indicators show correctly.

---

### 2.2 — PR Selection in Review Studio

**Files:** `src/components/review-studio/DiffReviewStudio.tsx`

Auto-selects first PR from `githubOverview.pullRequests`. When multiple PRs exist, user can't pick.

- [ ] Add PR selector dropdown or sidebar list above review content
- [ ] Default-select first PR, allow switching
- [ ] Show PR number, title, author, and open/closed/draft state

**Verification:** Multi-PR repo shows all in selector; switching reloads correct PR diff.

---

### 2.3 — Collaboration Provider Empty States

**Files:** `src/components/collaboration/CollaborationConnect.tsx`, `src/components/repository/RepositoryWelcome.tsx`

When GitHub auth is unavailable, shows "No provider connected." Could be more actionable.

- [ ] Add "Connect GitHub" button with tooltip explaining `gh` CLI requirement
- [ ] Show help/diagnostic message: `gh auth login`
- [ ] In Repo Hub Accounts, replace disabled "Add Account" with discoverable status

**Verification:** `gh` installed but not logged in → actionable guidance shown; no `gh` → clear explanation.

---

## Tranche 3 — Feature Completeness (Medium-High Risk)

### 3.1 — AI-Assisted Conflict Resolution

**Files:** `src/components/rebase/RebaseConflictResolver.tsx`, new backend command

The "AI Assistant" panel explicitly states no assistant is wired.

- [ ] **Backend:** `resolve_conflict_with_ai` Tauri command — accepts `ours, theirs, base: String`, returns resolved result via LLM API (OpenAI, Anthropic, or local model)
- [ ] **Config:** AI provider settings (API key, endpoint, model) in Settings
- [ ] **Frontend:** Wire "Generate resolution" button to call command, display result, add "Apply resolution" button
- [ ] Loading, error, and rate-limit states
- [ ] "Accept suggestion" / "Edit suggestion" / "Reject" workflow

**Verification:** During active rebase with conflicts, "Generate resolution" produces valid merged result.

---

### 3.2 — AI-Assisted Commit Messages

**Files:** `src/components/working-tree/CommitBox.tsx`, new backend command

New feature.

- [ ] Add "Suggest message" sparkle button in CommitBox
- [ ] **Backend:** `suggest_commit_message` — takes staged files + diffs, returns suggested commit message
- [ ] Use same AI provider config from 3.1
- [ ] Display generated message, allow editing before commit

**Verification:** With staged changes, "Suggest message" populates commit input with relevant message.

---

### 3.3 — `cmdk` Command Palette

**Files:** `package.json`, `src/components/layout/Toolbar.tsx`, new `src/components/common/CommandPalette.tsx`

Replace current custom command palette with the `cmdk` library per original plan.

- [ ] Install `cmdk` package
- [ ] Create `CommandPalette` component wrapping `<Command>`
- [ ] Migrate 19 command items to cmdk format
- [ ] Keep ⌘K shortcut binding, maintain existing behaviors
- [ ] Add file/branch search within same palette
- [ ] Remove old custom search input and dropdown

**Verification:** ⌘K opens cmdk palette; all 19 commands work; type-ahead filtering works; keyboard navigation works.

---

### 3.4 — Credential Secrets Management

**Files:** `src-tauri/src/commands/config.rs`, `src/components/settings/SettingsPlaceholder.tsx`

GitEye reads `credential.helper` but doesn't display, store, or prompt for secrets.

- [ ] Add "Credentials" section in Settings showing configured helpers with types
- [ ] Add "Clear cached credentials" button (git credential reject or helper-specific)
- [ ] Add "Test authentication" — silent `git ls-remote` to verify creds
- [ ] **Explicitly do NOT** store or display raw secrets

**Verification:** Credential section shows active helper; Test Auth reports pass/fail; Clear purges cache.

---

### 3.5 — Settings Export/Import

**Files:** `src-tauri/src/storage.rs`, new `src-tauri/src/commands/settings_io.rs`, Settings

No mechanism to export/import app settings.

- [ ] **Backend:** `export_settings` — serialize theme, diff mode, identity, credential config, SSH key list (not private keys), recents, favorites to JSON
- [ ] **Backend:** `import_settings` — read JSON, merge/restore settings
- [ ] **Frontend:** "Export Settings" / "Import Settings" buttons in Settings
- [ ] Use `@tauri-apps/plugin-dialog` for file dialogs
- [ ] Validate imported JSON structure before applying

**Verification:** Export produces valid JSON; import on fresh install restores theme, identity, recents, favorites.

---

### 3.6 — Custom Git Command Runner

**Files:** new `src/components/repository/CustomCommandView.tsx`, new backend command

Limited to GitEye-triggered jobs only. Add a free-form command interface.

- [ ] Add "Custom Command" view (or tab in diagnostics)
- [ ] Text input for arbitrary git commands (minus the `git` prefix)
- [ ] Execute via `GitCli` with same safety guardrails
- [ ] Show output in terminal-style pane
- [ ] Job-runner integration for long-running commands
- [ ] Confirmation gate for destructive commands (push --force, hard reset)

**Verification:** Enter `git log --oneline -5` → output rendered in terminal pane; destructive commands prompt confirmation.

---

## Tranche 4 — Phase 2 Platform Expansions (High Risk, Large Scope)

Each of these should become its own detailed plan when work begins.

### 4.1 — GitLab Integration

- Mirror `github_service.rs` pattern for GitLab (`src-tauri/src/git/gitlab_service.rs`)
- Call GitLab API via `glab` CLI or HTTP
- Frontend: MR review, CI status, labels (`src/components/collaboration/` variants)
- Update `CollaborationConnect` to detect GitLab remotes
- Register new Tauri commands

### 4.2 — Bitbucket Integration

- Same pattern as GitLab for Bitbucket Cloud/Server
- Add `bitbucket_service.rs` backend
- Frontend Bitbucket PR review components

### 4.3 — `libgit2` (git2-rs) Performance Acceleration

- Add `git2` crate to Cargo.toml
- Implement `GitNative` service alongside `GitCli` for perf-critical paths:
  - Repository status (`git2::Statuses`) — avoid process spawn for polling
  - Branch listing, small-range commit log
- Keep `GitCli` as fallback; detect libgit2 at startup
- Measure and report perf improvements

### 4.4 — Async Rust (tokio)

- Add `tokio` (full features)
- Convert network-dependent commands to async (GitHub, future GitLab/Bitbucket)
- Convert file watcher to async I/O
- Maintain backward compat — sync commands stay sync

### 4.5 — SQLite Persistence

- Add `rusqlite` crate
- Replace JSON files with SQLite DB:
  - `repos(id, path, name, last_opened_at, is_favorite)`
  - `settings(key, value)`
  - `job_history(id, repo_path, command, status, created_at)`
- Add migration support
- Keep JSON fallback during transition

---

## Verification Summary

| Tranche | Items | Risk | Files Touched (est.) |
|---------|-------|------|---------------------|
| 1: Repo Hub Polish | 4 | Low | 2-3 |
| 2: Branch & PR Views | 3 | Medium | 4-5 |
| 3: Feature Completeness | 6 | Medium-High | 10-15 |
| 4: Phase 2 Expansions | 5 | High | per-project |

**Per-tranche verification gates:**
- `bunx tsc` — zero errors
- `cargo check && cargo test` in `src-tauri` — all pass
- `cargo fmt --check` — clean
- Manual smoke test of each new/changed feature

**Estimated total: 18 concrete gap items across 4 tranches.**
