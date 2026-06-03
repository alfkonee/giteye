# GitEye Modern UI Overhaul — Plan

## Context

The current GitEye Phase 1 implementation is functionally complete but visually basic. The user wants a premium, modern UI that feels like a serious desktop developer tool — inspired by Linear's typography, GitFork's layout, Raycast's keyboard-friendliness, VS Code's familiarity, and the provided light-mode reference image.

The reference image shows a compact macOS-style Git desktop client: a light window with a muted sidebar, toolbar action strip, blue selected commit row, branch graph lane, bottom details panel, and split diff area. GitEye should use this image as the **light theme baseline** while also shipping a first-class dark theme.

The diff viewer is currently using a plain-text fallback (`UnifiedDiffFallback`). `@pierre/diffs` is installed (v1.2.7) and exposes `PatchDiff`, `FileDiff`, `MultiFileDiff`, `CodeView`, and `Virtualizer` through `@pierre/diffs/react`.

The project should switch to **Bun-first tooling** instead of npm/npx/node-based command usage.

## Approach

Build a dual-theme UI system and then polish the Git workflow surfaces around it.

The **light theme** will use the provided reference image as the visual baseline: a macOS-like desktop Git client with a light warm-gray window, muted left sidebar, compact icon toolbar, blue selected rows, branch graph lanes, bottom commit/details split, and clean diff panes.

The **dark theme** will be a first-class equivalent, not an afterthought: same layout and hierarchy, but translated into a cool charcoal developer-tool palette with muted surfaces, subtle borders, and high-contrast text.

The implementation will also move scripts, docs, verification, and Tauri pre-build commands to Bun:

- `bun install` for dependencies
- `bun run dev`, `bun run build`, `bun run tauri dev`
- `bunx tsc` / `bunx vite build` for direct binary checks
- `src-tauri/tauri.conf.json` `beforeDevCommand` / `beforeBuildCommand` updated to Bun commands

A multi-phase UI overhaul will touch design tokens, theme application, layout, toolbar, sidebar, working tree, commit history, diff viewer, welcome screen, settings, README commands, package scripts, and Tauri config. Every component gets polished loading/empty/error/selected states. No backend logic changes needed.

### Reference Image Translation

| Reference image element | GitEye implementation |
|---|---|
| Light macOS window with rounded edges and soft shadow | Light theme app shell uses warm off-white background, elevated panels, subtle shadows |
| Left sidebar listing repositories, branches, remotes, tags, stashes | Sidebar gets repository header, workspace nav, branches, remotes, tags, stashes, settings |
| Compact icon toolbar: Fetch, Pull, Push, Branch, Merge, Stash, Checkout | Toolbar gets repo/branch controls, command input, and Git action buttons |
| Commit table with graph lane, hash, author, date, message | CommitHistory adds graph lane stub and tighter column layout |
| Strong blue selected row | Both themes get a clear selected-row token; light uses reference-style blue |
| Lower details + split diff area | PanelLayout keeps details/diff pane visible and refines resize handles |
| Diff area with green/red code regions | `@pierre/diffs` is wired for unified Phase 1 and future split mode; fallback gets line numbers |

### Design Token Strategy

Replace the single warm Catppuccin Mocha palette with **two named token sets**:

1. `:root, [data-theme="light"]` — light mode based on the reference image.
2. `[data-theme="dark"]` — premium dark mode with the same semantic tokens.

Theme application will reuse the existing Zustand `theme` state in `src/stores/app-store.ts` and apply `data-theme` at the document root from `src/app/App.tsx`.

#### Light Theme — Reference Image Baseline

| Token | Light value | Role |
|---|---|---|
| `--color-bg-primary` | #f4f1ec | Window/background tint |
| `--color-bg-secondary` | #f7f7f5 | Sidebar / toolbar |
| `--color-bg-tertiary` | #ffffff | Main panel |
| `--color-bg-surface` | #ecebea | Row/card surface |
| `--color-bg-hover` | #e4e4e2 | Hover row |
| `--color-bg-selected` | #0a7dff | Selected row / primary selection |
| `--color-border` | #d4d4d2 | Panel borders |
| `--color-border-muted` | #e6e6e4 | Internal dividers |
| `--color-text-primary` | #1f2328 | Primary text |
| `--color-text-secondary` | #59636e | Secondary text |
| `--color-text-muted` | #8c959f | Muted text |
| `--color-accent` | #0a7dff | Accent |
| `--color-accent-hover` | #006ee6 | Accent hover |
| `--color-success` | #1a7f37 | Clean / success |
| `--color-warning` | #9a6700 | Dirty / warning |
| `--color-danger` | #cf222e | Delete / errors |
| `--color-added` | #1a7f37 | Diff added text |
| `--color-added-bg` | #dafbe1 | Diff added background |
| `--color-deleted` | #cf222e | Diff deleted text |
| `--color-deleted-bg` | #ffebe9 | Diff deleted background |

