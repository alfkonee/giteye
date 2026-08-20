import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  GitBranch,
  GitMerge,
  RefreshCw,
  X,
} from "lucide-react";
import { gitMutations, gitQueries, invalidateGitState } from "../../lib/git-data";
import { gitApi } from "../../lib/tauri-api";
import { cn } from "../../lib/cn";
import { useAppStore } from "../../stores/app-store";
import { CommitHistory } from "../commit-history/CommitHistory";
import { RebaseConflictResolver } from "../rebase/RebaseConflictResolver";
import { IntegratePanel } from "./IntegratePanel";

type DrawerTab = "integrate" | "conflicts";

/**
 * The single Git working surface: staging and committing, the commit graph,
 * and every integration action (merge, rebase, conflict resolution) in one
 * page so no part of the commit → integrate → resolve loop needs a view switch.
 */
export function GitWorkspace() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const pendingAdvancedBranchName = useAppStore((s) => s.pendingAdvancedBranchName);
  const setPendingAdvancedBranchName = useAppStore((s) => s.setPendingAdvancedBranchName);
  const queryClient = useQueryClient();

  const [drawerTab, setDrawerTab] = useState<DrawerTab | null>(null);
  const [prefillRef, setPrefillRef] = useState<string | null>(null);
  const autoOpenedOperation = useRef<string | null>(null);

  const { data: snapshot } = useQuery(gitQueries.repositorySnapshot(activeRepoPath));
  const operationQuery = useQuery(
    gitQueries.operationSummary(activeRepoPath, Boolean(activeRepoPath)),
  );
  const continueRebaseMutation = useMutation(
    gitMutations.continueRebase(queryClient, activeRepoPath),
  );
  const skipRebaseMutation = useMutation(gitMutations.skipRebase(queryClient, activeRepoPath));
  const abortRebaseMutation = useMutation(gitMutations.abortRebase(queryClient, activeRepoPath));
  const recoverMutation = useMutation({
    mutationFn: (action: "continue" | "abort") =>
      gitApi.recoverGitOperation(activeRepoPath!, action),
    onSuccess: () => invalidateGitState(queryClient, activeRepoPath),
  });

  const repoInfo = snapshot?.repositoryInfo;
  const summary = snapshot?.summary;
  const operation = operationQuery.data;
  const conflicts = operation?.conflicts ?? [];
  const activeOperation =
    operation?.operation ?? (operation?.inRebase ? "rebase" : operation?.inMerge ? "merge" : null);
  const inRebase = Boolean(operation?.inRebase || operation?.rebase.inProgress);
  const operationPending =
    continueRebaseMutation.isPending ||
    skipRebaseMutation.isPending ||
    abortRebaseMutation.isPending ||
    recoverMutation.isPending;

  // A ref chosen elsewhere (branch context menu, commit menu, sidebar) opens
  // the integrate drawer prefilled instead of navigating to another page.
  useEffect(() => {
    if (!pendingAdvancedBranchName) return;
    setPrefillRef(pendingAdvancedBranchName);
    setDrawerTab("integrate");
    setPendingAdvancedBranchName(null);
  }, [pendingAdvancedBranchName, setPendingAdvancedBranchName]);

  // Surface conflicts once per operation; reopening stays the user's choice.
  useEffect(() => {
    if (!activeOperation) {
      autoOpenedOperation.current = null;
      return;
    }
    if (autoOpenedOperation.current === activeOperation) return;
    autoOpenedOperation.current = activeOperation;
    setDrawerTab("conflicts");
  }, [activeOperation]);

  const openDrawer = (tab: DrawerTab) => setDrawerTab((current) => (current === tab ? null : tab));

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)]">
      <header className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 px-2.5 py-1">
        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
            <span className="truncate text-[12px] font-semibold text-[var(--color-text-primary)]">
              {repoInfo?.currentBranch ?? "No branch"}
            </span>
            {repoInfo && (repoInfo.ahead > 0 || repoInfo.behind > 0) ? (
              <span className="giteye-chip tabular-nums" data-tone="accent">
                {repoInfo.ahead > 0 ? (
                  <>
                    <ArrowUp className="h-3 w-3" />
                    {repoInfo.ahead}
                  </>
                ) : null}
                {repoInfo.behind > 0 ? (
                  <>
                    <ArrowDown className="h-3 w-3" />
                    {repoInfo.behind}
                  </>
                ) : null}
              </span>
            ) : null}
            <span
              className="giteye-chip tabular-nums"
              data-tone={repoInfo?.isClean ? "success" : "warning"}
            >
              {repoInfo?.isClean ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <AlertTriangle className="h-3 w-3" />
              )}
              {repoInfo?.isClean
                ? "Clean"
                : `${summary?.stagedCount ?? 0} staged · ${summary?.unstagedCount ?? 0} unstaged`}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => void invalidateGitState(queryClient, activeRepoPath)}
              className="giteye-btn giteye-btn-ghost giteye-btn-sm giteye-btn-icon"
              title="Refresh repository state"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="sr-only">Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => openDrawer("integrate")}
              data-state={drawerTab === "integrate" ? "active" : undefined}
              className={cn(
                "giteye-btn giteye-btn-sm",
                drawerTab === "integrate" ? "giteye-btn-primary" : "giteye-btn-secondary",
              )}
              title="Merge and rebase controls"
            >
              <GitMerge className="h-3.5 w-3.5" />
              Integrate
            </button>
            <button
              type="button"
              onClick={() => openDrawer("conflicts")}
              className={cn(
                "giteye-btn giteye-btn-sm",
                conflicts.length > 0 || inRebase
                  ? "border border-[var(--color-warning)] text-[var(--color-warning)]"
                  : "giteye-btn-secondary",
              )}
              title="Conflict resolver and in-progress operation"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Conflicts
              {conflicts.length > 0 ? (
                <span className="ml-1 tabular-nums">{conflicts.length}</span>
              ) : null}
            </button>
          </div>
        </div>
      </header>

      {activeOperation ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[color:rgba(210,153,34,0.35)] bg-[color:rgba(210,153,34,0.1)] px-2.5 py-1 text-[11px] text-[var(--color-warning)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold uppercase tracking-[0.06em]">{activeOperation} in progress</span>
          <span className="text-[var(--color-text-secondary)]">
            {conflicts.length > 0
              ? `${conflicts.length} unmerged file${conflicts.length === 1 ? "" : "s"}`
              : "No unmerged files reported"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              disabled={operationPending}
              onClick={() =>
                inRebase ? continueRebaseMutation.mutate() : recoverMutation.mutate("continue")
              }
              className="giteye-btn giteye-btn-sm giteye-btn-secondary"
            >
              Continue
            </button>
            {inRebase ? (
              <button
                type="button"
                disabled={operationPending}
                onClick={() => skipRebaseMutation.mutate()}
                className="giteye-btn giteye-btn-sm giteye-btn-secondary"
              >
                Skip commit
              </button>
            ) : null}
            <button
              type="button"
              disabled={operationPending}
              onClick={() => {
                if (
                  !window.confirm(
                    `Abort the in-progress ${activeOperation}?\n\nGit restores the pre-operation state; resolved conflict edits made in this operation are discarded.`,
                  )
                ) {
                  return;
                }
                inRebase ? abortRebaseMutation.mutate() : recoverMutation.mutate("abort");
              }}
              className="giteye-btn giteye-btn-sm border border-[var(--color-danger)] text-[var(--color-danger)]"
            >
              Abort
            </button>
            <button
              type="button"
              onClick={() => setDrawerTab("conflicts")}
              className="giteye-btn giteye-btn-sm giteye-btn-secondary"
            >
              Open resolver
            </button>
          </div>
        </div>
      ) : null}

      <PanelGroup direction="vertical" className="min-h-0 flex-1">
        <Panel id="workspace-main" order={1} minSize={30}>
          <div className="h-full overflow-hidden">
            <CommitHistory />
          </div>
        </Panel>

        {drawerTab ? (
          <>
            <PanelResizeHandle className="group relative h-px cursor-row-resize bg-[var(--color-border-muted)] transition-colors hover:bg-[var(--color-accent)] active:bg-[var(--color-accent)]">
              <div className="absolute -inset-y-1.5 inset-x-0" />
            </PanelResizeHandle>
            <Panel id="workspace-drawer" order={2} defaultSize={42} minSize={18}>
              <section className="flex h-full min-h-0 flex-col bg-[var(--color-bg-primary)]">
                <div className="flex shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1">
                  <div className="giteye-segmented">
                    <button
                      type="button"
                      data-state={drawerTab === "integrate" ? "active" : undefined}
                      onClick={() => setDrawerTab("integrate")}
                    >
                      Integrate
                    </button>
                    <button
                      type="button"
                      data-state={drawerTab === "conflicts" ? "active" : undefined}
                      onClick={() => setDrawerTab("conflicts")}
                    >
                      Conflicts{conflicts.length > 0 ? ` (${conflicts.length})` : ""}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawerTab(null)}
                    className="giteye-btn giteye-btn-ghost giteye-btn-sm giteye-btn-icon ml-auto"
                    title="Close panel"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span className="sr-only">Close panel</span>
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                  {drawerTab === "integrate" ? (
                    <IntegratePanel prefillRef={prefillRef} activeOperation={activeOperation} />
                  ) : (
                    <ConflictsTab conflicts={conflicts} inRebase={inRebase} />
                  )}
                </div>
              </section>
            </Panel>
          </>
        ) : null}
      </PanelGroup>
    </div>
  );
}

