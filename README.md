# GitEye

A fast, beautiful, cross-platform Git GUI client for developers and teams.

**Phase 1 — Foundation** · Built with Tauri 2, Rust, React, TypeScript, Vite, and Tailwind CSS.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Shell | Tauri 2.x |
| Backend | Rust |
| Frontend Framework | React 19 |
| Language | TypeScript 5.8 |
| Build Tool | Vite 7 |
| Styling | Tailwind CSS 4 |
| State (UI) | Zustand 5 |
| State (Async) | TanStack Query 5 |
| Virtualization | TanStack Virtual 3 |
| Layout | react-resizable-panels 2 |
| Diff Rendering | `@pierre/diffs` (integration point) + Unified fallback |
| Icons | lucide-react |
| UI Primitives | Radix UI (dialog, dropdown-menu, tooltip, toggle, scroll-area) |
| Utilities | clsx, tailwind-merge, zod |

---

## Architecture

```
src/                          src-tauri/src/
├── app/                      ├── commands/
│   ├── App.tsx               │   ├── repository.rs
│   └── providers.tsx         │   ├── status.rs
├── components/               │   ├── commits.rs
│   ├── layout/               │   ├── branches.rs
│   │   ├── Toolbar.tsx       │   ├── remotes.rs
│   │   ├── Sidebar.tsx       │   ├── stashes.rs
│   │   └── PanelLayout.tsx   │   ├── tags.rs
│   ├── repository/           │   └── diff.rs
│   ├── working-tree/         ├── git/
│   ├── commit-history/       │   ├── cli.rs
│   ├── diff-viewer/          │   ├── repository_service.rs
│   ├── branches/             │   ├── status_service.rs
│   ├── workspaces/           │   ├── commit_service.rs
│   ├── settings/             │   ├── branch_service.rs
│   └── common/               │   ├── remote_service.rs
├── hooks/                    │   ├── stash_service.rs
├── stores/                   │   ├── tag_service.rs
├── types/                    │   └── diff_service.rs
└── lib/                      ├── models/
                              ├── errors.rs
                              ├── storage.rs
                              ├── watcher.rs
                              ├── lib.rs
                              └── main.rs
```

All Tauri commands that run blocking work (git/gh subprocesses, HTTP, filesystem, keychain) are `async fn` offloading to `tauri::async_runtime::spawn_blocking`, so slow operations (GitHub overviews, PR diffs, AI suggestions, archaeology/diagnostics searches) never freeze the UI. Only background-job enqueuers and flag setters stay synchronous.
---

## Implemented Features (Phase 1)

### Git Operations
- **Repository workspace**: Open multiple local repos, switch between top-level repo tabs, preserve per-repo view/selection state, repo info (branch, clean/dirty, HEAD), recent repos
- **Status**: Full status via `git status --porcelain=v2`, staged/unstaged file lists
- **Workspace**: One pane combining staging (stage/unstage individual files, stage all, unstage all), the commit graph, and the merge/rebase/conflict drawer, so the commit → integrate → resolve loop needs no view switch
- **Commit**: Commit with message (Ctrl+Enter), amend HEAD, sign off commits, bypass hooks when explicitly requested, and create empty marker commits
- **Branches**: List branches, checkout, create, fast-forward from upstream, merge into current branch, delete (with confirmation); double-clicking a remote branch checks out a tracking local branch when none exists and fast-forwards the tracking branch when one does
- **Checkout choices**: Double-click a branch badge in the workspace graph to confirm checkout. Move preserves working changes; Stash saves staged, unstaged, and untracked contents; Discard requires a second confirmation and preserves ignored files. Unsafe nested repository/submodule changes are refused rather than silently deleted.
- **Commits**: History with virtualization, commit details, changed file list, and ref-aware merge/rebase actions on any commit carrying a branch or tag
- **Remotes**: List remotes, fetch, pull, push from the toolbar or Remotes view; long-running network operations run as background jobs with streamed logs
- **Stashes**: Create, apply, pop, and drop local stashes, including untracked files
- **Tags**: List local tags, create lightweight/annotated tags, delete local tags
- **Git LFS**: Detect LFS availability/version, list tracked patterns/files, install local hooks, track/untrack patterns
- **SSH keys**: Inspect `~/.ssh` public keys, generate Ed25519 keys, copy public keys, and add local private keys to `ssh-agent`
- **Credential helper config**: Inspect effective/global/local `credential.helper`, set or clear local helper, and reject shell-command helpers
- **Diff**: File diff (working tree and staged), commit diff, binary detection, unified/split mode toggle
- **Rebase/conflicts**: Inspect active rebase state, edit remaining todo actions/order, autosquash fixup/squash commits, accept current/incoming side, mark files resolved, continue/skip/abort through background jobs where long-running
- **Background Git jobs**: Clone, fetch, pull, push, merge/rebase, submodule update/sync/init, and worktree repair/prune run through a Tauri job runner with per-repo mutation serialization, cancellation, streamed stdout/stderr, and command-log history
- **GitHub PR review**: Load live PRs, labels, review requests, selected-PR checks/reviews/timeline, filtered PR diffs/comments, inline diff line comments, stack landing order/action, label add/remove prompts, review request prompts, and approve/comment/request-changes actions through `gh`
- **Branch PR navigation**: Branch menus find open PRs by exact upstream repository and branch, including fork heads. Existing PRs open in the review studio, or explicitly on GitHub when targeting a fork's parent; multiple matches offer a picker. The Create PR dialog checks for existing PRs before offering creation.
- **GitHub CI status**: Inspect workflow check runs for the current branch and selected pull request, including pass/fail/pending buckets, workflow grouping, duration metadata, filtering, and direct check links

