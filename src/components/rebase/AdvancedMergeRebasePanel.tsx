import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  GitMerge,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { formatRebasePreview } from "../../lib/git-preview";
import { useAppStore } from "../../stores/app-store";
import type { MergeStrategyOption, StartRebaseRequest } from "../../types/git";
import { RebaseConflictResolver } from "./RebaseConflictResolver";

const MERGE_STRATEGY_OPTIONS: Array<{ value: "" | MergeStrategyOption; label: string }> = [
  { value: "", label: "Default recursive strategy" },
  { value: "ours", label: "Prefer ours (-X ours)" },
  { value: "theirs", label: "Prefer theirs (-X theirs)" },
  { value: "patience", label: "Patience diff" },
  { value: "ignore-space-change", label: "Ignore space changes" },
  { value: "ignore-all-space", label: "Ignore all whitespace" },
  { value: "renormalize", label: "Renormalize line endings" },
];


export function AdvancedMergeRebasePanel() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const pendingAdvancedBranchName = useAppStore((s) => s.pendingAdvancedBranchName);
  const setPendingAdvancedBranchName = useAppStore((s) => s.setPendingAdvancedBranchName);
  const queryClient = useQueryClient();
  const { data: branches = [] } = useQuery(gitQueries.branches(activeRepoPath));
  const { data: snapshot } = useQuery(gitQueries.repositorySnapshot(activeRepoPath));
  const operationQuery = useQuery(gitQueries.operationSummary(activeRepoPath));
  const rerereQuery = useQuery(gitQueries.rerereStatus(activeRepoPath));
  const mergeMutation = useMutation(gitMutations.mergeWithOptions(queryClient, activeRepoPath));
  const previewRebaseMutation = useMutation(gitMutations.previewRebase(activeRepoPath));
  const rebaseOntoMutation = useMutation(gitMutations.rebaseOnto(queryClient, activeRepoPath));
  const rebaseUpstreamMutation = useMutation(gitMutations.rebaseUpstream(queryClient, activeRepoPath));
  const rerereMutation = useMutation(gitMutations.setRerereEnabled(queryClient, activeRepoPath));

  const refs = useMemo(
    () => Array.from(new Set(branches.map((branch) => branch.shortName))).sort((a, b) => a.localeCompare(b)),
    [branches],
  );
  const current = snapshot?.repositoryInfo.currentBranch ?? branches.find((branch) => branch.isCurrent)?.shortName ?? "";
  const mergeSources = refs.filter((ref) => ref !== current);
  const currentBranchInfo = branches.find((branch) => branch.shortName === current);
  const [mergeSource, setMergeSource] = useState("");
  const [strategyOption, setStrategyOption] = useState<"" | MergeStrategyOption>("");
  const [noFf, setNoFf] = useState(false);
  const [squash, setSquash] = useState(false);
  const [rebaseBranch, setRebaseBranch] = useState("");
  const [rebaseUpstream, setRebaseUpstream] = useState("");
  const [rebaseOnto, setRebaseOnto] = useState("");
  const [autostash, setAutostash] = useState(true);

  useEffect(() => () => setPendingAdvancedBranchName(null), [setPendingAdvancedBranchName]);

  useEffect(() => {
    if (!pendingAdvancedBranchName) return;
    setMergeSource(pendingAdvancedBranchName);
    setRebaseUpstream(pendingAdvancedBranchName);
  }, [pendingAdvancedBranchName]);

  useEffect(() => {
    if (!mergeSource && mergeSources[0]) setMergeSource(mergeSources[0]);
  }, [mergeSource, mergeSources]);

  useEffect(() => {
    if (!rebaseBranch && current) setRebaseBranch(current);
  }, [current, rebaseBranch]);

  useEffect(() => {
    if (!rebaseUpstream) {
      setRebaseUpstream(currentBranchInfo?.upstream ?? mergeSources[0] ?? "");
    }
  }, [currentBranchInfo?.upstream, mergeSources, rebaseUpstream]);

  const operation = operationQuery.data;
  const conflicts = operation?.conflicts ?? [];
  const activeOperation = operation?.operation ?? (operation?.inRebase ? "rebase" : operation?.inMerge ? "merge" : null);
  const activeOperationRecoveryHint = operationRecoveryHint(activeOperation);
  const isPending =
    mergeMutation.isPending ||
    previewRebaseMutation.isPending ||
    rebaseOntoMutation.isPending ||
    rebaseUpstreamMutation.isPending ||
    rerereMutation.isPending;
  const actionError =
    mergeMutation.error ??
    previewRebaseMutation.error ??
    rebaseOntoMutation.error ??
    rebaseUpstreamMutation.error ??
    rerereMutation.error ??
    operationQuery.error ??
    rerereQuery.error;
  const hasActiveRebase = Boolean(operation?.inRebase || operation?.rebase.inProgress);

  const submitMerge = () => {
    if (!mergeSource) return;
    if (noFf && squash) {
      window.alert("Git cannot combine --no-ff and --squash. Pick one merge mode.");
      return;
    }
    const options = [noFf ? "--no-ff" : null, squash ? "--squash" : null, strategyOption ? `-X ${strategyOption}` : null]
      .filter(Boolean)
      .join(" ") || "default options";
    if (!window.confirm(`Merge "${mergeSource}" into "${current || "the current branch"}" using ${options}? The working tree must be clean.`)) return;
    mergeMutation.mutate({
      source: mergeSource,
      noFf,
      squash,
      strategyOption: strategyOption || null,
    });
  };

  const submitRebase = async () => {
    if (!rebaseUpstream.trim()) return;
    const request: StartRebaseRequest = {
      upstream: rebaseUpstream.trim(),
      onto: rebaseOnto.trim() || null,
      branch: rebaseBranch && rebaseBranch !== current ? rebaseBranch : null,
      autostash,
    };
    const target = request.onto ? `--onto ${request.onto} ${request.upstream}` : request.upstream;
    const branchLabel = request.branch ?? (current || "current branch");
    let previewText: string;
    try {
      previewText = formatRebasePreview(await previewRebaseMutation.mutateAsync(request));
    } catch (error) {
      window.alert(`Unable to preview rebase of ${branchLabel}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (!window.confirm(`Rebase ${branchLabel} onto ${target}?\n\nThis rewrites local branch history. Make sure important work is backed up or pushed before continuing.\n\nPreview:\n${previewText}\n\nRecovery: abort while the rebase is active, or use ORIG_HEAD/reflog after completion to create a recovery branch or reset back.`)) return;
    if (request.onto) {
      rebaseOntoMutation.mutate(request);
    } else {
      rebaseUpstreamMutation.mutate(request);
    }
  };

  const toggleRerere = () => {
    rerereMutation.mutate(!rerereQuery.data?.enabled);
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">Advanced Merge &amp; Rebase</h1>
              {activeOperation ? <span className="rounded bg-[color:rgba(210,153,34,0.18)] px-2 py-1 text-xs text-[var(--color-warning)]">{activeOperation}</span> : null}
            </div>
            <p className="text-sm text-[var(--color-text-secondary)]">Native Git merge strategy options, rebase upstream/onto controls, rerere config, and operation conflict status.</p>
          </div>
          <button
            type="button"
            disabled={isPending || rerereQuery.isLoading}
            onClick={toggleRerere}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {rerereQuery.data?.enabled ? <ToggleRight className="h-5 w-5 text-[var(--color-success)]" /> : <ToggleLeft className="h-5 w-5 text-[var(--color-text-muted)]" />}
            rerere {rerereQuery.data?.enabled ? "enabled" : "disabled"}
          </button>
        </div>
        {actionError ? <div className="mt-3 rounded-md border border-[var(--color-danger)]/40 bg-[color:rgba(248,81,73,0.1)] px-3 py-2 text-xs text-[var(--color-danger)]">{actionError instanceof Error ? actionError.message : String(actionError)}</div> : null}
        {pendingAdvancedBranchName ? <div className="mt-3 rounded-md border border-[var(--color-accent)]/30 bg-[color:rgba(31,111,235,0.12)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">Opened from branch action: <span className="font-semibold text-[var(--color-text-primary)]">{pendingAdvancedBranchName}</span>. Merge source and rebase upstream are prefilled from that branch; edit them before running an operation if needed.</div> : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="space-y-4">
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
                <div className="mb-3 flex items-center gap-2 font-semibold"><GitMerge className="h-4 w-4" /> Merge options</div>
                <label className="block text-xs text-[var(--color-text-muted)]">Source branch</label>
                <input value={mergeSource} onChange={(event) => setMergeSource(event.target.value)} list="merge-refs" className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm" placeholder="feature/source" />
                <div className="mt-3 grid gap-2 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={noFf} onChange={(event) => setNoFf(event.target.checked)} disabled={squash} /> Create merge commit (--no-ff)</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={squash} onChange={(event) => setSquash(event.target.checked)} disabled={noFf} /> Squash without committing (--squash)</label>
                </div>
                <label className="mt-3 block text-xs text-[var(--color-text-muted)]">Strategy option</label>
                <select value={strategyOption} onChange={(event) => setStrategyOption(event.target.value as "" | MergeStrategyOption)} className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm">
                  {MERGE_STRATEGY_OPTIONS.map((option) => <option key={option.value || "default"} value={option.value}>{option.label}</option>)}
                </select>
                <button type="button" disabled={!mergeSource || isPending} onClick={submitMerge} className="mt-4 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Merge with options</button>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
                <div className="mb-3 flex items-center gap-2 font-semibold"><RefreshCw className="h-4 w-4" /> Rebase branch</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-[var(--color-text-muted)]">Branch<input value={rebaseBranch} onChange={(event) => setRebaseBranch(event.target.value)} list="merge-refs" className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)]" placeholder={current || "current branch"} /></label>
                  <label className="text-xs text-[var(--color-text-muted)]">Upstream<input value={rebaseUpstream} onChange={(event) => setRebaseUpstream(event.target.value)} list="merge-refs" className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm text-[var(--color-text-primary)]" placeholder="origin/main" /></label>
                </div>
                <label className="mt-3 block text-xs text-[var(--color-text-muted)]">Optional --onto target</label>
                <input value={rebaseOnto} onChange={(event) => setRebaseOnto(event.target.value)} list="merge-refs" className="mt-1 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-3 py-2 text-sm" placeholder="Leave blank for normal upstream rebase" />
                <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={autostash} onChange={(event) => setAutostash(event.target.checked)} /> Autostash local changes when Git can do so</label>
                <button type="button" disabled={!rebaseUpstream.trim() || isPending || Boolean(activeOperation)} onClick={submitRebase} className="mt-4 rounded-md border border-[var(--color-warning)] bg-[color:rgba(210,153,34,0.12)] px-4 py-2 text-sm font-semibold text-[var(--color-warning)] disabled:cursor-not-allowed disabled:opacity-50">Start rebase</button>
                {activeOperation ? <p className="mt-2 text-xs text-[var(--color-text-muted)]">Finish the active {activeOperation} before starting another history-moving operation.</p> : null}
              </div>
            </section>

            {hasActiveRebase ? (
              <div className="h-[720px] overflow-hidden rounded-xl border border-[var(--color-border)]">
                <RebaseConflictResolver />
              </div>
            ) : null}
          </main>

          <aside className="space-y-4">
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
              <div className="mb-3 flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4" /> Operation status</div>
              <div className="grid gap-2 text-sm text-[var(--color-text-secondary)]">
                <StatusLine label="Operation" value={activeOperation ?? "None"} tone={activeOperation ? "warning" : "success"} />
                <StatusLine label="Rebase" value={operation?.inRebase ? "Active" : "Idle"} />
                <StatusLine label="Merge" value={operation?.inMerge ? "Active" : "Idle"} />
                <StatusLine label="Conflicts" value={String(conflicts.length)} tone={conflicts.length ? "warning" : "success"} />
              </div>
              {activeOperationRecoveryHint ? (
                <p className="mt-3 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3 text-xs leading-5 text-[var(--color-text-muted)]">
                  {activeOperationRecoveryHint}
                </p>
              ) : null}
              {conflicts.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {conflicts.map((conflict) => (
                    <div key={conflict.path} className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-2 text-xs">
                      <div className="flex items-center gap-2 text-[var(--color-warning)]"><AlertTriangle className="h-3.5 w-3.5" /><span className="font-mono">{conflict.status}</span><span>{conflict.conflictType}</span></div>
                      <div className="mt-1 truncate text-[var(--color-text-secondary)]">{conflict.path}</div>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-4 text-xs text-[var(--color-text-muted)]">No unmerged files reported.</p>}
            </section>

            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-panel)]">
              <div className="mb-3 flex items-center gap-2 font-semibold"><ListChecks className="h-4 w-4" /> rerere cache</div>
              <p className="text-sm text-[var(--color-text-secondary)]">Reuse Recorded Resolution is {rerereQuery.data?.enabled ? "enabled" : "disabled"}. Git can remember conflict resolutions and reapply them when the same conflict appears.</p>
              <div className="mt-3 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] p-3 text-xs text-[var(--color-text-muted)]">{rerereQuery.data?.paths.length ?? 0} recorded path{(rerereQuery.data?.paths.length ?? 0) === 1 ? "" : "s"}</div>
              <div className="mt-3 max-h-44 space-y-1 overflow-auto text-xs text-[var(--color-text-secondary)]">
                {rerereQuery.data?.paths.slice(0, 12).map((path) => <div key={path} className="truncate rounded bg-[var(--color-bg-surface)] px-2 py-1">{path}</div>)}
              </div>
            </section>
          </aside>
        </div>
      </div>

      <datalist id="merge-refs">
        {refs.map((ref) => <option key={ref} value={ref} />)}
      </datalist>
    </section>
  );
}

function operationRecoveryHint(operation: string | null) {
  if (!operation) return null;
  if (operation === "cherry-pick" || operation === "revert" || operation === "conflict") {
    return "Recovery: resolve conflicts and continue from the working tree, or abort the partial cherry-pick/revert from Git if you do not want it.";
  }
  if (operation === "rebase") {
    return "Recovery: abort while the rebase is active, or use ORIG_HEAD/reflog after completion to create a recovery branch or reset back.";
  }
  return "Recovery: finish or abort the active Git operation before starting another history-moving action.";
}

function StatusLine({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "warning" }) {
  const toneClass = tone === "success" ? "text-[var(--color-success)]" : tone === "warning" ? "text-[var(--color-warning)]" : "text-[var(--color-text-primary)]";
  return <div className="flex items-center justify-between rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 py-2"><span className="text-[var(--color-text-muted)]">{label}</span><span className={toneClass}>{value}</span></div>;
}
