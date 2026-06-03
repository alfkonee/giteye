# GitEye — Library Decisions

Version: 1.0.0 — Phase 1 Foundation
Date: 2026-06-02

---

## 1. Diff Viewer

### Options Considered

| Library | Approach | Pros | Cons | Verdict |
|---|---|---|---|---|
| **@pierre/diffs** | Shiki-native React components; split/unified/inline; virtualization; worker-pool highlighting | First-class Shiki integration; split + unified; active maintenance (v1.2.7, Jun 2026); Apache-2.0; ~4.9k stars; `@pierre/diffs/react` entry point; `Virtualizer` component; SSR helpers | ~1.79 MB min+gzip; relatively young (v1.x); docs are thin but functional; monorepo with other packages | **ACCEPTED** |
| Monaco Editor diff editor | Full IDE diff widget | Extremely mature; side-by-side + inline; proven | Massive bundle (5+ MB); complex Tauri webview integration; heavy DOM overhead; overkill for read-only diff viewing | REJECTED |
| CodeMirror 6 | Extension-based diff with `@codemirror/merge` | Modular; lightweight core; good for editors | Diff merge extension is experimental; no built-in syntax highlighting without separate language packages; more work to wire up | FALLBACK |
| react-diff-viewer | Simple React component with pluggable highlighting | Lightweight; easy to use | No Shiki integration; requires manual `renderContent` wiring; unmaintained (last publish 2020) | REJECTED |
| react-diff-viewer-continued | Fork of react-diff-viewer | Slightly more maintained | Same limitations; no Shiki; less polished | REJECTED |
| Custom unified renderer | Manual line-by-line diff coloring | Zero dependencies; full control | No syntax highlighting; poor scaling for large diffs; reinventing wheels | EMERGENCY FALLBACK ONLY |

### @pierre/diffs Detailed Assessment

**Version**: 1.2.7 (released Jun 1, 2026)
**License**: Apache-2.0
**Repository**: github.com/pierrecomputer/pierre (4.9k stars, 133 forks, 881 commits)
**Bundle size**: ~1.79 MB min+gzip (approximate from v1.2.4; may vary with tree-shaking)
**Dependencies**: `@pierre/theme`, `@shikijs/transformers`, `diff`, `hast-util-to-html`, `lru_map`, `shiki`

**Phase 1 relevant capabilities**:
- `PatchDiff` component for unified patch strings → directly consumable from our `git diff` output
- `MultiFileDiff` for side-by-side file comparisons
- `FileDiff` for single-file diff viewing
- Built-in `Virtualizer` for large diffs
- Shiki-based syntax highlighting from file extension
- Dark theme support (github-dark, etc.)
- React entry point: `@pierre/diffs/react`

**Decision**: Use `@pierre/diffs` as the primary diff renderer in Phase 1.

**Integration strategy**:
- Isolate all `@pierre/diffs` imports behind `components/diff-viewer/PierreDiffViewer.tsx`
- Public API: `components/diff-viewer/DiffViewer.tsx`
- Fallback: `components/diff-viewer/UnifiedDiffFallback.tsx` (plain text diff coloring)
- The rest of GitEye depends only on `DiffViewer`, never on `@pierre/diffs` directly

**Fallback plan**:
- If `@pierre/diffs` fails to integrate (Tauri webview compatibility, bundle issues, API breaks):
  1. Switch `DiffViewer.tsx` to use `UnifiedDiffFallback.tsx`
  2. Record the blocker
  3. Revisit CodeMirror 6 merge extension
- `UnifiedDiffFallback` renders colored +/- lines without syntax highlighting — adequate for Phase 1

**Future migration path**: The `DiffViewer` abstraction means we can swap the rendering engine without touching any consumer component.

---

## 2. Code Rendering & Syntax Highlighting

### Decision: Shiki (via @pierre/diffs)

Shiki is included as a transitive dependency of `@pierre/diffs`. No separate highlighting library is needed in Phase 1.

If we ever need standalone code rendering (not diff), we'll evaluate Shiki directly or `@pierre/diffs`'s `CodeView` component.

---

## 3. Git Operations from Rust

### Options Considered

| Library | Approach | Pros | Cons | Verdict |
|---|---|---|---|---|
| **git2-rs** (libgit2 bindings) | C library FFI | Fast; no external process; full Git API | Complex linking; cross-compilation pain; libgit2 version coupling; memory safety across FFI boundary | PARTIAL |
| **Git CLI** (`std::process::Command`) | Execute `git` binary | Always matches user's Git; zero linking; simple; works everywhere | Process overhead per call; parsing output; depends on Git being installed | **PRIMARY** |
| gitoxide (gix) | Pure Rust Git implementation | No C deps; fast; idiomatic Rust | Still maturing; some commands not yet implemented; different behavior edge cases | FUTURE |

### Decision: Git CLI as primary, with git2-rs for optional acceleration

**Phase 1 approach**:
- Use `std::process::Command` for ALL Git operations
- Parse structured output (`--porcelain=v1`, `--format=...`)
- Check for Git installation at startup and return helpful error
- Support paths with spaces via argument arrays (never shell strings)
- Build a `GitCli` service that wraps command execution with consistent error handling

