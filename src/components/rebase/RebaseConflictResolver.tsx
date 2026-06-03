import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  FileText,
  GitBranch,
  GitCommitVertical,
  GitCompareArrows,
  GitPullRequestArrow,
  ListChecks,
  MoreHorizontal,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";
import { useConflictContent, useRebaseActions, useRebaseState } from "../../hooks/useAdvancedGit";
import { useAppStore } from "../../stores/app-store";
import type { RebaseTodoItem } from "../../types/git";

const todo = [
  ["pick", "feat(checkout): add payment method step", "a1b2c3d"],
  ["pick", "feat(checkout): add integration tests", "e5f6a7b"],
  ["edit", "feat(checkout): add promo code support", "f6a7b8c"],
  ["squash", "chore: update analytics events", "a7b8c9d"],
  ["drop", "docs: update checkout docs", "b8c9d0e"],
] as const;

const conflictFiles = ["src/components/PromoCode.tsx", "src/lib/analytics.ts", "docs/checkout-flow.md"];
const resolvedFiles = ["src/hooks/useCheckout.ts", "src/types/checkout.d.ts"];

const current = [
  "return (",
  "  <div className=\"promo\">",
  "    <label htmlFor=\"promo\">",
  "      Promo Code",
  "    </label>",
  ">>    <input",
  "      id=\"promo\"",
  "      value={code}",
  "      onChange={(e) => setCode(e.target.value)}",
  "      placeholder=\"Enter code\"",
  "      className=\"input\"",
  "    />",
  "    {error && <p className=\"error\">{error}</p>}",
  "    {success && <p className=\"success\">Code applied!</p>}",
  "  </div>",
  ")",
];

const incoming = [
  "return (",
  "  <div className=\"promo\">",
  "    <label htmlFor=\"promo\">",
  "      Promo code",
  "    </label>",
  ">>    <input",
  "      id=\"promo\"",
  "      value={code}",
  "      onChange={(e) => setCode(e.target.value.trim())}",
  "      placeholder=\"Enter promo code\"",
  "      aria-label=\"Promo code\"",
  "      className=\"input input--promo\"",
  "    />",
  "    {error && <p role=\"alert\" className=\"error\">{error}</p>}",
  "    {success && <p className=\"success\" role=\"status\">Promo code applied successfully</p>}",
  "  </div>",
];

const result = [
  "return (",
  "  <div className=\"promo\">",
  "    <label htmlFor=\"promo\">",
  "      Promo code",
  "    </label>",
  "    <input",
  "      id=\"promo\"",
  "      value={code}",
  "      onChange={(e) => setCode(e.target.value.trim().toUpperCase())}",
  "      placeholder=\"Enter promo code\"",
  "      aria-label=\"Promo code\"",
  "      className=\"input input--promo\"",
  "    />",
  "    {error && <p role=\"alert\" className=\"error\">{error}</p>}",
  "    {success && <p className=\"success\" role=\"status\">Promo code applied successfully</p>}",
  "  </div>",
];

const splitLines = (content: string | null | undefined, fallback: string[]) => {
  if (!content) {
    return fallback;
  }

  return content.split(/\r?\n/);
};

const shortHash = (commit: string) => commit.slice(0, 7);

function DiffPane({ title, rev, lines, tone }: { title: string; rev: string; lines: string[]; tone: "deleted" | "added" | "result" }) {
  const color = tone === "deleted" ? "var(--color-deleted-bg)" : tone === "added" ? "rgba(88,166,255,0.12)" : "var(--color-added-bg)";
  return (
    <div className="min-w-0 overflow-hidden border-r border-[var(--color-border-muted)] last:border-r-0">
      <div className="flex items-center justify-between border-b border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs"><b>{title}</b><span className="font-mono text-[var(--color-text-muted)]">{rev}</span></div>
      <div className="font-mono text-[12px] leading-6">
        {lines.map((line, index) => {
          const conflict = line.startsWith(">>") || line.startsWith("<<<<<<<") || line.startsWith("=======") || line.startsWith(">>>>>>>") || (tone === "result" && index >= 5 && index <= 10);
          return <div key={`${title}-${index}`} className="grid grid-cols-[38px_1fr]" style={{ background: conflict ? color : undefined }}><span className="border-r border-[var(--color-border-muted)] pr-2 text-right text-[var(--color-text-muted)]">{42 + index}</span><span className="overflow-hidden px-3 text-[var(--color-text-secondary)] whitespace-pre">{line.replace(">>", "  ")}</span></div>;
        })}
      </div>
    </div>
  );
}