function ConflictsTab({
  conflicts,
  inRebase,
}: {
  conflicts: Array<{ path: string; status: string; conflictType: string }>;
  inRebase: boolean;
}) {
  if (inRebase) {
    return (
      <div className="h-full overflow-hidden">
        <RebaseConflictResolver />
      </div>
    );
  }

  if (conflicts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-[var(--color-text-muted)]">
        No unmerged files. Conflict tools appear here while a merge, rebase, cherry-pick, or revert is stopped.
      </div>
    );
  }

  return (
    <div className="h-full space-y-0.5 overflow-y-auto p-2">
      {conflicts.map((conflict) => (
        <div
          key={conflict.path}
          title={`${conflict.status} · ${conflict.conflictType}`}
          className="flex items-center gap-2 rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-[11px]"
        >
          <AlertTriangle className="h-3 w-3 shrink-0 text-[var(--color-warning)]" />
          <span className="shrink-0 font-mono text-[10.5px] text-[var(--color-warning)]">{conflict.status}</span>
          <span className="min-w-0 flex-1 truncate text-[var(--color-text-secondary)]">{conflict.path}</span>
          <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]">{conflict.conflictType}</span>
        </div>
      ))}
      <p className="pt-1 text-[10.5px] text-[var(--color-text-muted)]">
        Resolve these files from the Changes panel, stage them, then continue the operation from the banner above.
      </p>
    </div>
  );
}
