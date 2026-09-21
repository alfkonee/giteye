# Contributing to GitEye

Thank you for improving GitEye. Contributions of code, documentation, design feedback, testing, and issue triage are welcome.

## Before you start

- Read and follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Search [open issues](https://github.com/alfkonee/giteye/issues) and pull requests before starting duplicate work.
- For a substantial feature or architectural change, open an issue first so maintainers and contributors can align on scope.
- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Development setup

Install [Bun](https://bun.sh/), stable [Rust](https://www.rust-lang.org/tools/install), Git, and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform.

```sh
git clone https://github.com/alfkonee/giteye.git
cd giteye
bun install --frozen-lockfile
bun run tauri
```

Useful commands:

```sh
bun run test
bun run build
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
bun run qa:seed
```

See [docs/manual-qa.md](docs/manual-qa.md) for stateful desktop scenarios. Run the checks relevant to your change before opening a pull request. UI changes should include a screenshot or short recording and a description of the interaction tested.

## Making a change

1. Fork the repository and create a focused branch from `main`.
2. Keep changes small enough to review. Avoid unrelated formatting or refactoring.
3. Follow existing React, TypeScript, Rust, and UI patterns.
4. Add or update tests when the change introduces behavior with a plausible regression case.
5. Update user-facing documentation when commands, settings, installation, or workflows change.
6. Use clear commit messages; Conventional Commit prefixes such as `feat:`, `fix:`, `docs:`, and `chore:` are preferred.

GitEye performs destructive Git actions. Changes touching checkout, reset, clean, stash, merge, rebase, worktrees, submodules, credentials, or filesystem paths must preserve user data by default and include explicit failure/recovery verification.

## Pull requests

A pull request should:

- explain the problem and the chosen solution;
- link related issues;
- list the exact verification performed;
- call out platform-specific behavior or untested platforms;
- include before/after evidence for visible UI changes;
- avoid committing generated build output, credentials, personal repository paths, or test fixtures containing private data.

Maintainers may request changes or close work that conflicts with project direction, duplicates an existing solution, or cannot be maintained safely.

## Licensing

By submitting a contribution, you agree that it is licensed under the repository's [Apache License 2.0](LICENSE). Do not contribute code or assets you do not have permission to license on those terms. Identify third-party material and its license in the pull request.
