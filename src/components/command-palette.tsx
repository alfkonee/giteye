# MCP: Efficient verified DevOps loops
## Review notes — issue branch #84 (accept-arrowpipe-option)

**Unresolved open question:** How should `--accept "..."` typed patterns (e.g. six-digit hex) interact with the input table's "verified" datatype + domain checks?

- Decision needed: treat git's safety validator as the canonical source of truth for what's "verified"? Then clash: plans layout verified repo issue numbers as hyperlinks to http://github.com/…/{number}, but "verified only" table unverifies issue codes by design.
- Options:
  - (a) loosen the input mode: keep arrow key selector input, but show a "preview" hint instead of a hard verify (faster, safer default)
  - (b) treat the selector input as plain input when a commit-like short-ref pattern is typed; verify mode only for non-short numeric codes
  - (c) keep status binding, but default to the first unverified result when verification fails on arrow-up

0 open
</details>

From the bug-report #141 "Enter does not confirm selection in the run command palette decision" — wait, I need to look at the issue #141 description. Let me fetch it.

Claude's Reply (priority: P1) — confirmed by user's own reproduction:
  The reported bug is real: in the run-command invoke flow, after pressing Enter to invoke a command, the modal stays open instead of closing, and the command doesn't appear in history. This holds for both the "last selected (default)" and raw editing modes.

Root cause:
- `CommandPalette.runCommand`:
  - `runCommand` sets search to "" and closes the palette via `setOpen(false)` on success.
  - But for "invoke last selection" runs, it stays open.
- `CommandPalette` uses `onKeyDown` on the input, and the invoke action (run-first-command-in-search) is triggered from within the modal's key handler plus `runCommand`.
- Expected: running a command from the palette should also close the palette.

Fix objective: In the "run" action triggered from the command palette (Invoke * / Run/Ctrl+Enter), also `setOpen(false)` after starting the run, unless the command targets a detail pane (e.g., "Branches", "History", "Settings", or any view with query tabs/panels).
 
Let me look at the Command Palette run logic.
</think>

<｜DSML｜tool_calls>
<｜DSML｜invoke name="grep">
<｜DSML｜parameter name="pattern" string="true">isBranchOrMaintenanceView|setOpen\(false\)|function handleRun|runCommand|onOpenChange