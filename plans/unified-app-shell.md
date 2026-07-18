# Unified OS-Agnostic App Shell Plan

## Context

The requested change is to replace the native OS window chrome/titlebar experience with one unified GitEye application shell so macOS, Windows, and Linux share the same top-level UI/UX. The supplied screenshot shows the current problem: native titlebars and app chrome compete visually with GitEye's own toolbar, producing a duplicated shell.

Current state discovered:

- `src-tauri/tauri.conf.json` still uses the default decorated Tauri window, so the OS titlebar remains visible.
- Repository mode already has a custom React shell in `src/components/layout/AppShell.tsx` and a dense toolbar in `src/components/layout/Toolbar.tsx`.
- Repo Hub mode currently hand-rolls its own sidebar/header in `src/components/repository/RepositoryWelcome.tsx`, including mock traffic-light/window controls that are not wired to Tauri.
- Global design tokens and density helpers live in `src/index.css`.
- Tauri's official custom titlebar guidance uses `decorations: false`, `data-tauri-drag-region`, `@tauri-apps/api/window`, and capability permissions such as `core:window:allow-minimize`, `allow-toggle-maximize`, `allow-close`, and `allow-start-dragging`.
- The current checkout is dirty with unrelated work, so implementation should begin from a new git worktree/branch rather than modifying this worktree.

> [!IMPORTANT]
> The shell should be OS-agnostic in behavior and layout, not a re-skin of macOS/Windows/Linux native controls. Any platform-specific handling should be hidden behind a tiny window API/helper.

Confirmed product preferences:

- Window controls should follow platform convention for placement while retaining GitEye's unified visual style.
- The shell must have full dark and light theme parity in the same implementation pass.
- The shell title should be contextual, e.g. `GitEye · Repo Hub` or `GitEye · <repo> · <branch>`.

## Approach

Create a reusable application chrome layer that wraps both Repo Hub and repository workspace content. Configure Tauri to remove native decorations, then render one consistent GitEye titlebar/header in React with app identity, route context, drag regions, and real window controls. Keep existing Git workflow controls in `Toolbar` where they belong, but make it sit under the unified chrome instead of acting like the topmost window shell.

The visual target is a compact, theme-complete developer-app frame: one top strip for contextual app identity/window movement/window controls, one optional workspace toolbar strip for Git actions, and the existing sidebar/content/status regions below. The screenshot's duplicated titlebar should collapse into a single GitEye-owned frame. Control placement may vary by platform, but the control shapes, hover states, spacing system, and titlebar behavior should remain GitEye-owned and consistent.

## Files to modify

| File | Planned change |
|---|---|
| `src-tauri/tauri.conf.json` | Disable native decorations for the main window; consider transparent/background settings only if needed after visual testing. |
| `src-tauri/capabilities/default.json` | Add Tauri core window permissions for close, minimize, toggle maximize, and start dragging. |
| `src/components/layout/AppShell.tsx` | Wrap repository workspace content in the new shared app chrome and keep repo toolbar/statusbar inside the content area. |
| `src/components/repository/RepositoryWelcome.tsx` | Remove local fake titlebar/window controls and render inside the shared app chrome. |
| `src/components/layout/Toolbar.tsx` | Adjust top border/height/spacing so it becomes a repository action toolbar under the app shell, not competing window chrome. |
| `src/index.css` | Add shell/titlebar tokens for both dark and light themes plus drag-region/non-drag-region CSS helpers; tune `giteye-shell` min sizing for frameless windows. |
| `src/lib/*` or `src/components/layout/*` | Add a tiny reusable Tauri window helper/component if direct imports in the shell would clutter UI code. |

## Reuse

- `src/components/layout/AppShell.tsx` already owns the repository-level layout and statusbar.
- `src/components/layout/Toolbar.tsx` already provides repo switcher, branch selector, command search, sync actions, notices, and settings.
- `src/components/repository/RepositoryWelcome.tsx` already provides Repo Hub navigation/content and can be simplified by delegating outer chrome.
- `src/index.css` already centralizes semantic colors, radii, sizes, shadows, and density helpers.
- `src/lib/cn.ts` should be reused for conditional class composition in new shell/chrome components.
- Existing `lucide-react` icons can provide OS-neutral minimize/maximize/close glyphs instead of platform-specific assets.

## Steps

- [ ] Create implementation branch/worktree, e.g. `git worktree add ../GitEye-unified-shell -b unified-app-shell main`, after confirming the desired branch name.
- [ ] Add a reusable `AppChrome`/`WindowChrome` component that renders the unified titlebar, contextual app title/route label, drag region, and real Tauri window controls.
- [ ] Add a small window control helper using `getCurrentWindow()` from `@tauri-apps/api/window` for minimize, toggle maximize, close, and drag behavior.
- [ ] Detect the current platform through Tauri/browser-safe APIs and place controls by platform convention while preserving the same GitEye control component/styling.
- [ ] Update `src-tauri/tauri.conf.json` to set `decorations: false` for the main window.
- [ ] Update `src-tauri/capabilities/default.json` with the required core window permissions.
- [ ] Wrap repository mode (`AppShell`) with the unified chrome while preserving the existing toolbar, sidebar, panel layout, notice center, and statusbar behavior.
- [ ] Wrap Repo Hub mode (`RepositoryWelcome`) with the same chrome and remove the fake local window controls shown in its header/sidebar.
- [ ] Add CSS helpers/tokens for `.giteye-window-chrome`, drag regions, no-drag controls, hover/active states, and frameless-window sizing in both dark and light themes.
- [ ] Tune spacing so the top of the app has exactly one shell/titlebar row across Repo Hub and repository workspace.
- [ ] Check keyboard/mouse behavior: inputs/buttons are non-draggable, empty chrome areas drag the window, double-click/titlebar maximize behavior works where supported, and controls remain accessible by title/aria label.

## Verification

- [ ] Run `bun run build` for TypeScript and Vite verification.
- [ ] Run `bun run tauri dev` and manually verify there is no native titlebar above GitEye's shell.
- [ ] On the current platform, manually test minimize, maximize/restore, close, and click-drag from the custom titlebar.
- [ ] Manually verify Repo Hub and an opened repository both use the same chrome and do not show duplicated controls.
- [ ] Toggle light/dark theme and verify shell/titlebar contrast, hover states, borders, and contextual titles in both modes.
- [ ] If cross-platform CI/build runners are available, run/package at least Linux AppImage plus any available Windows/macOS checks.