**Rationale**:
- No cross-compilation pain on Windows/macOS/Linux
- Guaranteed compatibility with the user's Git version
- Easier to debug (users can run the same commands manually)
- Production Git GUIs (GitFork, GitKraken, Sourcetree) all use Git CLI for core operations
- libgit2 can be introduced later for performance-critical paths (e.g., large repo status)

**Safety rules**:
- `Command::new("git")` — never shell strings
- `.args([...])` — never `.arg("commit -m '...'")`
- `.current_dir(repo_path)` — set working directory, don't prefix paths
- Capture stdout + stderr separately
- Timeout for long-running commands (future Phase)

---

## 4. Virtualized Lists for Large Commit Histories

### Options Considered

| Library | Pros | Cons | Verdict |
|---|---|---|---|
| **TanStack Virtual** | Headless; framework-agnostic; lightweight; excellent scroll performance; maintained by TanStack team | Requires manual DOM measurement; slightly more boilerplate than react-window | **ACCEPTED** |
| react-window | Battle-tested; simple API; fixed/variable height rows | Less flexible than TanStack Virtual; 3rd party (not TanStack ecosystem) | REJECTED |
| @tanstack/react-virtual | TanStack Virtual v3's React adapter | Same as TanStack Virtual | ALIAS |
| react-virtuoso | Autosizing; easy to use; good for chat/messages | Less control over item rendering; heavier | REJECTED |

### Decision: TanStack Virtual (@tanstack/react-virtual)

Chosen for its headless design, integration with the TanStack ecosystem (already using TanStack Query), and flexible measurement model.

---

## 5. Resizable Desktop-Style Panes

### Options Considered

| Library | Pros | Cons | Verdict |
|---|---|---|---|
| **react-resizable-panels** | Lightweight; imperatively controllable; pixel + percentage modes; persistence; accessible; active maintenance (bvaughn) | Slightly verbose API for complex nested layouts | **ACCEPTED** |
| allotment | Simple; good defaults | Less flexible; less popular | REJECTED |
| Custom CSS grid | Zero dependencies | Hard to make resizable; wheel reinvention | REJECTED |

### Decision: react-resizable-panels

Best fit for a desktop-style split-pane layout. Supports the classic Git GUI 3-panel layout (sidebar | main | details) with smooth resizing.

---

## 6. Command Palette Support

### Options Considered

| Library | Pros | Cons | Verdict |
|---|---|---|---|
| **cmdk** | Beautiful; accessible; Radix-compatible; popular (Vercel, Raycast style) | Adds bundle weight if not used heavily | **Phase 2** |
| kbar | Feature-rich; good docs | Heavier than cmdk; more opinionated | REJECTED |
| Custom | Full control | Wheel reinvention | REJECTED |

### Decision: cmdk — Phase 2

Not installed in Phase 1. The command palette is a Phase 2 feature. We'll design the command registry to be cmdk-compatible from the start.

---

## 7. State Management

### Options Considered

| Library | Pros | Cons | Verdict |
|---|---|---|---|
| **Zustand** | Tiny (1 KB); hooks-based; no providers; excellent TypeScript support; works outside React; middleware (persist, devtools) | Less structured than Redux (pro for our use case) | **ACCEPTED** |
| Jotai | Atomic; composable | More complex mental model for simple app state | REJECTED |
| Redux Toolkit | Structured; devtools; middleware | Heavy; overkill for a desktop app with Tauri backend | REJECTED |
| React Context | Built-in | Re-render issues; no devtools; boilerplate | REJECTED |

### Decision: Zustand

For UI/app state (active repo, selected commit, sidebar collapsed, theme, active view). Not for server/async state — that's TanStack Query's job.

---

## 8. Async Data Fetching

### Options Considered

| Library | Pros | Cons | Verdict |
|---|---|---|---|
| **TanStack Query** | Caching; refetching; stale-while-revalidate; mutations; devtools; excellent TypeScript | Requires query key discipline | **ACCEPTED** |
| SWR | Simple; stale-while-revalidate | Less feature-rich than TanStack Query; fewer mutation helpers | REJECTED |
| RTK Query | Integrated with Redux | Requires Redux; heavier | REJECTED |
| Manual fetch + useState | Zero dependencies | Reinventing caching, dedup, invalidation | REJECTED |

### Decision: TanStack Query (@tanstack/react-query)

All Tauri `invoke` calls for Git data go through TanStack Query. Provides caching, background refetch, and optimistic updates for mutations (stage/unstage/commit).

---

## 9. Local App Persistence

### Options Considered

| Library | Pros | Cons | Verdict |
|---|---|---|---|
| **Tauri app data dir + JSON** | Simple; cross-platform; no dependencies; Tauri provides `app_data_dir` API | Manual serialization; no query capability | **ACCEPTED (Phase 1)** |
| SQLite | Queryable; robust; good for large data | Overkill for recent repos + settings; adds complexity; needs migration management | Phase 3+ |
| Tauri store plugin | Key-value; Tauri-maintained | Requires plugin installation; extra build deps | ALTERNATIVE |
| LocalStorage (web) | Simple | Not appropriate for desktop app data; cleared easily | REJECTED |

