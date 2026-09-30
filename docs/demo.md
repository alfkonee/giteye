# GitEye 5-minute demo

## Setup (before you go on stage)

```sh
bun run demo:seed            # builds ~/giteye-demo (safe to re-run; resets everything)
giteye ~/giteye-demo/acme-shop
```

Everything is offline: `origin` is a local bare repository at `~/giteye-demo/remotes/acme-shop.git`.

What the seed builds in `acme-shop`:

| State | Used for |
|---|---|
| Uncommitted work on `main`: `src/catalog.js` modified in two separate hunks, `src/reviews.js` untracked | Move changes to a branch, hunk staging, commit |
| `feature/catalog-pricing` at the same commit as `main` | Target for **Move changes and switch** |
| `main` one commit behind `origin/main` (teammate pushed `Add contributing guide`) | Background pull + job log |
| `feature/checkout-redesign` conflicts with `main` in `src/cart.js` | Merge preview + conflict resolver |
| `feature/discounts`: `fixup!` commits and a `WIP: debug logging` commit | Rebase plan editor + Autosquash |
| `hotfix/free-shipping-threshold` (one commit) | Cherry-pick from history |
| Stash `WIP: README screenshots` | Stashes |
| Linked worktree `~/giteye-demo/acme-shop-release-1.1` on `release/1.1` | Worktrees |
| Deleted branch `experiment/search` (`Prototype product search`) | Archaeology → Reflog / lost commits |
| `TAX_RATE` added then changed; four authors; tags `v1.0.0`, `v1.1.0` | Blame, pickaxe, history graph |

For the GitHub segment, have `gh auth status` green and the GitEye repository (or any repo with open PRs) already added to the Repo Hub.

Pre-flight: open every view you will use once so data is cached; set the window size; bump font size; close notifications.

## Run of show (5:00)

| Time | Segment | Do | Say |
|---|---|---|---|
| 0:00–0:20 | Hook | Terminal: `giteye ~/giteye-demo/acme-shop`; prompt returns immediately. | "Native desktop Git client — Rust + Tauri, Linux/macOS/Windows. It launches from your terminal and never locks it." |
| 0:20–1:10 | Wrong branch + commit | "Oops, I started on `main`." Double-click `feature/catalog-pricing` → **Move changes and switch**. Stage only the price hunk of `src/catalog.js` → commit "Raise mug price". Stage the rest (the `priceOf` hunk + `src/reviews.js`) → commit. Switch back to `main`. | "Changes follow you safely; stage exactly the lines you mean." |
| 1:10–1:30 | Sync | Pull. Open the job log to show streamed Git output; point out it is cancellable. | "Network work runs in the background, per repo, with real Git output." |
| 1:30–2:30 | Merge + conflicts | Merge `feature/checkout-redesign` into `main`: show the preview first, then run it and resolve `src/cart.js` in the conflict resolver. | "You see what will happen before it happens; conflicts get a real resolver instead of angle brackets." |
| 2:30–3:15 | Clean up history | Switch to `feature/discounts`, start an interactive rebase onto `main`, click **Autosquash**, drop `WIP: debug logging`, run it. | "Interactive rebase without a text editor; fixups fold in with one click." |
| 3:15–3:45 | History surgery | History graph → right-click `Lower free-shipping threshold to 40` → Cherry-pick onto `main`. | "Every destructive action explains the recovery path before you confirm." |
| 3:45–4:15 | Archaeology | Archaeology → Pickaxe `TAX_RATE` (two commits, two authors); then Reflog/Lost → recover `Prototype product search`. | "Nothing you commit is ever really lost, and GitEye can find it." |
| 4:15–4:45 | Worktrees + PRs | Show the `release/1.1` worktree as its own workspace. Switch to the GitHub repo: PR list, checks, timeline, inline diff comment. | "Parallel branches without stashing, and PR review without leaving the client." |
| 4:45–5:00 | Close | Command palette (show it jumps to any action); Settings → About. | "Cross-platform, open source, Apache-2.0 — releases on GitHub." |

## Rules the flow depends on

- Merge, rebase, and cherry-pick require a clean working tree (untracked files count). Commit everything in the 0:20 segment; leaving a hunk behind blocks the merge.
- **Move changes and switch** only works when no dirty file differs between the current and target branch; otherwise Git refuses ("would be overwritten by checkout") and GitEye shows that error with your changes untouched. Use **Stash and switch** in that case.
- `giteye <path>` only returns the prompt when run from a real terminal (TTY). From an editor task or agent shell (no TTY) it runs in the foreground, and cancelling that command closes the app.
- Hunk staging of any hunk except the last one requires a build containing the `buildHunkPatch` fix (after `0.0.3-beta.1`).

## If something goes wrong

- Anything broke mid-demo: `bun run demo:seed`, then reopen — takes about 2 seconds.
- Running long: cut Archaeology, then Worktrees; keep Merge + Rebase — they are the strongest segments.
- No network: skip the PR list; everything else is local.