### UI
- Dark-first developer aesthetic (Catppuccin Mocha-inspired palette)
- Welcome screen with recent repositories and open repository sessions
- Top repository tabs for multi-repo workflows with branch, dirty, and running-job badges
- Resizable 3-panel layout (sidebar | main content | detail pane)
- Collapsible sidebar grouped around core local Git views, with collaboration/provider views separated from local workflows
- Worktree and submodule sidebar lists load in the background for the active repository, independently of remote collaboration loading. Git metadata changes refresh them promptly; otherwise-unwatched local dirty status refreshes on a 30-second foreground cadence.
- Toolbar showing repo name, branch, clean/dirty status, remote status shortcut, and diff mode toggle
- Toolbar command search executes local navigation, refresh, remote sync, and diff-mode actions
- Global command palette (Ctrl/⌘K) searches repository sessions, recent/favorite repositories, views, and core app commands from any screen
- Quake-style command log console (backquote toggles, `Esc` closes, drag-resizable, height persisted) for GitEye-triggered background job metadata, stdout/stderr, final status, and output clearing; reachable from the status bar
- Commit history with TanStack Virtual for large lists, pinned by an uncommitted-changes row above HEAD that opens the commit UI in the detail pane
- Diff viewer with syntax-colored unified diff fallback
- File status badges (M/A/D/R/C/!/??/!!/T)
- Settings wire theme, diff mode, per-repository Git author identity, credential helper config, and local SSH key management; Git path remains informational
- Settings → About shows the running app version, full build commit, release channel, application ID (`com.giteye.app`), operating system, Tauri runtime, and Git/Git LFS versions. Copy app details produces a bug-report summary without repository paths or credentials; project, release-note, and issue links are included.
- Loading, error, and empty states throughout

### @pierre/diffs Integration
- `DiffViewer` abstraction (`components/diff-viewer/DiffViewer.tsx`)
- `PierreDiffViewer` integration point (`components/diff-viewer/PierreDiffViewer.tsx`)
- `UnifiedDiffFallback` custom renderer (Phase 1 default)
- `@pierre/diffs` package installed and ready to wire in

---

## Stubbed / Deferred

| Feature | Status |
|---|---|
| GitLab/Bitbucket integrations | Phase 2+ |
| AI-assisted commit messages | Phase 2+ |
| Command palette | Implemented with native React overlay |
| CI status | Implemented for GitHub workflow checks |
| Theme switching (light/dark) | Implemented in app state |
| Async/cancellable Git operations | Implemented for long-running GitEye-triggered jobs |

---

## Setup & Development

### Prerequisites

