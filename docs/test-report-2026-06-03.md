# GitEye Test Report — 2026-06-03

## Scope

Validated the current GitEye implementation after the design-system/reference work and Tauri MCP Bridge setup. Testing covered build checks, Rust checks/tests, runtime port ownership, MCP bridge access, Repo Hub and workspace UI flows, seeded QA repositories, read-only IPC commands, logs, and screenshots.

## Environment

- Workspace: `/home/alfkonee/Code/GitEye`
- Runtime command: `bun run tauri dev`
- Frontend/Vite listener: `127.0.0.1:1420`
- Tauri MCP Bridge listener: `0.0.0.0:9223`
- MCP app identifier: `com.giteye.app`
- QA seed root: `.giteye-qa/`

## Automated checks

| Check | Result | Notes |
|---|---:|---|
| `bun run build` | Passed | TypeScript and Vite production build completed. Vite emitted chunk-size warnings for large generated chunks. |
| `cargo check` in `src-tauri` | Passed | Existing dead-code warnings only: unused `AppError` variants, `GitCli::run_lines`, and `AppState.active_repo_path`. |
| `cargo test` in `src-tauri` | Passed | 8 tests passed across 3 suites. |

## Runtime and port checks

| Port | Result | Owner |
|---:|---:|---|
| `1420` | Listening | `node /home/alfkonee/Code/GitEye/node_modules/.bin/vite` from `/home/alfkonee/Code/GitEye` |
| `9223` | Listening | `target/debug/giteye dev --no-default-features --color always --` from `/home/alfkonee/Code/GitEye/src-tauri` |
| `5173` | Clear | No listener observed. |
| `5174` | Clear | No listener observed. |

MCP driver status reported an active connection to `com.giteye.app` at `127.0.0.1:9223`.

## UI/runtime flows

| Flow | Result | Evidence |
|---|---:|---|
| Repo Hub loads | Passed | Runtime title/body identified as GitEye; stale Eduvia content was not present. |
| Open repository from Repo Hub path input | Passed | Opened seeded QA repositories through the visible path input and Open button. |
| Dirty working tree | Passed | `.giteye-qa/dirty-repo` showed `3 files`, `1 staged · 2 unstaged`, with `staged.txt`, `src.js`, and `untracked.txt`. |
| Commit form guard | Passed | Commit button remained disabled when the summary field was empty. |
| Commit history | Passed on seeded repo | `.giteye-qa/dirty-repo` displayed 2 commits; `.giteye-qa/clean-repo` returned 1 commit through IPC. |
| Worktrees screen | Passed | `.giteye-qa/worktree-repo` displayed 2 worktrees: current `main` clean worktree and `feature/worktree` modified linked worktree. |
| Submodules screen | Passed with UI formatting note | `.giteye-qa/submodule-parent` displayed `libs/child`, 1 submodule, behind-by-1 state, and update actions. The status label rendered as raw `UpdatesAvailable` rather than a spaced human label. |
| Rebase conflict resolver | Passed | `.giteye-qa/conflict-repo` displayed active rebase state, `conflict.txt`, 3-way panes, conflict markers in result, progress `On commit 1 of 1`, and action footer. |
| Rebase action guards | Passed | `Abort Rebase` and `Skip Commit` invoked confirmation prompts; prompts were cancelled during test. `Continue Rebase` was disabled while conflicts remained. |

## Read-only IPC probes

All probes were executed through `window.__TAURI__.core.invoke` over the running MCP-inspected app.

| Command | Repo | Result |
|---|---|---:|
| `list_recent_repositories` | app storage | Passed: recent list included `dirty-repo`, `GitEye`, and `Platform`. |
| `get_repository_info` | `clean-repo` | Passed: `main`, clean, valid HEAD hash. |
| `get_status` | `clean-repo` | Passed: 0 status entries. |
| `list_branches` | `clean-repo` | Passed: current `main` branch. |
| `get_commit_history` | `clean-repo` | Passed: 1 commit, `Initial commit`. |
| `get_repository_info` | `dirty-repo` | Passed: `main`, dirty, valid HEAD hash. |
| `get_status` | `dirty-repo` | Passed: 3 entries: modified `src.js`, staged added `staged.txt`, untracked `untracked.txt`. |
| `get_staged_files` | `dirty-repo` | Passed: 1 staged file, `staged.txt`. |
| `get_unstaged_files` | `dirty-repo` | Passed: 2 unstaged files, `src.js` and `untracked.txt`. |
| `get_file_diff` | `dirty-repo/src.js` | Passed: non-binary diff returned, length 147 bytes. |
| `list_worktrees` | `worktree-repo` | Passed: 2 worktrees, clean current `main` and modified `feature/worktree`. |
| `list_submodules` | `submodule-parent` | Passed: 1 initialized submodule `libs/child`, status `UpdatesAvailable`, behind 1. |
| `get_rebase_state` | `conflict-repo` | Passed: active rebase, step 1 of 1, 1 conflict `conflict.txt`. |
| `get_conflict_content` | `conflict-repo/conflict.txt` | Passed: base/ours/theirs/result panes returned; result contains conflict markers. |
| `get_repository_github_overview` | `clean-repo` | Passed: returned an empty overview for the local-only repository. |

## Logs and screenshots

Console logs observed:

- MCP console capture initialized.
- MCP Bridge ready.
- Vite connected.
- IPC monitoring started.
- No runtime console errors were present in the captured console log window.

Screenshots captured during this validation:

- `artifacts/screenshots/giteye-conflict-runtime-check.png`

Earlier runtime screenshots from the same validation session are also present under `artifacts/screenshots/`, including baseline Repo Hub/workspace captures.

## Findings

1. Functional validation passed across build, Rust checks/tests, live app launch, MCP bridge access, seeded repository workflows, and read-only backend IPC probes.
2. The app is still running and correctly owns ports `1420` and `9223`; no competing listeners were observed on `5173` or `5174`.
3. The submodule screen exposes the raw enum label `UpdatesAvailable`; this is a UI polish issue, not a backend failure.
4. Vite build succeeded but emitted large-chunk warnings, mostly from syntax/diff-related assets.
5. Rust checks succeeded with existing dead-code warnings.
