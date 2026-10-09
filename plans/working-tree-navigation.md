# Working tree navigation: diverged jumps, single-history focus, working-tree columns

## Context

Three navigational improvements for GitEye's history/working-tree surfaces:

1. **Diverged-branch navigation** — when a tracking branch pair has diverged, jump inside the history tree to the diverged side (upstream tip or local tip), and to the divergence point.
2. **Single-history view** — for a selected tag/branch/commit: fade the other history lanes in the main graph so the selected ref's lane stands out, plus a "single history" popup from context menus showing only that ref's history.
3. **Working-tree columns** — selectable columns in the working-tree file lists while keeping the core lanes (Staged / Unstaged / Ignored groups always visible).

Confirmed scope with user: jump controls in **both** the working-tree row/header and context menus; **both** fade-in-main-graph and popup; column picker on **List view only**; **global** localStorage persistence.

### Current-state findings

**History graph**
- `CommitHistory.tsx` renders virtualized rows composed by `buildHistoryRows()` (`history-rows.ts`) with lanes from `layoutCommitGraph()` (`commit-graph.ts`); stash rows and working-tree row are integrated typed rows.
- A **locate/scroll-to-hash engine already exists**: `locateBase` state + `requestBase(hash)` in `CommitHistory.tsx`, with `historyIndexOfBase` / `nextLimitForBase` in `history-rows.ts` (stash "Locate base"). It grows `commitLimit` and centers the row — this is the engine for all jumps; add a temporary row highlight after scrolling.
- Ref pills: `buildDisplayRefs` / `RefPill` / `RefOverflowChooser` (`commit-refs.tsx`). Local branch pill absorbs its upstream **only when both sit on the same commit**; when diverged the upstream renders as a separate remote pill on its own tip commit.
- Context menus: `CommitActionContextMenu` (commits; already computes remote-branch entries incl. diverged state via `planBranchActivation` in `lib/branch-activation.ts`, currently rendered as a *disabled* info item). `GitRefContextMenu` handles tags/stashes/workingTree only — no branch target. Local-branch pills have no right-click menu today.
- `Branch` (`types/git.ts:129`) carries `upstream`, `ahead`, `behind`, `isCurrent` — but **no tip hash**; tips are only discoverable by scanning `commit.refs` of loaded commits. `parents` on `CommitSummary` make ancestor sets computable client-side within the loaded window.

**Backend**
- `get_commit_history(repo_path, limit)` (`commit_service.rs:8`) roots at HEAD + branches + remotes + tags + stash bases; no ref-rooted walk, no merge-base or revision-resolve command. `history_service::resolve_commit()` (line 264, `pub(crate)`) and `GitCli` are reusable.
- Commands registered in `src-tauri/src/lib.rs` (`commands::commits::get_commit_history`, …).

**Working-tree lists**
- `FileStatusList.tsx`: Tree/List toggle (local state), section lanes Staged / Unstaged / Ignored, list rows are a fixed grid `16px | 1fr | 64px` (badge | path | actions).
- Per-file data available (`GitStatusFile`): `path`, `status`, `staged`, `unstaged`, `oldPath`. No size/date metadata without new backend queries (out of scope per user choice).
- Persistence convention: `localStorage` inside try/catch (e.g. `BranchList` view mode, `RepositorySettings` prefs). Modal convention: fixed `<section role="dialog" aria-modal="true">` overlay portals (`BranchDeleteDialog`, `CommandPalette`, …).
- QA fixtures: `scripts/seed-qa-repositories.mjs` has no diverged-tracking-branch repo yet.

## Approach

### 1. Diverged-branch navigation

**Always-visible indicator (History header).** When the current branch diverges from its upstream (both `ahead > 0` and `behind > 0`), show a compact chip in the History header bar next to the count: `main ↕ origin/main · 2↑ 3↓` plus two inline jump buttons — "Upstream tip" and "Merge base". This works regardless of working-tree dirtiness (the working-tree row only renders when dirty, so the header is the reliable home). The same compact chip renders inline on the working-tree row when it is visible, and its context menu (`GitRefContextMenu` target `workingTree`) gains "Go to upstream tip" / "Go to merge base" items.

