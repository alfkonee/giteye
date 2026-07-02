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

---

## Implemented Features (Phase 1)

### Git Operations
- **Repository workspace**: Open multiple local repos, switch between top-level repo tabs, preserve per-repo view/selection state, repo info (branch, clean/dirty, HEAD), recent repos
- **Status**: Full status via `git status --porcelain=v2`, staged/unstaged file lists
- **Working Tree**: Stage/unstage individual files, stage all, unstage all
- **Commit**: Commit with message (Ctrl+Enter)
- **Branches**: List branches, checkout, create, fast-forward from upstream, merge into current branch, delete (with confirmation)
- **Commits**: History with virtualization, commit details, changed file list
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
- **GitHub CI status**: Inspect workflow check runs for the current branch and selected pull request, including pass/fail/pending buckets, workflow grouping, duration metadata, filtering, and direct check links

### UI
- Dark-first developer aesthetic (Catppuccin Mocha-inspired palette)
- Welcome screen with recent repositories and open repository sessions
- Top repository tabs for multi-repo workflows with branch, dirty, and running-job badges
- Resizable 3-panel layout (sidebar | main content | detail pane)
- Collapsible sidebar grouped around core local Git views, with collaboration/provider views separated from local workflows
- Toolbar showing repo name, branch, clean/dirty status, remote status shortcut, and diff mode toggle
- Toolbar command search executes local navigation, refresh, remote sync, and diff-mode actions
- In-app command log drawer for GitEye-triggered background job metadata, stdout/stderr, final status, and output clearing
- Commit history with TanStack Virtual for large lists
- Diff viewer with syntax-colored unified diff fallback
- File status badges (M/A/D/R/C/!/??/!!/T)
- Settings wire theme, diff mode, per-repository Git author identity, credential helper config, and local SSH key management; Git path remains informational
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
| Command palette (cmdk) | Phase 2+ |
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
bun run tauri dev
```

### Build Desktop App

```bash
bun run tauri:build
```

### Build Linux AppImage

```bash
bun run build:appimage
```

The AppImage is written to `src-tauri/target/release/bundle/appimage/`. The GitHub Actions workflow at `.github/workflows/release.yml` runs when a GitHub Release is published, builds Linux, Windows, and macOS bundles, and uploads the generated artifacts to that release.

### Typecheck & Lint

```bash
# Frontend
bunx tsc

# Backend
cd src-tauri && cargo check && cargo fmt --check
```

---

## How to Open a Repository

1. Launch GitEye (`bun run tauri dev`)
2. On the Welcome screen, either:
   - Type/paste a repository path and click **Open**
   - Click the folder icon to browse with the native file dialog
3. The repository loads and displays the Working Tree view
4. Switch between Working Tree, History, and Settings via the sidebar


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