#### Dark Theme — First-Class Companion

| Token | Dark value | Role |
|---|---|---|
| `--color-bg-primary` | #0d1117 | App background |
| `--color-bg-secondary` | #161b22 | Panel / sidebar bg |
| `--color-bg-tertiary` | #0d1117 | Deepest bg |
| `--color-bg-surface` | #21262d | Surface / card |
| `--color-bg-hover` | #30363d | Hover state |
| `--color-bg-selected` | #1f6feb | Selected row |
| `--color-border` | #30363d | Panel borders |
| `--color-border-muted` | #21262d | Internal dividers |
| `--color-text-primary` | #e6edf3 | Primary text |
| `--color-text-secondary` | #8b949e | Secondary text |
| `--color-text-muted` | #484f58 | Muted text |
| `--color-accent` | #58a6ff | Accent / selected |
| `--color-accent-hover` | #79c0ff | Accent hover |
| `--color-success` | #3fb950 | Success / clean |
| `--color-warning` | #d29922 | Warning / dirty |
| `--color-danger` | #f85149 | Danger / delete |
| `--color-added` | #3fb950 | Diff added |
| `--color-added-bg` | rgba(46,160,67,0.15) | Diff added bg |
| `--color-deleted` | #f85149 | Diff deleted |
| `--color-deleted-bg` | rgba(248,81,73,0.15) | Diff deleted bg |

> [!IMPORTANT]
> Components should consume semantic CSS variables so light and dark mode both look intentional.

## Files to Modify

| File | Change |
|---|---|
| `src/index.css` | Replace single palette with light and dark theme token sets; better scrollbars, typography, selection style |
| `src/app/App.tsx` | Apply `data-theme` from Zustand theme state to the document root |
| `package.json` | Keep scripts Bun-compatible and stop documenting npm/npx usage |
| `src-tauri/tauri.conf.json` | Change `beforeDevCommand` to `bun run dev`; change `beforeBuildCommand` to `bun run build` |
| `README.md` | Replace npm/npx commands with Bun commands |
| `src/components/layout/Toolbar.tsx` | Premium command bar: repo switcher, branch selector, actions, command input |
| `src/components/layout/Sidebar.tsx` | Reference-inspired sidebar: repository header, workspace section, branch/remotes/tags/stashes sections, counts, indicators |
| `src/components/layout/PanelLayout.tsx` | Always-visible detail pane, better resize handle styling |
| `src/components/layout/AppShell.tsx` | Minor — pass more repo info to Toolbar |
| `src/components/repository/RepositoryWelcome.tsx` | Premium welcome with light/dark compatible styling, open button, recent repos, keyboard shortcut hint |
| `src/components/working-tree/WorkingTree.tsx` | Cleaner header, reference-style lower commit area |
| `src/components/working-tree/FileStatusList.tsx` | Polished sticky headers, compact rows, better stage/unstage interaction, file icons |
| `src/components/working-tree/CommitBox.tsx` | Polished textarea and “Commit to [branch]” button |
| `src/components/commit-history/CommitHistory.tsx` | Graph lane stub, search placeholder, sticky table header |
| `src/components/commit-history/CommitListItem.tsx` | Graph lane column, refined hash/message/author/date/labels layout, selected-row token |
| `src/components/commit-history/CommitDetails.tsx` | Refined lower/details panel styling matching reference image |
| `src/components/diff-viewer/DiffViewer.tsx` | Wire `@pierre/diffs`, better file header with path |
| `src/components/diff-viewer/PierreDiffViewer.tsx` | Implement actual `@pierre/diffs` integration with light/dark theme selection |
| `src/components/diff-viewer/UnifiedDiffFallback.tsx` | Add line numbers, better header, add/remove colors use semantic tokens, keep as fallback |
| `src/components/common/StatusBadge.tsx` | Refined badge colors for both light and dark themes |
| `src/components/common/EmptyState.tsx` | Slightly refined spacing and theme-safe text colors |
| `src/components/settings/SettingsPlaceholder.tsx` | Add functional light/dark theme toggle using existing store; refine cards |
| `src/stores/app-store.ts` | Reuse existing `theme` / `setTheme`; set default based on final product preference |

## Reuse

- `src/lib/cn.ts` — already merged `clsx` + `tailwind-merge`
- `src/stores/app-store.ts` — already has `theme: "dark" | "light"` and `setTheme`
- `src/hooks/*` — all TanStack Query hooks for Git data are unchanged
- `src/lib/tauri-api.ts` — typed invoke wrapper, unchanged
- `src/types/git.ts` — types and `parseFileStatus`, unchanged
- `@pierre/diffs/react` — confirmed exports: `PatchDiff`, `FileDiff`, `MultiFileDiff`, `CodeView`, `Virtualizer`
- Existing Vite/Tauri scripts in `package.json`, migrated to Bun execution
- All existing lucide-react icons and Radix primitives

