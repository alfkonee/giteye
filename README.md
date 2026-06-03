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
│   │   ├── AppShell.tsx      │   ├── remotes.rs
│   │   ├── Toolbar.tsx       │   └── diff.rs
│   │   ├── Sidebar.tsx       ├── git/
│   │   └── PanelLayout.tsx   │   ├── cli.rs
│   ├── repository/           │   ├── repository_service.rs
│   ├── working-tree/         │   ├── status_service.rs
│   ├── commit-history/       │   ├── commit_service.rs
│   ├── diff-viewer/          │   ├── branch_service.rs
│   ├── branches/             │   ├── remote_service.rs
│   ├── settings/             │   └── diff_service.rs
│   └── common/               ├── models/
├── hooks/                    ├── errors.rs
├── stores/                   ├── state.rs
├── types/                    ├── storage.rs
└── lib/                      ├── lib.rs
                              └── main.rs
```

---

## Implemented Features (Phase 1)

### Git Operations
- **Repository**: Open local repo, repo info (branch, clean/dirty, HEAD), recent repos
- **Status**: Full status via `git status --porcelain=v1`, staged/unstaged file lists
- **Working Tree**: Stage/unstage individual files, stage all, unstage all
- **Commit**: Commit with message (Ctrl+Enter)
- **Branches**: List branches, checkout, create, delete (with confirmation)
- **Commits**: History with virtualization, commit details, changed file list
- **Remotes**: List, fetch, pull, push (stubbed — see limitations)
- **Diff**: File diff (working tree and staged), commit diff, binary detection

### UI
- Dark-first developer aesthetic (Catppuccin Mocha-inspired palette)
- Welcome screen with recent repositories
- Resizable 3-panel layout (sidebar | main content | detail pane)
- Collapsible sidebar with branch list
- Toolbar showing repo name, branch, clean/dirty status
- Commit history with TanStack Virtual for large lists
- Diff viewer with syntax-colored unified diff fallback
- File status badges (M/A/D/R/C/!/??/!!/T)
- Settings placeholder (theme, identity, git path)
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
| GitHub/GitLab/Bitbucket integrations | Phase 2+ |
| Pull request / merge request views | Phase 2+ |
| Merge workflows | Phase 2+ |
| Rebase workflows | Phase 2+ |
| Conflict resolution UI | Phase 2+ |
| Stash management | Phase 2+ |
| Tag management | Phase 2+ |
| AI-assisted commit messages | Phase 2+ |
| Credential manager | Phase 2+ |
| SSH key manager | Phase 2+ |
| Command palette (cmdk) | Phase 2+ |
| Side-by-side diff | `@pierre/diffs` integration |
| Full commit graph | Future |
| Worktrees | Future |
| Submodules | Future |
| Git LFS | Future |
| CI status | Future |
| Theme switching (light/dark) | Settings placeholder only |
| Async/cancellable Git operations | Synchronous in Phase 1 |

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
bun run tauri build
```

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

- **No async Git operations**: Long-running commands (clone, large diffs) block the UI. Tauri 2 supports async commands — this is a deliberate Phase 1 simplification.
- **No credential handling**: `fetch`, `pull`, and `push` to authenticated remotes require credentials configured in Git (SSH agent, credential helper). Native GitEye credential prompts are not yet implemented.
- **Diff renderer uses fallback**: `@pierre/diffs` is installed but not yet wired in. The current diff view is a custom unified renderer without Shiki syntax highlighting. See `docs/architecture/library-decisions.md` for integration plan.
- **No file watcher**: Git status doesn't auto-refresh on file system changes. Use the refresh button.
- **Settings are placeholders**: Theme, identity, and Git path settings are read-only UI. Persistence to `settings.json` is planned.

---

## Verification Results

| Check | Status |
|---|---|
| `bun install` | ✓ |
| `bunx tsc` (TypeScript) | ✓ 0 errors |
| `bunx vite build` (Vite) | ✓ |