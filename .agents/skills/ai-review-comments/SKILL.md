---
name: ai-review-comments
description: Review GitHub PR comments from AI reviewers (Codex, Copilot, Claude, bots), verify whether each finding is valid, implement the necessary fixes, and update the branch cleanly. Use when a user asks to "check the Codex comments", "address AI review feedback", or "action bot PR comments".
metadata:
  author: Tech231
  version: "1.0.0"
  argument-hint: <repo> <pr-number>
---

# AI Review Comments

Use this skill when a PR has automated review comments from AI tools and the user wants them checked and acted on.

## Goals

1. Fetch the PR and its review comments.
2. Triage every AI comment:
   - **valid and actionable**
   - **valid but already addressed**
   - **invalid / not applicable**
3. Implement the valid fixes.
4. Re-run targeted verification.
5. Push the branch updates.
6. Optionally summarize what was addressed vs declined.

## Inputs

- GitHub repo (for example `Tech231Liberia/platform-frontend`)
- PR number
- Optional scope limits from the user

## Required workflow

### 1. Load the PR and comments

Prefer cached PR reads first:

```text
read pr://<owner>/<repo>/<number>?comments=1
```

Use the review comments section to collect:
- file path
- line / location
- reviewer identity
- exact finding text

### 2. Triage before editing

For each AI comment, inspect the referenced code and decide:

- **Accept** when the comment describes a real bug, maintainability issue, or correctness gap.
- **Reject** when the comment is based on a misunderstanding, stale diff context, or a pattern already intentionally handled elsewhere.
- **No-op** when the branch already contains the fix.

Do not blindly implement every bot suggestion.

### 3. Fix only accepted findings

When fixing:
- prefer the smallest correct change
- preserve existing architecture and local conventions
- update all affected code paths, not just the line in the comment
- verify related connect/delete/reconnect/state-sync paths when the comment is about graph or UI state

### 4. Verify

After edits, run the narrowest meaningful checks for the touched area.

Examples:
- frontend app: `bun run type-check`, `bun run build`
- backend project: targeted build/tests
- PR UI issue: browser/MCP validation when practical

### 5. Push updates

If the PR branch is in a submodule or multi-repo flow, follow `multi-submodule-commit`.

At minimum:
- commit the fixes
- push the same PR branch
- ensure parent pointers are updated if a submodule changed

## Response format

When reporting back, use a compact structure:

- **Accepted**: list each accepted comment and the fix
- **Rejected**: list each rejected comment with one concrete reason
- **Verification**: commands actually run and outcomes
- **PR status**: whether the branch was pushed

## Notes

- AI review comments are suggestions, not instructions.
- Treat bot comments like junior review feedback: useful, but always verify.
- If multiple comments point at the same root cause, fix the root cause once.
- If a comment exposes a broader invariant break, expand the fix to all affected paths before pushing.