## Steps

### Phase A: Bun tooling cutover
- [ ] Update `src-tauri/tauri.conf.json` to use `bun run dev` and `bun run build`.
- [ ] Update `README.md` setup and verification commands to `bun install`, `bun run`, and `bunx`.
- [ ] Keep `package.json` scripts compatible with Bun (`dev`, `build`, `preview`, `tauri`).
- [ ] Avoid adding npm-only script assumptions.

### Phase B: Dual theme foundation
- [ ] Rewrite `src/index.css`: add `:root, [data-theme="light"]` tokens based on the reference image.
- [ ] Add `[data-theme="dark"]` tokens as a first-class dark companion.
- [ ] Add `--color-bg-selected`, `--color-border-muted`, `--shadow-panel`, and semantic diff line tokens.
- [ ] Update global scrollbar, selection, and focus-ring styling for both themes.
- [ ] Update `src/app/App.tsx` to apply `document.documentElement.dataset.theme = theme` from Zustand.

### Phase C: Toolbar overhaul
- [ ] Rewrite `src/components/layout/Toolbar.tsx` with repo switcher, branch selector, command input, and compact Git action buttons.

### Phase D: Sidebar polishing
- [ ] Rewrite `src/components/layout/Sidebar.tsx` with repository header, Workspace section, local/remote branches, remotes/tags/stashes stubs, settings, and command palette hint.

### Phase E: Welcome screen
- [ ] Rewrite `src/components/repository/RepositoryWelcome.tsx` with reference-inspired light styling and matching dark styling.

### Phase F: Working tree polish
- [ ] Update `src/components/working-tree/WorkingTree.tsx` with cleaner header and reference-style lower commit zone.
- [ ] Update `src/components/working-tree/FileStatusList.tsx` with sticky headers, compact rows, inline actions, and theme-safe states.
- [ ] Update `src/components/working-tree/CommitBox.tsx` with “Commit to [branch]” and better textarea styling.

### Phase G: Commit history polish
- [ ] Update `src/components/commit-history/CommitListItem.tsx` with graph lane stub, selected-row token, dense row, and compact ref pills.
- [ ] Update `src/components/commit-history/CommitHistory.tsx` with sticky table header and virtualization preserved.
- [ ] Update `src/components/commit-history/CommitDetails.tsx` with reference-style lower-panel hierarchy and commit body display.

### Phase H: Diff viewer overhaul
- [ ] Implement `src/components/diff-viewer/PierreDiffViewer.tsx` using `PatchDiff` and `Virtualizer` from `@pierre/diffs/react`.
- [ ] Use light/dark diff themes (`github-light` / `github-dark` when supported).
- [ ] Keep `UnifiedDiffFallback` with line numbers and semantic diff tokens.

### Phase I: Common components, settings, and layout refinement
- [ ] Update `src/components/common/StatusBadge.tsx` and `src/components/common/EmptyState.tsx` for both themes.
- [ ] Update `src/components/settings/SettingsPlaceholder.tsx` with functional Light/Dark toggle.
- [ ] Update `src/components/layout/PanelLayout.tsx` to keep the detail pane visible and polish resize handles.

## Verification

1. `bun install` — installs frontend dependencies with Bun.
2. `bunx tsc` — zero TypeScript errors.
3. `bunx vite build` or `bun run build` — clean production build.
4. `cd src-tauri && cargo check` — Rust unchanged, still passes.
5. `bun run tauri dev` — visual inspection:
   - Default/light theme matches the reference image’s macOS-like visual direction.
   - Toggle to dark theme in Settings and verify every major surface updates cleanly.
   - Welcome screen shows new premium look in both themes.
   - Open a repo → toolbar shows repo switcher, branch selector, command input, action buttons.
   - Sidebar shows workspace sections, branch list with badges, remotes/tags/stashes stubs.
   - Working tree has sticky section headers, compact file rows, and commit box.
   - Commit history has graph lane stub, table header, refined selected rows.
   - Click a file → diff pane uses `@pierre/diffs` or fallback with line numbers.
   - Click a commit → detail pane shows polished commit details.
   - All empty, loading, error states render correctly in light and dark themes.
6. Test `@pierre/diffs`: open a repo, click a modified file, verify diff renders in light and dark theme modes.

## Open Decision

> [!NOTE]
> I recommend making **light mode the default** for this implementation because the provided reference image is explicitly the base. Dark mode remains fully implemented and user-toggleable from Settings. If the product should remain dark-first by default, keep `theme: "dark"` in `src/stores/app-store.ts` and still implement the reference-inspired light mode as the alternate theme.