function ActionPill({ label, active }: { label: string; active?: boolean }) {
  return <button className={`rounded-md border px-2 py-1 text-xs ${active ? "border-[var(--color-accent)] bg-[var(--color-bg-selected)]/20 text-[var(--color-accent)]" : "border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]"}`}>{label}</button>;
}

function TodoRow({ item, index, live }: { item: RebaseTodoItem | (typeof todo)[number]; index: number; live: boolean }) {
  const action = live ? (item as RebaseTodoItem).action : (item as (typeof todo)[number])[0];
  const message = live ? (item as RebaseTodoItem).message : (item as (typeof todo)[number])[1];
  const commit = live ? (item as RebaseTodoItem).commit : (item as (typeof todo)[number])[2];
  const completed = live && (item as RebaseTodoItem).completed;

  return (
    <div className={`grid grid-cols-[28px_72px_1fr_68px] items-center border-t border-[var(--color-border-muted)] px-4 py-3 text-xs ${action === "edit" || (!completed && live) ? "bg-[var(--color-bg-selected)]/15" : ""}`}>
      <span className="font-mono text-[var(--color-text-muted)]">{index + 1}</span>
      <button className="rounded border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-left">{action} <ChevronDown className="float-right h-3 w-3" /></button>
      <span className={`truncate px-2 ${completed ? "text-[var(--color-text-muted)] line-through" : ""}`}>{message}</span>
      <span className="font-mono text-[var(--color-text-muted)]">{shortHash(commit)}</span>
    </div>
  );
}

