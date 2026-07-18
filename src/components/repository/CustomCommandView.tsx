import { useState } from "react";
import { Terminal, Play, RotateCcw } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useAppStore } from "../../stores/app-store";
import { gitApi } from "../../lib/tauri-api";
import { LoadingSpinner } from "../common/LoadingSpinner";

const DESTRUCTIVE_COMMANDS = [
  "push --force", "push -f", "push --force-with-lease",
  "reset --hard", "clean -f", "clean -fd",
  "branch -D", "branch --delete --force",
  "gc --prune", "reflog expire", "reflog delete",
];

function isDestructive(command: string): boolean {
  const lower = command.toLowerCase();
  return DESTRUCTIVE_COMMANDS.some((pattern) => lower.includes(pattern));
}

export function CustomCommandView() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<Array<{ command: string; output: string; success: boolean }>>([]);

  const runMutation = useMutation({
    mutationFn: () => {
      const args = command.trim().split(/\s+/);
      return gitApi.runCustomGitCommand(activeRepoPath!, args);
    },
    onSuccess: (result) => {
      const output = result.success
        ? result.stdout
        : `[stderr] ${result.stderr}\n[stdout] ${result.stdout}`;
      setHistory((prev) => [{ command: command.trim(), output: output.trim() || "(no output)", success: result.success }, ...prev].slice(0, 100));
      setCommand("");
    },
    onError: (error) => {
      setHistory((prev) => [{ command: command.trim(), output: `Error: ${error}`, success: false }, ...prev].slice(0, 100));
      setCommand("");
    },
  });

  const handleRun = () => {
    const trimmed = command.trim();
    if (!trimmed || !activeRepoPath) return;

    if (isDestructive(trimmed)) {
      if (!window.confirm(`This is a destructive command that can permanently delete data:\n\n  git ${trimmed}\n\nRun anyway?`)) {
        return;
      }
    }

    runMutation.mutate();
  };

  if (!activeRepoPath) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="text-center">
          <Terminal className="mx-auto h-8 w-8 text-[var(--color-text-muted)]" />
          <p className="mt-3 text-sm text-[var(--color-text-secondary)]">Open a repository to run git commands.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-primary)]">
      <div className="flex h-11 shrink-0 items-center border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4">
        <h2 className="text-[13px] font-semibold text-[var(--color-text-primary)]">Custom Command</h2>
        <span className="ml-2 text-[11px] text-[var(--color-text-muted)]">Run arbitrary git commands</span>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)] px-4 py-3">
        <Terminal className="h-4 w-4 shrink-0 text-[var(--color-accent)]" />
        <span className="shrink-0 rounded bg-[var(--color-bg-surface)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-muted)]">git</span>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleRun()}
          placeholder="log --oneline -5"
          disabled={runMutation.isPending}
          className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]"
          autoFocus
        />
        <button
          type="button"
          onClick={() => setCommand("")}
          disabled={!command || runMutation.isPending}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-30"
          title="Clear command"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleRun}
          disabled={!command.trim() || runMutation.isPending}
          className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {runMutation.isPending ? <LoadingSpinner size="sm" /> : <Play className="h-3 w-3" />}
          Run
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 font-mono text-[13px]">
        {history.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]">
            <div className="text-center">
              <Terminal className="mx-auto h-6 w-6" />
              <p className="mt-2 text-xs">Enter a git command above and press Enter to run it.</p>
              <p className="mt-1 text-[10px]">Examples: log --oneline -10, status --short, branch -a, diff HEAD~1</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {history.map((entry, i) => (
              <div key={i}>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={entry.success ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}>
                    {entry.success ? "$" : "!"}
                  </span>
                  <span className="text-[var(--color-text-muted)]">git</span>
                  <span className="text-[var(--color-text-primary)]">{entry.command}</span>
                </div>
                <pre className={entry.success
                  ? "mt-1 whitespace-pre-wrap break-all rounded bg-[var(--color-bg-tertiary)] p-3 text-[12px] text-[var(--color-text-secondary)]"
                  : "mt-1 whitespace-pre-wrap break-all rounded border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/5 p-3 text-[12px] text-[var(--color-danger)]"
                }>
                  {entry.output}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
