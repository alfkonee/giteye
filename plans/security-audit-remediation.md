# Security Audit Remediation Plan

## Context

Full security audit of the Tauri 2 app (Rust backend, React frontend, 191 IPC commands) identified one HIGH finding, two MEDIUM findings, and five LOW findings. All findings were verified against source. The single most important item is `run_custom_git_command`, which turns any renderer compromise into host-level arbitrary command execution via git's own argv-driven program execution (`alias.x='!...'`, `core.sshCommand`, `-C` path escape, hook/difftool execution).

Verified findings:

| ID | Severity | Summary | Location |
|---|---|---|---|
| H-1 | HIGH | Renderer-controlled git argv with zero validation → host RCE escalation path | `src-tauri/src/commands/config.rs:154-166` |
| M-1 | MEDIUM | `opener:allow-open-path` granted to main window with no scope restriction | `src-tauri/capabilities/default.json:13-14` |
| M-2 | MEDIUM | Unpinned `continuous` AppImageKit binary downloaded and executed in release pipeline | `.github/workflows/release.yml:108-110` |
| L-1 | LOW | CSP allows remote-origin images (`img-src … https:`); `style-src 'unsafe-inline'` | `src-tauri/tauri.conf.json:26` |
| L-2 | LOW | `mcp-bridge:default` capability granted unconditionally while plugin is debug-only | `src-tauri/capabilities/default.json:16` vs `src-tauri/src/lib.rs:19-20` |
| L-3 | LOW | Toolchain installer digests not independently pinned (git-lfs, micromamba) | `src-tauri/src/git/toolchain_service.rs:275,580` |
| L-4 | LOW | `gh pr edit --add-reviewer <value>` values never checked for leading `-` (flag injection) | `src-tauri/src/git/github_service.rs:384-402` |
| L-5 | LOW | `export_settings`/`import_settings` accept arbitrary renderer-supplied paths | `src-tauri/src/commands/settings_io.rs:31-74` |

Good posture already verified (no action needed): API keys in OS keychain with legacy plaintext auto-migration (`ai_service.rs:330`), no `withGlobalTauri`/devtools/fs/shell capabilities, sanitized Markdown rendering (`Markdown.tsx:25`), credential redaction in job logs (`job_runner.rs:707-712`), scoped workflow token.

> [!IMPORTANT]
> User direction: implement all findings as ranked milestones; H-1 first.

## Approach

Ranked remediation roadmap:

1. **Milestone 1 — close the RCE path (H-1).** Apply the existing `required_git_arg` guard (`cli.rs:326`) to every element of `args` in `run_custom_git_command`: reject empty args and anything starting with `-`; additionally reject the literal subcommand `alias` and reject `-c` as a first argument (it enables `alias.x=!…` and `core.sshCommand` injection). Validate `repo_path` resolves to a directory containing `.git` (or is a registered open repository) so `-C`-style escapes are moot once leading `-` is blocked. Add unit tests covering: alias attempt, `-c` attempt, flag-prefixed arg, valid command passthrough.
2. **Milestone 2 — capability hygiene (M-1, L-2, L-5).** Scope `opener:allow-open-path` by adding a `plugins.opener` scope in `tauri.conf.json` restricted to open-repository paths (or drop it in favor of `revealItemInDir`). Move `mcp-bridge:default` into a separate dev-only capability file gated like the plugin registration. Constrain settings import/export paths to a user-chosen dialog result (frontend already has the dialog plugin) plus backend extension validation.
3. **Milestone 3 — supply-chain pinning (M-2, L-3).** Pin `appimagetool` to a tagged AppImageKit release + SHA256 check before chmod/exec. Independently pin git-lfs/micromamba release URLs + digests outside the API response that serves them.
4. **Milestone 4 — hardening polish (L-1, L-4).** Tighten CSP `img-src` from blanket `https:` to an allowlist of hosts actually needed for remote PR avatars/content (or proxy images through `convertFileSrc`-style local handling). Reuse `required_git_arg` on reviewer/team strings in `request_pull_request_review` and on label/body-adjacent string flags across `github_service.rs`.

## Files to modify

| Milestone | Files |
|---|---|
| 1 | `src-tauri/src/commands/config.rs` (`run_custom_git_command`), new tests near existing command tests, optionally `src-tauri/src/git/cli.rs` for a shared arg-guard helper |
| 2 | `src-tauri/capabilities/default.json`, new `src-tauri/capabilities/dev.json`, `src-tauri/tauri.conf.json` (`plugins.opener` scope), `src-tauri/src/commands/settings_io.rs`, frontend callers in `src/components/settings/SettingsPlaceholder.tsx` |
| 3 | `.github/workflows/release.yml`, `src-tauri/src/git/toolchain_service.rs` |
| 4 | `src-tauri/tauri.conf.json` (CSP), `src-tauri/src/git/github_service.rs` |

## Reuse

- `required_git_arg` (`src-tauri/src/git/cli.rs:326`) — already used at 34 call sites; extend rather than inventing a second validator.
- Existing dry-run/preview pattern in commands mirrors how guarded mutations are structured.
- Capability files under `src-tauri/capabilities/` already split per concern; dev-only gating follows Tauri 2 convention.

## Verification

- Milestone 1: unit tests assert rejection of `-c`, `alias`, leading-dash args, and non-repo paths; manual invoke from devtools console confirms refusal.
- Milestone 2: `cargo tauri dev` still grants opener inside repo dirs and refuses outside ones; release build has no mcp-bridge capability entry.
- Milestone 3: CI run shows digest verification step passing; tampered-artifact test fails the build.
- Milestone 4: render a PR with remote images in review studio — images load only from allowlisted hosts; `gh pr edit` rejects a reviewer value starting with `-`.