**Jump mechanics (reuse locate engine).** Each jump resolves a hash, then drives the existing `requestBase(hash)` pipeline (paginate until found, `scrollToIndex` center). After the row is located, briefly highlight it: keep a `locatedHash` state in `CommitHistory` (~1.6 s timeout) that passes a `highlighted` flag down to rows, rendering a subtle accent ring. Targets:
- **Upstream tip**: if a loaded commit carries the matching ref label (e.g. `origin/main` in `commit.refs`), jump directly; otherwise call a new `resolveRevision` command (`git rev-parse --verify <upstream>^{commit}`), then locate.
- **Local tip**: `headHash` (current branch tip is HEAD); jump directly.
- **Merge base**: new backend command (`git merge-base <local> <upstream>`), then locate. Hidden while unresolvable (e.g. no upstream).

**Context-menu jumps for any diverged pair.**
- `CommitActionContextMenu`: the existing diverged `RemoteRefEntry` (currently a disabled info row) becomes actionable with "Go to `<local>` tip" / "Go to `<upstream>` tip" / "Go to merge base" items (read-only navigation; busy-gated only when resolving).
- Local-branch ref pills get their first context menu: new `GitRefContextMenu` target kind `"branch"` (carries the `Branch` record). Items: "View history of `<branch>`" (feature 2), "Go to upstream tip" / "Go to merge base" (shown when `branch.ahead>0 && branch.behind>0`), "Copy branch name". The pill's `onOpenMenu` wires right-click; double-click activation stays untouched.

### 2. Single-history focus (fade) + popup

**Focus state.** App store gains `historyFocus: { hash: string; label: string } | null` + `setHistoryFocus`/clear, session-scoped and reset on repository switch exactly like `selectedGitRef` (top-level store field; `activeStateFromSession` returns `null` for it).

**Fade in the main graph.** New pure helper in `history-rows.ts`: `focusAncestorSet(commits, focusHash)` → `Set<string>` containing the focus hash and every ancestor reachable through `parents` within the loaded window (missing parents = window boundary, treated as unknown → out of focus). Rendering contract passed to rows:
- Commit rows not in the set, and their graph edges (per `outgoingLanes`/connections: a lane whose target hash is out of the set draws at reduced opacity), render dimmed (~0.3 opacity); in-focus rows/edges full opacity. Export/reuse the row SVG (`CommitGraph`) so edge dimming lives in one place.
- Stash rows dim when their `baseCommitHash` is out of the set; off-window stash rows dim entirely. Working-tree row dims when `headHash` is out of the set (its dashed connector follows).
- The focused row gets a marker (accent ring) for orientation.
- While focus is active the History header shows `Focusing <label> — Esc to clear`; `Escape` (keydown listener scoped to history when focus active) and clicking the chip clear focus. Fade reacts automatically as pagination loads more commits (ancestor set is recomputed from `commits`).

**Menu entry points** ("Focus history from here" sets `historyFocus`):
- `CommitActionContextMenu` — "Focus history from this commit".
- Tag pill menu (`GitRefContextMenu`, target `tag`) — "Show only this tag's history".
- New branch-pill menu — "Show only `<branch>`'s history".
(Stash rows deliberately excluded; not requested and their menu is already full.)

**Popup single-history dialog.** New `RefHistoryDialog` (`commit-history/RefHistoryDialog.tsx`), a fixed `role="dialog"` overlay portal: title "History of <label>", its own scrollable list of only commits reachable from the ref, rendered with the existing builders (`buildHistoryRows(commits, [], null)` + reused row SVG) — full DAG with its own lanes, **not** first-parent. Compact columns: graph, hash, message, refs (non-interactive pills), author, relative time. "Load more" increments its own limit (100 at a time). Clicking a row closes the popup and jumps the main graph to that commit (reuse locate + highlight). ✕ button, backdrop, and Escape close. Menu items opening it: commit menu "View history from here", tag menu "View this tag's history", branch-pill menu "View `<branch>` history". Focus (fade) and popup are independent: focus can be active while a popup is open.