- Bun ≥ 1
- Rust ≥ 1.70
- Git
- Tauri system dependencies ([see Tauri docs](https://v2.tauri.app/start/prerequisites/))

### Install

```bash
cd GitEye
bun install
```

### Develop

```bash
bun run tauri
```

The command starts a Vite server and selects the next available port automatically. GitEye uses a single application instance; later launches activate that window and forward repository paths to it.

### Build Desktop App

```bash
bun run tauri:build
```

### Build Linux AppImage

```bash
bun run build:appimage
```

The AppImage is written to `src-tauri/target/release/bundle/appimage/`. The GitHub Actions workflow at `.github/workflows/release.yml` runs when a GitHub Release is published, builds Linux, Windows, and macOS bundles, and uploads the generated artifacts to that release.

CI stamps the actual checked-out commit into the native binary using `scripts/stamp-build-metadata.mjs`. Release builds first synchronize the version from the release tag, then verify that `package.json`, Tauri configuration, Cargo manifest, and Cargo lockfile agree and that the production identifier remains `com.giteye.app`. The native build rejects mismatched CI commit/version values and invalidates cached metadata when they change. Local builds derive the commit from Git; source archives without Git metadata display an unavailable commit rather than an unrelated repository's runtime HEAD.

### Typecheck & Lint

```bash
# Frontend
bunx tsc

# Backend
cd src-tauri && cargo check && cargo fmt --check
```

---

## How to Open a Repository

1. Launch GitEye (`bun run tauri`)
2. On the Welcome screen, either:
   - Type/paste a repository path and click **Open**
   - Click the folder icon to browse with the native file dialog
3. The repository loads and displays the Workspace view (changes, history, integrate drawer)
4. Switch between Workspace, Branches, and the remaining views via the sidebar

### Open from a terminal

Run the **`giteye` executable** with one repository directory:

```sh
giteye .
giteye /absolute/path/to/repository
giteye "/path/with spaces/repository"
giteye -- -repository
giteye --help
giteye --version
```

Relative paths use the calling terminal's current directory. Nested directories
resolve to the repository root; linked worktrees open as their own workspace.
If GitEye is already running, the request opens in that instance and brings its
window forward. With no arguments, GitEye starts normally or activates the
existing window. Invalid repositories show an error without replacing the
current workspace; launching never initializes or clones a repository.
`--help` and `--version` exit without starting the GUI.

### Optional user-scoped CLI setup

On first run, choose **Install CLI** in the non-modal terminal setup offer, or
choose **Not now** to dismiss it permanently. Setup remains available under
**Settings → General → Command-line launcher**, including removal and reinstall.
Installation is opt-in and needs no administrator privileges.

You can also run setup directly using your app's executable:

```sh
/path/to/giteye --install-cli
/path/to/giteye --uninstall-cli
/path/to/giteye --install-cli --install-dir "$HOME/bin"
```

Use the same `--install-dir` when removing a custom installation. Custom
directories must remain inside your home directory.

- **Linux/macOS:** installs `~/.local/bin/giteye`. For an AppImage, invoke the
  original `.AppImage` file with `--install-cli`; the launcher targets that
  persistent file, never its temporary mount. On macOS, the app executable is
  `GitEye.app/Contents/MacOS/giteye`; move the app to its permanent location first.
- **Windows:** run `giteye.exe --install-cli` (or use Settings). Installs
  `%LOCALAPPDATA%\\GitEye\\bin\\giteye.cmd`, usable as `giteye` from a terminal.
  In PowerShell, invoke a quoted executable path with `&`.
- The launcher preserves arguments and the calling directory. It does not
  replace Git or add an alias named `git`.
- GitEye never silently changes PATH or shell profiles. If the directory is not
  on PATH, setup displays exact shell instructions (sh/bash/zsh or fish), or
  Windows **User variables → Path** instructions. Open a new terminal afterward.
- Existing unrelated commands and symlinks are never overwritten or removed.
  Uninstall removes only GitEye's marked launcher, leaving the app, neighboring
  files, directories, PATH entries, and shell profiles untouched.

Keep the app in the location used during setup. If you move it, use **Reinstall
CLI** in Settings or rerun `--install-cli` from its new location.


---

## Known Limitations (Phase 1)

- **Limited custom command execution**: The command log records GitEye-triggered jobs only; arbitrary custom Git command execution is not exposed.
- **Limited credential handling**: SSH key management and `credential.helper` configuration are wired, but GitEye does not display, store, or prompt for credential secrets.
- **Diff renderer uses fallback**: `@pierre/diffs` is installed but not yet wired in. The current diff view is a custom unified renderer without Shiki syntax highlighting. See `docs/architecture/library-decisions.md` for integration plan.
- **Settings persistence scope**: Theme and diff mode persist in app state; repository identity writes to local Git config. Native app-level settings export/import is not implemented.

---

## Verification Results

| Check | Status |
|---|---|
| `bun install` | ✓ |
| `bunx tsc` (TypeScript) | ✓ 0 errors |
| `bunx vite build` (Vite) | ✓ |
