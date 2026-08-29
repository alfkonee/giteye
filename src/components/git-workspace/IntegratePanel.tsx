import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitMerge, ListChecks, RefreshCw, ToggleLeft, ToggleRight } from "lucide-react";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { formatRebasePreview } from "../../lib/git-preview";
import { useAppStore } from "../../stores/app-store";
import type { MergeStrategyOption, StartRebaseRequest } from "../../types/git";

import { appDialog } from "../common/AppDialogProvider";
import { Button, Select } from "../ui";

const MERGE_STRATEGY_OPTIONS: Array<{ value: "" | MergeStrategyOption; label: string }> = [
  { value: "", label: "Default recursive strategy" },
  { value: "ours", label: "Prefer ours (-X ours)" },
  { value: "theirs", label: "Prefer theirs (-X theirs)" },
  { value: "patience", label: "Patience diff" },
  { value: "ignore-space-change", label: "Ignore space changes" },
  { value: "ignore-all-space", label: "Ignore all whitespace" },
  { value: "renormalize", label: "Renormalize line endings" },
];

interface IntegratePanelProps {
  /** Ref the caller wants prefilled as merge source / rebase upstream. */
  prefillRef: string | null;
  /** Operation Git is already running; blocks starting a second one. */
  activeOperation: string | null;
}

/**
 * Merge and rebase controls for the unified workspace drawer. Owns only the
 * "start an integration" surface — in-progress operation status and conflict
 * resolution live in the workspace banner and conflicts tab.
 */