### 3. Working-tree columns (List view)

- New module `src/components/working-tree/working-tree-columns.ts`: column registry + localStorage persistence (`try/catch`, global key `giteye.workingTree.columns`), plus `defaultColumns` and a validate/repair function for stored values (tests in `tests/working-tree-columns.test.js`).
- Columns: **Status badge** and **Path** are core and always on (this keeps the core lanes intact — Staged/Unstaged/Ignored sections and the per-row identity never disappear). Optional toggles, all backed by existing data:
  - `statusLabel` — textual status next to the badge ("Modified", "Added", …).
  - `oldPath` — "renamed from …" as its own column (removes it from the inline subtitle).
  - `stagedMarker` — small "staged" chip on unstaged-list rows that also carry staged changes (`file.staged && file.unstaged`).
  - Actions column stays always visible.
- A "Columns ⌄" picker button sits next to the Tree/List toggle in the section header: a small menu with checkboxes per optional column (keyboard operable, portal pattern like `RefOverflowChooser`). One shared selection across both Staged and Unstaged sections (the sections are two instances of the same component; keep a single global set so the view stays coherent).
- List rows switch from the fixed 3-col grid to a template derived from the enabled columns; tree view unchanged.

## Files to modify

| Area | Files |
|---|---|
| Backend | `src-tauri/src/git/commit_service.rs` (ref-rooted history, `merge_base`, `resolve_revision`), `src-tauri/src/commands/commits.rs`, `src-tauri/src/lib.rs` |
| Data/API | `src/types/git.ts` (if payload types needed), `src/lib/tauri-api.ts`, `src/lib/git-data.ts` (queries: `refHistory`, `mergeBase`, `resolveRevision`) |
| Store | `src/stores/app-store.ts` (`historyFocus` + reset on repo switch) |
| History graph | `src/components/commit-history/CommitHistory.tsx`, `history-rows.ts` (focus helpers), `CommitListItem.tsx` (dim/highlight, export SVG), `WorkingTreeRow.tsx`, `GitRefContextMenu.tsx` (branch + focus/history items), `HistorySurgeryActions.tsx` (diverged jumps, focus item), new `RefHistoryDialog.tsx` |
| Working tree | `src/components/working-tree/FileStatusList.tsx`, new `working-tree-columns.ts` (+ picker UI) |
| Tests | `tests/history-rows.test.js`, new `tests/working-tree-columns.test.js`, Rust in-module tests in `commit_service.rs` |
| QA/docs | `scripts/seed-qa-repositories.mjs` (new `diverged-tracking-repo` fixture), `docs/manual-qa.md`, `README.md` |

## Reuse

- Locate/scroll/paginate engine: `requestBase`, `historyIndexOfBase`, `nextLimitForBase` (`CommitHistory.tsx`, `history-rows.ts`) — no new scroll logic.
- `layoutCommitGraph` + `buildHistoryRows` for the popup's own lane graph; `CommitGraph` SVG (exported from `CommitListItem.tsx`) for rendering.
- `buildDisplayRefs` / `RefPill` / `RefOverflowChooser` patterns for pills, overflow, and the column-picker portal menu.
- `planBranchActivation` divergence plan (`lib/branch-activation.ts`) for context-menu jump targets.
- `history_service::resolve_commit` and `GitCli` for backend resolve/merge-base/history-walk; Tauri command + `gitApi`/`gitQueries` wiring conventions in `commands/commits.rs`, `tauri-api.ts`, `git-data.ts`.
- Dialog overlay pattern (`role="dialog"` portal, Escape/backdrop close): `BranchDeleteDialog.tsx`, `CommandPalette.tsx`.
- localStorage `try/catch` persistence convention: `BranchList.tsx`, `RepositorySettings.tsx`.
- QA seeding conventions in `scripts/seed-qa-repositories.mjs`.

## Steps