export function RebaseConflictResolver() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const rebaseStateQuery = useRebaseState(activeRepoPath);
  const rebaseState = rebaseStateQuery.data;
  const hasLiveRebase = Boolean(rebaseState?.inProgress);
  const liveConflictFiles = rebaseState?.conflicts ?? [];
  const [selectedConflictPath, setSelectedConflictPath] = useState<string | null>(null);

  const firstConflictPath = liveConflictFiles[0]?.path ?? null;

  useEffect(() => {
    if (!hasLiveRebase) {
      setSelectedConflictPath(null);
      return;
    }

    if (!selectedConflictPath || !liveConflictFiles.some((file) => file.path === selectedConflictPath)) {
      setSelectedConflictPath(firstConflictPath);
    }
  }, [firstConflictPath, hasLiveRebase, liveConflictFiles, selectedConflictPath]);

  const displayedConflictPath = hasLiveRebase ? selectedConflictPath ?? firstConflictPath : conflictFiles[0];
  const conflictContentQuery = useConflictContent(activeRepoPath, hasLiveRebase ? displayedConflictPath : null);
  const actions = useRebaseActions(activeRepoPath);
  const liveTodo = useMemo(() => [...(rebaseState?.done ?? []), ...(rebaseState?.todo ?? [])], [rebaseState?.done, rebaseState?.todo]);
  const displayedTodo = hasLiveRebase && liveTodo.length > 0 ? liveTodo : todo;
  const displayedConflicts = hasLiveRebase ? liveConflictFiles.map((file) => file.path) : conflictFiles;
  const conflictContent = hasLiveRebase ? conflictContentQuery.data : null;
  const displayedCurrent = hasLiveRebase ? splitLines(conflictContent?.ours, conflictContentQuery.isLoading ? ["Loading current version…"] : ["No current conflict content available."]) : current;
  const displayedIncoming = hasLiveRebase ? splitLines(conflictContent?.theirs, conflictContentQuery.isLoading ? ["Loading incoming version…"] : ["No incoming conflict content available."]) : incoming;
  const displayedResult = hasLiveRebase ? splitLines(conflictContent?.result, conflictContentQuery.isLoading ? ["Loading result version…"] : ["No result conflict content available."]) : result;
  const totalSteps = rebaseState?.totalSteps ?? todo.length;
  const currentStep = rebaseState?.currentStep ?? 3;
  const conflictCount = displayedConflicts.length;
  const isActionPending = actions.continueRebase.isPending || actions.abortRebase.isPending || actions.skipRebase.isPending || actions.markFileResolved.isPending;
  const canMutateRebase = Boolean(activeRepoPath && hasLiveRebase);
  const canMarkResolved = canMutateRebase && Boolean(displayedConflictPath);
  const progressWidth = `${Math.min(100, Math.max(0, (currentStep / Math.max(totalSteps, 1)) * 100))}%`;

  const handleMarkResolved = () => {
    if (!canMarkResolved || !displayedConflictPath) {
      return;
    }

    actions.markFileResolved.mutate(displayedConflictPath);
  };

  const confirmAndAbort = () => {
    if (window.confirm("Abort the active rebase? This returns the repository to its pre-rebase state.")) {
      actions.abortRebase.mutate();
    }
  };

  const confirmAndSkip = () => {
    if (window.confirm("Skip this commit during the active rebase? The commit changes will not be applied.")) {
      actions.skipRebase.mutate();
    }
  };

  const confirmAndContinue = () => {
    if (conflictCount > 0) {
      return;
    }
    if (window.confirm("Continue the active rebase now that no conflicts are reported?")) {
      actions.continueRebase.mutate();
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
        <div><div className="flex items-center gap-2"><h1 className="text-xl font-semibold tracking-tight">Rebase &amp; Conflict Resolver</h1><span className={`rounded px-2 py-1 text-xs ${hasLiveRebase ? "bg-[color:rgba(137,87,229,0.18)] text-purple-400" : "bg-[var(--color-bg-surface)] text-[var(--color-text-muted)]"}`}>{hasLiveRebase ? "Rebasing" : "No active rebase detected"}</span></div><p className="text-sm text-[var(--color-text-secondary)]">{hasLiveRebase ? <>You&apos;re rebasing {totalSteps} commits onto <span className="font-mono">{rebaseState?.onto ?? "upstream"}</span></> : <>Showing reference demo data until a repository reports an active rebase.</>}</p></div>
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-2 text-xs"><GitPullRequestArrow className="h-4 w-4" /> Stacked PR context <ActionPill label="PR #18 Refactor order summary" /><span>→</span><ActionPill label="PR #19 Add promo code support" active /><span>→</span><ActionPill label="PR #20 Add payment method step" /><span className="text-[var(--color-text-muted)]">Base: {hasLiveRebase ? rebaseState?.onto ?? "upstream" : "main"}</span></div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[350px_minmax(700px,1fr)_300px] gap-3 p-3">
        <aside className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border-muted)] px-4 py-3"><h2 className="font-semibold">Interactive rebase todo</h2><ListChecks className="h-4 w-4 text-[var(--color-text-muted)]" /></div>
            <div className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">Rebase {displayedTodo.length} commits <button className="float-right rounded bg-[var(--color-bg-surface)] px-2 py-1">Autosquash</button></div>
            {displayedTodo.map((item, index) => <TodoRow key={hasLiveRebase ? (item as RebaseTodoItem).raw || `${(item as RebaseTodoItem).commit}-${index}` : (item as (typeof todo)[number])[2]} item={item} index={index} live={hasLiveRebase} />)}
            <div className="border-t border-[var(--color-border-muted)] p-4"><div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-3"><div className="text-xs text-[var(--color-text-muted)]">Commit message</div><p className="mt-2 font-mono text-sm">{hasLiveRebase ? (rebaseState?.todo.find((item) => !item.completed)?.message ?? rebaseState?.todo[0]?.message ?? "Waiting for next rebase step") : "feat(checkout): add promo code support"}</p></div><p className="mt-3 text-xs text-[var(--color-text-muted)]">{hasLiveRebase ? "Live todo data is read from the repository rebase state." : "This commit is being edited. You can amend the message and continue."}</p></div>
          </section>

          <section className="min-h-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border-muted)] px-4 py-3"><h2 className="font-semibold">Conflicted files <span className="rounded bg-[var(--color-bg-surface)] px-2 text-xs">{conflictCount}</span></h2><MoreHorizontal className="h-4 w-4" /></div>
            <div className="p-3">{displayedConflicts.map((file, index) => <button key={file} type="button" onClick={() => hasLiveRebase && setSelectedConflictPath(file)} className={`mb-2 flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm ${file === displayedConflictPath || (!displayedConflictPath && index === 0) ? "border-[var(--color-accent)] bg-[var(--color-bg-selected)]/15 text-[var(--color-accent)]" : "border-transparent text-[var(--color-text-secondary)]"}`}><FileText className="h-4 w-4" /><span className="flex-1 truncate">{file}</span><span className="rounded bg-[var(--color-accent)] px-1.5 text-xs text-white">1</span></button>)}{displayedConflicts.length === 0 && <div className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3 text-sm text-[var(--color-text-secondary)]">No conflicted files reported.</div>}<div className="mt-5 text-xs font-semibold text-[var(--color-text-muted)]">No conflicts</div>{!hasLiveRebase && resolvedFiles.map((file) => <div key={file} className="mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--color-text-secondary)]"><FileText className="h-4 w-4" /><span className="flex-1 truncate">{file}</span><CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" /></div>)}</div>
          </section>
          <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4"><div className="text-sm font-semibold">{hasLiveRebase ? `Rebasing onto ${rebaseState?.onto ?? "upstream"}` : "Rebasing onto main"}</div><div className="mt-1 text-sm text-[var(--color-text-secondary)]">Step {currentStep} of {totalSteps} ({conflictCount} conflict{conflictCount === 1 ? "" : "s"})</div><div className="mt-3 h-2 rounded-full bg-[var(--color-bg-surface)]"><div className="h-2 rounded-full bg-[var(--color-success)]" style={{ width: progressWidth }} /></div></section>
        </aside>

        <main className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[var(--shadow-panel)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3"><div className="flex items-center gap-2"><FileText className="h-4 w-4" /><span className="font-semibold">{displayedConflictPath ?? "No conflicted file selected"}</span><span className="rounded bg-[color:rgba(210,153,34,0.18)] px-2 py-1 text-xs text-[var(--color-warning)]">{conflictCount} conflict{conflictCount === 1 ? "" : "s"}</span></div><div className="flex items-center gap-2"><ActionPill label="3-way" active /><ActionPill label="Unified" /><ActionPill label="Resolve" /></div></div>
          <div className="grid min-h-0 flex-1 grid-cols-3 overflow-auto"><DiffPane title="Current (HEAD)" rev={hasLiveRebase ? shortHash(rebaseState?.origHead ?? "") : "a1b2c3d"} lines={displayedCurrent} tone="deleted" /><DiffPane title={hasLiveRebase ? `Incoming (${rebaseState?.headName ?? "rebased commit"})` : "Incoming (feature/checkout-flow-2)"} rev={hasLiveRebase ? shortHash(rebaseState?.onto ?? "") : "f6a7b8c"} lines={displayedIncoming} tone="added" /><DiffPane title="Result (edited)" rev="" lines={displayedResult} tone="result" /></div>
          <section className="grid border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] md:grid-cols-[1.1fr_0.9fr]">
            <div className="border-r border-[var(--color-border)] p-3"><div className="mb-3 flex gap-4 text-sm"><b>Conflict workflow</b><span className="text-[var(--color-text-secondary)]">Commit Message</span></div><div className="mb-3 flex items-center gap-2 text-sm text-[var(--color-warning)]"><AlertTriangle className="h-4 w-4" /> Review the result pane, mark resolved, then continue.</div>{[["Inspect current changes", "Compare the HEAD side of the conflict", true], ["Inspect incoming changes", "Compare the rebased commit side", false], ["Edit result in your editor", "Save the resolved file before continuing", false]].map(([title, body, active]) => <div key={title as string} className={`mb-2 flex items-center gap-3 rounded-lg border p-3 text-sm ${active ? "border-[var(--color-accent)] bg-[var(--color-bg-selected)]/15" : "border-[var(--color-border)] bg-[var(--color-bg-tertiary)]"}`}><GitCompareArrows className="h-4 w-4" /><div className="flex-1"><b>{title as string}</b><p className="text-xs text-[var(--color-text-secondary)]">{body as string}</p></div>{active && <span className="rounded bg-[color:rgba(63,185,80,0.14)] px-2 py-1 text-xs text-[var(--color-success)]">Active</span>}</div>)}</div>
            <div className="p-3"><div className="mb-3 flex items-center gap-2 font-semibold"><Bot className="h-5 w-5" /> AI Assistant <span className="rounded bg-[var(--color-bg-surface)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">Beta</span></div><div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-4 text-sm text-[var(--color-text-secondary)]"><p>AI conflict assistance shell is available here.</p><p className="mt-3">No assistant analysis, recommendations, or apply actions are wired in this view.</p><button disabled className="mt-4 inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-xs text-[var(--color-text-muted)]"><Wand2 className="h-4 w-4" /> Assistant unavailable <ChevronDown className="h-4 w-4" /></button></div></div>
          </section>
        </main>

        <aside className="min-h-0 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
          <h2 className="mb-4 font-semibold">Rebase preview</h2>
          <div className="border-l border-[var(--color-accent)]/60 pl-4"><div className="mb-4 text-xs text-[var(--color-text-muted)]">Before rebase ({hasLiveRebase ? rebaseState?.headName ?? "current branch" : "feature/checkout-flow"})</div>{displayedTodo.map((item, index) => { const liveItem = item as RebaseTodoItem; const staticItem = item as (typeof todo)[number]; const message = hasLiveRebase ? liveItem.message : staticItem[1]; const commit = hasLiveRebase ? liveItem.commit : staticItem[2]; return <div key={`before-${commit}-${index}`} className="mb-4 flex items-center gap-3 text-xs"><GitCommitVertical className="h-4 w-4 text-[var(--color-accent)]" /><span className="flex-1 truncate">{message}</span><span className="font-mono text-[var(--color-text-muted)]">{shortHash(commit)}</span></div>; })}<div className="mb-8 flex items-center gap-3 text-xs"><GitBranch className="h-4 w-4" /><span>{hasLiveRebase ? rebaseState?.onto ?? "upstream" : "main"}</span><span className="ml-auto font-mono text-[var(--color-text-muted)]">{hasLiveRebase ? shortHash(rebaseState?.origHead ?? "") : "c34de5f"}</span></div></div>
          <div className="border-l border-[var(--color-success)]/70 pl-4"><div className="mb-4 text-xs text-[var(--color-text-muted)]">After rebase (onto {hasLiveRebase ? rebaseState?.onto ?? "upstream" : "main"})</div>{displayedTodo.map((item, index) => { const liveItem = item as RebaseTodoItem; const staticItem = item as (typeof todo)[number]; const action = hasLiveRebase ? liveItem.action : staticItem[0]; const message = hasLiveRebase ? liveItem.message : staticItem[1]; return <div key={`after-${message}-${index}`} className={`mb-4 flex items-center gap-3 text-xs ${action === "drop" ? "text-[var(--color-deleted)]" : ""}`}><GitCommitVertical className={`h-4 w-4 ${action === "drop" ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`} /><span className="flex-1 truncate">{message}</span><span className="font-mono text-[var(--color-text-muted)]">{action === "drop" ? "dropped" : hasLiveRebase ? action : `new ${["a11e0f1", "b22f0a2", "c33a1b3", "d44b2c4"][index]}`}</span></div>; })}</div>
          <div className="mt-6 space-y-3 border-t border-[var(--color-border)] pt-4 text-sm"><p className="text-[var(--color-warning)]"><Sparkles className="mr-2 inline h-4 w-4" />{hasLiveRebase ? `${conflictCount} conflicted file${conflictCount === 1 ? "" : "s"}` : "1 commit edited"}</p><p className="text-[var(--color-danger)]"><XCircle className="mr-2 inline h-4 w-4" />{hasLiveRebase ? "Resolve or skip the current commit" : "1 commit dropped"}</p><p><RefreshCw className="mr-2 inline h-4 w-4" />{displayedTodo.length} commits will be rebased</p></div>
        </aside>
      </div>

      <footer className="grid grid-cols-[220px_1fr_auto] items-center gap-4 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
        <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-3"><RefreshCw className={`h-6 w-6 ${hasLiveRebase ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}`} /><div><div className="font-semibold">{hasLiveRebase ? "Rebase in progress" : "No active rebase detected"}</div><div className="text-xs text-[var(--color-text-muted)]">{hasLiveRebase ? `On commit ${currentStep} of ${totalSteps}` : "Reference demo data shown"}</div></div></div>
        <div className="flex items-center justify-center gap-2 text-sm font-semibold text-[var(--color-warning)]"><ShieldAlert className="h-5 w-5" /> {hasLiveRebase ? (conflictCount > 0 ? "Resolve all conflicts to continue" : "No conflicts reported; ready to continue") : "No active rebase detected"}</div>
        <div className="flex items-center gap-3"><button disabled={!canMutateRebase || isActionPending} onClick={confirmAndAbort} className="rounded-md border border-[var(--color-danger)]/60 px-5 py-2.5 text-sm font-semibold text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-50">{actions.abortRebase.isPending ? "Aborting…" : "Abort Rebase"}</button><button disabled={!canMutateRebase || isActionPending} onClick={confirmAndSkip} className="rounded-md border border-[var(--color-border)] px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50">{actions.skipRebase.isPending ? "Skipping…" : "Skip Commit"}</button><button disabled={!canMarkResolved || isActionPending} onClick={handleMarkResolved} className="rounded-md border border-[var(--color-border)] px-5 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">{actions.markFileResolved.isPending ? "Marking…" : "Mark Resolved"}</button><button disabled={!canMutateRebase || isActionPending || conflictCount > 0} onClick={confirmAndContinue} className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> {actions.continueRebase.isPending ? "Continuing…" : "Continue Rebase ⌘↵"}</button></div>
      </footer>
    </section>
  );
}