export function IntegratePanel({ prefillRef, activeOperation }: IntegratePanelProps) {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const queryClient = useQueryClient();
  const { data: branches = [] } = useQuery(gitQueries.branches(activeRepoPath));
  const { data: snapshot } = useQuery(gitQueries.repositorySnapshot(activeRepoPath));
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
  const current =
    snapshot?.repositoryInfo.currentBranch ?? branches.find((branch) => branch.isCurrent)?.shortName ?? "";
  const mergeSources = refs.filter((ref) => ref !== current);
  const currentBranchInfo = branches.find((branch) => branch.shortName === current);

  const [mergeSource, setMergeSource] = useState(prefillRef ?? "");
  const [strategyOption, setStrategyOption] = useState<"" | MergeStrategyOption>("");
  const [noFf, setNoFf] = useState(false);
  const [squash, setSquash] = useState(false);
  const [rebaseBranch, setRebaseBranch] = useState("");
  const [rebaseUpstream, setRebaseUpstream] = useState(prefillRef ?? "");
  const [rebaseOnto, setRebaseOnto] = useState("");
  const [autostash, setAutostash] = useState(true);

  useEffect(() => {
    if (!prefillRef) return;
    setMergeSource(prefillRef);
    setRebaseUpstream(prefillRef);
    setRebaseOnto("");
  }, [prefillRef]);

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
    rerereQuery.error;

  const submitMerge = async () => {
    if (!mergeSource || mergeMutation.isPending) return;
    if (noFf && squash) {
      await appDialog.alert("Git cannot combine --no-ff and --squash. Pick one merge mode.", "Invalid merge options");
      return;
    }
    const options =
      [noFf ? "--no-ff" : null, squash ? "--squash" : null, strategyOption ? `-X ${strategyOption}` : null]
        .filter(Boolean)
        .join(" ") || "default options";
    if (
      !(await appDialog.confirm(
        `Merge "${mergeSource}" into "${current || "the current branch"}" using ${options}? The working tree must be clean.`,
        "Merge branch?",
      ))
    ) {
      return;
    }
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
      await appDialog.alert(
        `Unable to preview rebase of ${branchLabel}: ${error instanceof Error ? error.message : String(error)}`,
        "Rebase preview failed",
      );
      return;
    }

    if (
      !(await appDialog.confirm(
        `Rebase ${branchLabel} onto ${target}?\n\nThis rewrites local branch history. Make sure important work is backed up or pushed before continuing.\n\nPreview:\n${previewText}\n\nRecovery: abort while the rebase is active, or use ORIG_HEAD/reflog after completion to create a recovery branch or reset back.`,
        "Rebase branch?",
        "danger",
      ))
    ) {
      return;
    }

    if (request.onto) {
      rebaseOntoMutation.mutate(request);
    } else {
      rebaseUpstreamMutation.mutate(request);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-3">
      {actionError ? (
        <div className="mb-3 rounded-md border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-[var(--color-danger)]">
          {actionError instanceof Error ? actionError.message : String(actionError)}
        </div>
      ) : null}
      {prefillRef ? (
        <div className="mb-3 rounded-md border border-[var(--color-info-border)] bg-[var(--color-info-bg)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
          Prefilled from <span className="font-semibold text-[var(--color-text-primary)]">{prefillRef}</span>. Edit the
          fields before running an operation if needed.
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
            <GitMerge className="h-4 w-4" /> Merge into {current || "current branch"}
          </div>
          <label className="block text-xs text-[var(--color-text-muted)]">Source ref</label>
          <input
            value={mergeSource}
            onChange={(event) => setMergeSource(event.target.value)}
            list="workspace-integrate-refs"
            className="giteye-input mt-1 w-full"
            placeholder="feature/source"
          />
          <div className="mt-2 grid gap-1.5 text-xs text-[var(--color-text-secondary)]">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={noFf} onChange={(event) => setNoFf(event.target.checked)} disabled={squash} />
              Create merge commit (--no-ff)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={squash} onChange={(event) => setSquash(event.target.checked)} disabled={noFf} />
              Squash without committing (--squash)
            </label>
          </div>
          <label className="mt-2 block text-xs text-[var(--color-text-muted)]">Strategy option</label>
          <Select
            value={strategyOption}
            onValueChange={(value) => setStrategyOption(value as "" | MergeStrategyOption)}
            options={MERGE_STRATEGY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            className="mt-1 w-full"
            ariaLabel="Strategy option"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!mergeSource || isPending}
            onClick={submitMerge}
            className="mt-3 w-full"
          >
            Merge with options
          </Button>
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
            <RefreshCw className="h-4 w-4" /> Rebase branch
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="text-xs text-[var(--color-text-muted)]">
              Branch
              <input
                value={rebaseBranch}
                onChange={(event) => setRebaseBranch(event.target.value)}
                list="workspace-integrate-refs"
                className="giteye-input mt-1 w-full"
                placeholder={current || "current branch"}
              />
            </label>
            <label className="text-xs text-[var(--color-text-muted)]">
              Upstream
              <input
                value={rebaseUpstream}
                onChange={(event) => setRebaseUpstream(event.target.value)}
                list="workspace-integrate-refs"
                className="giteye-input mt-1 w-full"
                placeholder="origin/main"
              />
            </label>
          </div>
          <label className="mt-2 block text-xs text-[var(--color-text-muted)]">Optional --onto target</label>
          <input
            value={rebaseOnto}
            onChange={(event) => setRebaseOnto(event.target.value)}
            list="workspace-integrate-refs"
            className="giteye-input mt-1 w-full"
            placeholder="Leave blank for normal upstream rebase"
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            <input type="checkbox" checked={autostash} onChange={(event) => setAutostash(event.target.checked)} />
            Autostash local changes when Git can do so
          </label>
          <Button
            variant="secondary"
            size="sm"
            disabled={!rebaseUpstream.trim() || isPending || Boolean(activeOperation)}
            onClick={() => void submitRebase()}
            className="mt-3 w-full border-[var(--color-warning)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]"
          >
            Start rebase
          </Button>
          {activeOperation ? (
            <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
              Finish the active {activeOperation} before starting another history-moving operation.
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
              <ListChecks className="h-4 w-4" /> rerere cache
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending || rerereQuery.isLoading}
              onClick={() => rerereMutation.mutate(!rerereQuery.data?.enabled)}
            >
              {rerereQuery.data?.enabled ? (
                <ToggleRight className="h-4 w-4 text-[var(--color-success)]" />
              ) : (
                <ToggleLeft className="h-4 w-4 text-[var(--color-text-muted)]" />
              )}
              {rerereQuery.data?.enabled ? "enabled" : "disabled"}
            </Button>
          </div>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Reuse Recorded Resolution lets Git remember conflict resolutions and reapply them when the same conflict
            appears.
          </p>
          <div className="mt-2 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2 py-1.5 text-[11px] text-[var(--color-text-muted)]">
            {rerereQuery.data?.paths.length ?? 0} recorded path
            {(rerereQuery.data?.paths.length ?? 0) === 1 ? "" : "s"}
          </div>
          <div className="mt-2 max-h-32 space-y-1 overflow-auto text-[11px] text-[var(--color-text-secondary)]">
            {rerereQuery.data?.paths.slice(0, 12).map((path) => (
              <div key={path} className="truncate rounded bg-[var(--color-bg-surface)] px-2 py-1">
                {path}
              </div>
            ))}
          </div>
        </section>
      </div>

      <datalist id="workspace-integrate-refs">
        {refs.map((ref) => (
          <option key={ref} value={ref} />
        ))}
      </datalist>
    </div>
  );
}