- [x] **Backend:** extend `get_commit_history` with optional `rev` (resolve first, single-root walk); add `merge_base(repo, a, b)` and `resolve_revision(repo, rev)`; register commands; Rust tests (ref-rooted walk excludes unrelated branches; merge-base on diverged fixture; resolve errors are typed).
- [x] **API wiring:** `tauri-api.ts` + `git-data.ts` queries for `refHistory` / `mergeBase` / `resolveRevision` with proper keys under `gitKeys.repository(...)`.
- [x] **Focus engine:** `focusAncestorSet` in `history-rows.ts` + tests; `historyFocus` in app-store with repo-switch reset; dim/highlight rendering through `CommitListItem`/`CommitGraph`/`StashRow`/`WorkingTreeRow`; header "Focusing … — Esc to clear" chip and Escape clearing.
- [x] **Jumps:** diverged chip in History header + working-tree row menu items; `locatedHash` flash; diverged `RemoteRefEntry` becomes actionable jump items; new branch-pill context menu (`GitRefContextMenu` target `branch`) with jumps + history + copy.
- [x] **Popup:** `RefHistoryDialog` (own lanes, load-more, row click → main-graph jump, Escape/✕/backdrop close) with menu entry points on commit/tag/branch menus.
- [x] **Columns:** `working-tree-columns.ts` registry + persistence + tests; column picker in `FileStatusList` header; adaptive list-row grid; core lanes/status badge/path/actions always rendered.
- [x] **QA/docs:** `diverged-tracking-repo` fixture in the seeder; `docs/manual-qa.md` checklist; README feature notes.

## Verification

- Automated: `bun test`, `bun run build`, `cargo test --manifest-path src-tauri/Cargo.toml`. New tests must cover: ancestor-set correctness (forks, merges, window boundaries, focus at head/tail), stored-column repair, ref-rooted history isolation, merge-base/resolve happy + error paths.
- Manual QA in the real Tauri app against `diverged-tracking-repo` (and `tags-stashes-repo` for popup/tag cases):
  1. Diverged header chip shows counts; "Upstream tip" and "Merge base" jumps scroll (and paginate beyond 100 commits) to the right rows with a visible flash; local-tip jump lands on HEAD row.
  2. Context menu on a remote-branch entry of a diverged pair jumps to both tips; branch-pill right-click offers the same plus branch history.
  3. "Focus history from here" on a commit on a side lane: other lanes fade, focused lane + its edges stay bright, focused row ringed; Escape and the header chip clear it; pagination keeps fade correct.
  4. Tag menu → "Show only this tag's history" opens popup with just that ref's lane; "Load more" extends it; row click closes popup and jumps the main graph; ✕/Escape/backdrop close.
  5. Column picker: toggling each optional column updates both Staged and Unstaged list sections; core badge/path/actions and the section lanes never disappear; choices persist across app restart (localStorage); invalid stored values fall back to defaults.
- Acceptance: every jump lands on the correct commit with highlight; fade never alters row order, selection, or graph topology; popup shows exactly the ref-reachable history; column edits never remove the core lanes.

### Implementation evidence

- `cargo test`: 270 passing (7 new: ref-rooted walk isolation, limit, unknown rev, merge-base found/none/error, resolve). `bun test`: 66 passing (3 focus-ancestry, 3 column-repair tests). `tsc --noEmit` and `bun run build` pass.
- Isolated Tauri smoke on `diverged-tracking-repo`: header/working-tree chips show `2↑ 3↓`; Merge base jump ringed `a565fe2 Shared history 110` and upstream jump `a1c1e26 Upstream-only work 3` (both matched `git merge-base` / `origin/main`). Tag-pill focus dimmed exactly the 6 off-lane commits while the side lane stayed bright; Escape cleared it. Branch-pill popup listed only `feature/side-lane` history (100 → 113 after Load more, no upstream commits); clicking `Initial commit` closed it and paginated the main graph 100 → 118 to locate the row. A real Escape inside the popup closed it without clearing an active focus. Column picker updated both sections, kept badge/path/actions, persisted across reload. No console errors.
- Smoke-driven fix: unfocused rows now fade their text cells via `.giteye-unfocused-row` (graph cell fades per lane), so focused lanes crossing faded rows stay bright.