### Decision: Tauri app data directory with JSON files

Phase 1 stores:
- `recent_repositories.json` — array of `{ path, name, last_opened_at }` (max 20)
- `settings.json` — user preferences (theme, git path, identity)

Implementation: `src-tauri/src/storage.rs` with serde serialization.

---

## 10. UI Component Primitives

### Options Considered

| Library | Pros | Cons | Verdict |
|---|---|---|---|
| **Radix UI primitives** | Accessible; unstyled; composable; excellent for desktop | More setup than styled libraries | **ACCEPTED (selective)** |
| shadcn/ui | Beautiful defaults; built on Radix; Tailwind | Adds many files; opinionated styling | STYLE INSPIRATION ONLY |
| Headless UI | Tailwind team; accessible | Fewer primitives than Radix; React-only | REJECTED |
| Ariakit | Accessible; lightweight | Less popular; smaller community | REJECTED |

### Decision: Radix UI primitives selectively, with custom Tailwind styling

We use Radix for complex interactive components (dialogs, popovers, dropdown menus, tooltips, toggles). We do NOT copy shadcn/ui source files — we style Radix primitives directly with Tailwind, following the GitFork/Fork dark aesthetic.

Not using Radix for: buttons, inputs, badges — these are simple enough to style directly with Tailwind.

---

## Dependency Summary

### Frontend (package.json)

| Package | Version | Purpose | Phase |
|---|---|---|---|
| react | ^19 | UI framework | 1 |
| react-dom | ^19 | DOM rendering | 1 |
| @tauri-apps/api | ^2 | Tauri IPC | 1 |
| @tauri-apps/plugin-dialog | ^2 | Native file dialogs | 1 |
| @tauri-apps/plugin-shell | ^2 | Shell access | 1 |
| zustand | ^5 | UI state | 1 |
| @tanstack/react-query | ^5 | Async state | 1 |
| @tanstack/react-virtual | ^3 | Virtualized lists | 1 |
| react-resizable-panels | ^2 | Split panes | 1 |
| @pierre/diffs | ^1.2.7 | Diff rendering | 1 |
| lucide-react | ^0.400+ | Icons | 1 |
| clsx | ^2 | Classname utils | 1 |
| tailwind-merge | ^2 | Tailwind class merging | 1 |
| zod | ^3 | Validation | 1 |
| @radix-ui/react-dialog | ^1 | Dialog primitive | 1 |
| @radix-ui/react-dropdown-menu | ^2 | Dropdown menus | 1 |
| @radix-ui/react-tooltip | ^1 | Tooltips | 1 |
| @radix-ui/react-toggle | ^1 | Toggle buttons | 1 |
| @radix-ui/react-scroll-area | ^1 | Custom scrollbars | 1 |

### Dev Dependencies

| Package | Purpose |
|---|---|
| @tauri-apps/cli | Tauri build/dev CLI |
| typescript | Type checking |
| vite | Build tool |
| @vitejs/plugin-react | Vite React plugin |
| tailwindcss | CSS framework |
| @tailwindcss/vite | Tailwind Vite plugin (v4) |
| @types/react | React types |
| @types/react-dom | React DOM types |

### Backend (Cargo.toml)

| Crate | Purpose | Phase |
|---|---|---|
| tauri | Tauri framework | 1 |
| tauri-build | Build script | 1 |
| serde | Serialization | 1 |
| serde_json | JSON | 1 |
| thiserror | Error types | 1 |
| chrono | Timestamps | 1 |
| directories | App data paths | 1 |
| git2 | Optional libgit2 (unused in Phase 1) | 2+ |

### Rust Crates NOT used in Phase 1

- `git2` — deferred; CLI is sufficient for Phase 1
- `tokio` — deferred; no async Rust commands needed yet
- `rusqlite` — deferred; JSON files for Phase 1

---

## Architecture Patterns

### Frontend Layering

```
Components (UI only, no data fetching)
    ↓
Hooks (TanStack Query wrappers)
    ↓
Tauri API wrapper (typed invoke calls)
    ↓
Tauri IPC bridge (@tauri-apps/api)
    ↓
Rust commands (thin wrappers)
    ↓
Rust services (Git CLI logic)
    ↓
Rust models (serializable data)
```

### State Ownership

- **Server state** (Git data): TanStack Query — cache, refetch, invalidate
- **UI state** (selections, views): Zustand — active repo, selected commit, sidebar
- **Form state** (commit message): React useState
- **Persistence** (recents, settings): Rust storage module + Tauri commands

### Component Rules

1. Components in `components/` MUST NOT import from `features/`
2. Components in `components/` MUST NOT call Tauri commands directly — use hooks
3. Hooks in `hooks/` CAN import from `lib/tauri-api.ts` and `stores/`
4. `stores/` CAN import from nothing except Zustand and types
5. `lib/tauri-api.ts` is the single source of truth for Tauri command names
