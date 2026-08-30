import { Fragment, useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitMutations, gitQueries } from "../../lib/git-data";
import { useAppStore } from "../../stores/app-store";
import { cn } from "../../lib/cn";
import { formatAmendPreview, formatRebasePreview } from "../../lib/git-preview";
import type { Branch, CommitSummary, ReflogEntry, ResetMode, ResetPreview, StartRebaseRequest } from "../../types/git";
import { localNameForRemoteRef, planBranchActivation } from "../../lib/branch-activation";
import type { DisplayRef } from "./commit-refs";
import { MoreHorizontal } from "lucide-react";
import { appDialog } from "../common/AppDialogProvider";
import { Button } from "../ui";


type CommitActionTarget = Pick<CommitSummary, "hash" | "message"> & {
  shortHash?: string | null;
  body?: string | null;
};

/**
 * What the menu can offer for a remote branch ref sitting on a right-clicked
 * commit: create-and-check-out a tracking local branch when none exists, or
 * fast-forward the local side that tracks it.
 */
type RemoteRefEntry =
  | { kind: "checkout"; refLabel: string; localName: string }
  | { kind: "fast-forward"; refLabel: string; localName: string; behind: number }
  | { kind: "synced"; refLabel: string; localName: string }
  | { kind: "diverged"; refLabel: string; localName: string; ahead: number; behind: number };

interface CommitActionStripProps {
  target: CommitActionTarget;
  isHeadCommit?: boolean;
  compact?: boolean;
  /** Refs pointing at this commit; enables merge/rebase entries in the menu. */
  refs?: DisplayRef[];
}

interface ReflogRecoveryPanelProps {
  open: boolean;
}
const COMMIT_MENU_WIDTH = 300;
const COMMIT_MENU_HEIGHT = 460;
const COMMIT_MENU_EDGE_GAP = 8;

function clampMenuPosition(x: number, y: number) {
  const maxLeft = Math.max(COMMIT_MENU_EDGE_GAP, window.innerWidth - COMMIT_MENU_WIDTH - COMMIT_MENU_EDGE_GAP);
  const maxTop = Math.max(COMMIT_MENU_EDGE_GAP, window.innerHeight - COMMIT_MENU_HEIGHT - COMMIT_MENU_EDGE_GAP);
  return {
    left: Math.min(Math.max(x, COMMIT_MENU_EDGE_GAP), maxLeft),
    top: Math.min(Math.max(y, COMMIT_MENU_EDGE_GAP), maxTop),
  };
}

function shortHash(target: CommitActionTarget) {
  return target.shortHash || target.hash.slice(0, 8);
}

function fullCommitMessage(target: CommitActionTarget) {
  return [target.message, target.body].filter(Boolean).join("\n\n");
}

function errorMessage(error: unknown) {
  if (!error) return null;
  return error instanceof Error ? error.message : String(error);
}

function isResetMode(value: string): value is ResetMode {
  return value === "soft" || value === "mixed" || value === "hard";
}

function resetModeEffect(mode: ResetMode) {
  switch (mode) {
    case "soft":
      return "Moves HEAD only. Index and working tree contents stay as-is.";
    case "mixed":
      return "Moves HEAD and resets the index. Working tree file contents stay as-is.";
    case "hard":
      return "Moves HEAD, resets the index, and overwrites tracked working tree files.";
  }
}

function formatResetPreview(preview: ResetPreview | string) {
  if (typeof preview === "string") return preview;

  const lines: string[] = [];
  const target = preview.targetCommit;
  if (preview.summary) lines.push(preview.summary);
  if (target) {
    lines.push(`Target: ${target.shortHash || target.hash.slice(0, 8)} ${target.message}`);
  } else if (preview.targetHash || preview.targetSubject) {
    lines.push(`Target: ${preview.targetHash?.slice(0, 8) ?? "commit"} ${preview.targetSubject ?? ""}`.trim());
  }
  if (preview.currentHead) lines.push(`Current HEAD: ${preview.currentHead.slice(0, 8)}`);

  const removed = preview.commitsToRemove ?? [];
  if (removed.length > 0) {
    lines.push("", `Commits no longer on this branch (${removed.length}):`);
    for (const commit of removed.slice(0, 8)) {
      lines.push(`• ${commit.shortHash || commit.hash.slice(0, 8)} ${commit.message}`);
    }
    if (removed.length > 8) lines.push(`• …and ${removed.length - 8} more`);
  }

  const changedFiles = preview.changedFiles ?? [];
  const legacyFiles = preview.filesChanged ?? [];
  if (changedFiles.length > 0 || legacyFiles.length > 0) {
    lines.push("", `Files changed by the reset target (${changedFiles.length || legacyFiles.length}):`);
    for (const file of changedFiles.slice(0, 10)) lines.push(`• ${file.status} ${file.path}`);
    for (const file of legacyFiles.slice(0, 10)) lines.push(`• ${file}`);
    const overflow = Math.max(changedFiles.length, legacyFiles.length) - 10;
    if (overflow > 0) lines.push(`• …and ${overflow} more`);
  }

  if (preview.warnings?.length) {
    lines.push("", "Warnings:");
    for (const warning of preview.warnings) lines.push(`• ${warning}`);
  }

  return lines.join("\n") || "No reset preview details were returned.";
}

function defaultBranchName(prefix: string, hash: string) {
  return `${prefix}-${hash.slice(0, 8)}`;
}

async function promptBranchName(defaultName: string, sourceLabel: string) {
  const name = (await appDialog.prompt(
    `Create a new branch from ${sourceLabel}.`,
    defaultName,
    "New branch name",
  ))?.trim();
  return name || null;
}

const MAX_INTEGRATION_REFS = 2;

/**
 * Refs sitting on a commit that the current branch can integrate with: the
 * checked-out branch itself and a detached HEAD marker are excluded because
 * merging or rebasing a branch onto itself is a no-op.
 */
function integrableRefs(refs: DisplayRef[] | undefined): DisplayRef[] {
  if (!refs?.length) return [];
  const seen = new Set<string>();
  const usable: DisplayRef[] = [];

  for (const ref of refs) {
    if (ref.isHead || ref.label === "HEAD" || seen.has(ref.label)) continue;
    seen.add(ref.label);
    usable.push(ref);
    if (usable.length === MAX_INTEGRATION_REFS) break;
  }

  return usable;
}

function useHistorySurgeryActions() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const queryClient = useQueryClient();
  const { data: repoInfo } = useQuery(gitQueries.repositoryInfo(activeRepoPath));
  const createBranchMutation = useMutation(gitMutations.createBranch(queryClient, activeRepoPath));
  const cherryPickMutation = useMutation(gitMutations.cherryPickCommit(queryClient, activeRepoPath));
  const revertMutation = useMutation(gitMutations.revertCommit(queryClient, activeRepoPath));
  const previewResetMutation = useMutation(gitMutations.previewResetToCommit(queryClient, activeRepoPath));
  const resetMutation = useMutation(gitMutations.resetToCommit(queryClient, activeRepoPath));
  const previewAmendMutation = useMutation(gitMutations.previewAmend(queryClient, activeRepoPath));
  const amendMutation = useMutation(gitMutations.amendCommit(queryClient, activeRepoPath));
  const checkoutReflogMutation = useMutation(gitMutations.checkoutReflogEntry(queryClient, activeRepoPath));
  const branchFromReflogMutation = useMutation(gitMutations.createBranchFromReflogEntry(queryClient, activeRepoPath));
  const mergeRefMutation = useMutation(gitMutations.mergeBranch(queryClient, activeRepoPath));
  const fastForwardMutation = useMutation(
    gitMutations.fastForwardBranch(queryClient, activeRepoPath),
  );
  const { data: branches } = useQuery(gitQueries.branches(activeRepoPath));
  const previewRebaseMutation = useMutation(gitMutations.previewRebase(activeRepoPath));
  const rebaseUpstreamMutation = useMutation(gitMutations.rebaseUpstream(queryClient, activeRepoPath));
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setPendingAdvancedBranchName = useAppStore((s) => s.setPendingAdvancedBranchName);

  const isBusy =
    createBranchMutation.isPending ||
    cherryPickMutation.isPending ||
    revertMutation.isPending ||
    previewResetMutation.isPending ||
    resetMutation.isPending ||
    previewAmendMutation.isPending ||
    amendMutation.isPending ||
    checkoutReflogMutation.isPending ||
    branchFromReflogMutation.isPending ||
    mergeRefMutation.isPending ||
    fastForwardMutation.isPending ||
    previewRebaseMutation.isPending ||
    rebaseUpstreamMutation.isPending;
  const error =
    createBranchMutation.error ??
    cherryPickMutation.error ??
    revertMutation.error ??
    previewResetMutation.error ??
    resetMutation.error ??
    previewAmendMutation.error ??
    amendMutation.error ??
    checkoutReflogMutation.error ??
    branchFromReflogMutation.error ??
    mergeRefMutation.error ??
    fastForwardMutation.error ??
    previewRebaseMutation.error ??
    rebaseUpstreamMutation.error;

  const cherryPick = async (target: CommitActionTarget) => {
    if (!activeRepoPath) return;
    if (
      !(await appDialog.confirm(
        `Cherry-pick ${shortHash(target)} onto ${repoInfo?.currentBranch ?? "the current branch"}?\n\nThis applies the commit as a new commit. Your working tree must be clean, and Git may stop for conflict resolution.\n\nRecovery if conflicts stop the operation: resolve and continue from the resolver/working tree, or abort the partial cherry-pick from Git if you do not want it.`,
        "Cherry-pick commit?",
      ))
    ) {
      return;
    }
    cherryPickMutation.mutate({ commitHash: target.hash });
  };

  const revert = async (target: CommitActionTarget) => {
    if (!activeRepoPath) return;
    if (
      !(await appDialog.confirm(
        `Revert ${shortHash(target)} on ${repoInfo?.currentBranch ?? "the current branch"}?\n\nThis creates a new commit that reverses that commit. Your working tree must be clean. It does not rewrite existing history, but conflicts may need resolution.\n\nRecovery if conflicts stop the operation: resolve and continue from the resolver/working tree, or abort the partial revert from Git if you do not want it.`,
        "Revert commit?",
      ))
    ) {
      return;
    }
    revertMutation.mutate({ commitHash: target.hash });
  };

  const createBranchFromCommit = async (target: CommitActionTarget) => {
    if (!activeRepoPath) return;
    const branchName = await promptBranchName(defaultBranchName("branch", target.hash), shortHash(target));
    if (!branchName) return;
    const checkout = await appDialog.confirm(
      `Check out "${branchName}" after creating it from ${shortHash(target)}?`,
      "Check out new branch?",
    );
    createBranchMutation.mutate({ name: branchName, checkout, startPoint: target.hash });
  };

  const resetToCommit = async (target: CommitActionTarget, mode: ResetMode) => {
    if (!activeRepoPath) return;

    let previewText: string;
    try {
      previewText = formatResetPreview(
        await previewResetMutation.mutateAsync({ commitHash: target.hash }),
      );
    } catch (error) {
      await appDialog.alert(
        `Unable to preview reset to ${shortHash(target)}: ${errorMessage(error)}`,
        "Reset preview failed",
      );
      return;
    }

    const hardWarning =
      mode === "hard"
        ? "\n\nHARD RESET WILL DISCARD tracked working tree and index changes that differ from the target commit."
        : "";
    if (
      !(await appDialog.confirm(
        `Reset ${repoInfo?.currentBranch ?? "the current branch"} to ${shortHash(target)} using --${mode}?\n\n${resetModeEffect(mode)}${hardWarning}\n\nPreview:\n${previewText}\n\nThis rewrites the current branch tip. Recovery: use the reflog/ORIG_HEAD to create a recovery branch or reset back if this is wrong.`,
        `Reset --${mode}?`,
        mode === "hard" ? "danger" : "warning",
      ))
    ) {
      return;
    }

    resetMutation.mutate({
      commitHash: target.hash,
      mode,
      confirmDiscardChanges: mode === "hard",
    });
  };

  const promptReset = async (target: CommitActionTarget) => {
    const mode = (await appDialog.prompt(
      "Choose reset mode: soft, mixed, or hard.",
      "mixed",
      "Reset mode",
    ))?.trim().toLowerCase();
    if (!mode) return;
    if (!isResetMode(mode)) {
      await appDialog.alert("Reset mode must be soft, mixed, or hard.", "Invalid reset mode");
      return;
    }
    await resetToCommit(target, mode);
  };

  const amendHead = async (target: CommitActionTarget, isHeadCommit: boolean) => {
    if (!activeRepoPath) return;
    if (!isHeadCommit) {
      await appDialog.alert(
        "Only HEAD can be amended. Select the current HEAD commit or create a branch/reset first.",
        "Cannot amend commit",
      );
      return;
    }
    const message = await appDialog.prompt(
      "Enter the new amended commit message.",
      fullCommitMessage(target),
      "Amend HEAD",
    );
    if (message === null) return;
    const request = { message: message.trim() || null };
    let previewText: string;
    try {
      previewText = formatAmendPreview(await previewAmendMutation.mutateAsync(request));
    } catch (error) {
      await appDialog.alert(
        `Unable to preview amend for HEAD (${shortHash(target)}): ${errorMessage(error)}`,
        "Amend preview failed",
      );
      return;
    }
    if (
      !(await appDialog.confirm(
        `Amend HEAD (${shortHash(target)})?\n\nThis rewrites the current branch tip and replaces the HEAD commit with the currently staged changes.\n\nPreview:\n${previewText}`,
        "Amend HEAD?",
        "danger",
      ))
    ) {
      return;
    }
    amendMutation.mutate(request);
  };

  const checkoutReflogEntry = async (entry: ReflogEntry) => {
    if (!activeRepoPath) return;
    if (
      !(await appDialog.confirm(
        `Check out reflog entry ${entry.selector} (${entry.shortHash || entry.hash.slice(0, 8)})?\n\nThis moves the worktree to that recorded HEAD state and may detach HEAD. Your working tree must be clean.`,
        "Check out reflog entry?",
      ))
    ) {
      return;
    }
    checkoutReflogMutation.mutate({ selector: entry.selector });
  };

  const createBranchFromReflog = async (entry: ReflogEntry) => {
    if (!activeRepoPath) return;
    const label = `${entry.selector} (${entry.shortHash || entry.hash.slice(0, 8)})`;
    const branchName = await promptBranchName(defaultBranchName("recover", entry.hash), label);
    if (!branchName) return;
    const checkout = await appDialog.confirm(
      `Check out "${branchName}" after creating it from ${entry.selector}?`,
      "Check out recovery branch?",
    );
    branchFromReflogMutation.mutate({ selector: entry.selector, branchName, checkout });
  };

  const currentBranchLabel = repoInfo?.currentBranch ?? "the current branch";

  const mergeRefIntoCurrent = async (ref: string) => {
    if (!activeRepoPath) return;
    if (
      !(await appDialog.confirm(
        `Merge "${ref}" into ${currentBranchLabel}?\n\nThis records a merge on the current branch. Your working tree must be clean, and Git may stop for conflict resolution.\n\nRecovery if conflicts stop the operation: resolve and continue from the workspace conflict resolver, or abort the merge from Git if you do not want it.`,
        "Merge reference?",
      ))
    ) {
      return;
    }
    mergeRefMutation.mutate(ref);
  };

  const rebaseCurrentOntoRef = async (ref: string) => {
    if (!activeRepoPath) return;
    const request: StartRebaseRequest = {
      upstream: ref,
      onto: null,
      branch: null,
      autostash: true,
    };

    let previewText: string;
    try {
      previewText = formatRebasePreview(await previewRebaseMutation.mutateAsync(request));
    } catch (error) {
      await appDialog.alert(
        `Unable to preview rebase of ${currentBranchLabel} onto ${ref}: ${errorMessage(error)}`,
        "Rebase preview failed",
      );
      return;
    }

    if (
      !(await appDialog.confirm(
        `Rebase ${currentBranchLabel} onto "${ref}"?\n\nThis rewrites local branch history. Make sure important work is backed up or pushed before continuing.\n\nPreview:\n${previewText}\n\nRecovery: abort while the rebase is active, or use ORIG_HEAD/reflog after completion to create a recovery branch or reset back.`,
        "Rebase current branch?",
        "danger",
      ))
    ) {
      return;
    }

    rebaseUpstreamMutation.mutate(request);
  };

  const openAdvancedIntegrate = (ref: string) => {
    setPendingAdvancedBranchName(ref);
    setActiveView("workspace");
  };

  const checkoutRemoteRef = async (refLabel: string) => {
    if (!activeRepoPath) return;
    const localName = localNameForRemoteRef(refLabel);
    if (!localName) {
      await appDialog.alert(
        `"${refLabel}" does not name a branch under a remote.`,
        "Cannot check out remote ref",
      );
      return;
    }
    if (
      !(await appDialog.confirm(
        `No local branch tracks "${refLabel}".\n\nCreate local branch "${localName}" from it and check it out?`,
        "Create tracking branch?",
      ))
    ) {
      return;
    }
    createBranchMutation.mutate({ name: localName, checkout: true, startPoint: refLabel });
  };

  const fastForwardLocalToRef = (localName: string, upstream: string) => {
    if (!activeRepoPath) return;
    fastForwardMutation.mutate({ branchName: localName, upstream });
  };

  const isHead = (target: CommitActionTarget) => repoInfo?.headCommit === target.hash;

  return {
    isBusy,
    error,
    isHead,
    cherryPick,
    revert,
    createBranchFromCommit,
    resetToCommit,
    promptReset,
    amendHead,
    checkoutReflogEntry,
    createBranchFromReflog,
    currentBranchLabel,
    mergeRefIntoCurrent,
    rebaseCurrentOntoRef,
    openAdvancedIntegrate,
    branches,
    checkoutRemoteRef,
    fastForwardLocalToRef,
  };
}


export function CommitActionStrip({ target, isHeadCommit, compact = false, refs }: CommitActionStripProps) {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const openMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuPosition({ x: event.clientX, y: event.clientY });
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={Boolean(menuPosition)}
        title="Commit actions"
        onClick={openMenu}
        onContextMenu={openMenu}
        className={cn(
          "inline-flex items-center justify-center rounded border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]",
          compact ? "ml-auto h-5 w-6" : "gap-1 px-2 py-0.5 text-[10.5px]",
        )}
      >
        <MoreHorizontal className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        {!compact ? <span>Actions</span> : <span className="sr-only">Commit actions</span>}
      </button>
      {menuPosition ? (
        <CommitActionContextMenu
          target={target}
          isHeadCommit={isHeadCommit}
          refs={refs}
          x={menuPosition.x}
          y={menuPosition.y}
          onClose={() => setMenuPosition(null)}
        />
      ) : null}
    </>
  );
}

function remoteRefEntries(
  refs: DisplayRef[] | undefined,
  branches: Branch[] | undefined,
): RemoteRefEntry[] {
  if (!refs?.length || !branches?.length) return [];

  const entries: RemoteRefEntry[] = [];
  for (const ref of refs) {
    if (!ref.isRemote) continue;
    const remote = branches.find(
      (branch) => branch.isRemote && branch.shortName === ref.label,
    );
    if (!remote) continue;

    const plan = planBranchActivation(remote, branches);
    switch (plan.kind) {
      case "create-tracking":
        entries.push({ kind: "checkout", refLabel: ref.label, localName: plan.localName });
        break;
      case "fast-forward":
        entries.push({
          kind: "fast-forward",
          refLabel: ref.label,
          localName: plan.local.shortName,
          behind: plan.behind,
        });
        break;
      case "already-synced":
        entries.push({ kind: "synced", refLabel: ref.label, localName: plan.local.shortName });
        break;
      case "diverged":
        entries.push({
          kind: "diverged",
          refLabel: ref.label,
          localName: plan.local.shortName,
          ahead: plan.ahead,
          behind: plan.behind,
        });
        break;
    }
  }
  return entries;
}

export function CommitActionContextMenu({
  target,
  isHeadCommit,
  refs,
  x,
  y,
  onClose,
}: {
  target: CommitActionTarget;
  isHeadCommit?: boolean;
  refs?: DisplayRef[];
  x: number;
  y: number;
  onClose: () => void;
}) {
  const actions = useHistorySurgeryActions();
  const integrationRefs = integrableRefs(refs);
  const remoteEntries = remoteRefEntries(refs, actions.branches);
  const head = isHeadCommit ?? actions.isHead(target);
  const position = clampMenuPosition(x, y);

  useEffect(() => {
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);

    return () => {
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  if (typeof document === "undefined" || !document.body) return null;


  return createPortal(
    <div
      className="fixed inset-0 z-[110]"
      role="presentation"
      onMouseDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        role="menu"
        aria-label={`Commit actions for ${shortHash(target)}`}
        className="giteye-context-menu w-[300px] rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] shadow-[var(--shadow-elevated)]"
        style={{ left: position.left, top: position.top, position: "fixed" }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="giteye-context-header flex items-baseline gap-2 border-b border-[var(--color-border-muted)]">
          <span className="font-mono text-[11px] font-semibold text-[var(--color-accent)]">{shortHash(target)}</span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--color-text-muted)]">{target.message}</span>
        </div>
        <CommitMenuItem
          label="Cherry-pick"
          detail="apply onto current branch"
          disabled={actions.isBusy}
          onSelect={() => actions.cherryPick(target)}
          onClose={onClose}
        />
        <CommitMenuItem
          label="Revert"
          detail="new commit that reverses it"
          disabled={actions.isBusy}
          onSelect={() => actions.revert(target)}
          onClose={onClose}
        />
        <CommitMenuItem
          label="New branch from commit"
          detail="start a branch here"
          disabled={actions.isBusy}
          onSelect={() => actions.createBranchFromCommit(target)}
          onClose={onClose}
        />
        {integrationRefs.length > 0 ? (
          <>
            <div className="giteye-context-separator" />
            <div className="px-2.5 pb-0.5 pt-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
              Integrate refs on this commit
            </div>
            {integrationRefs.map((ref) => (
              <Fragment key={`integrate-${ref.label}`}>
                <CommitMenuItem
                  label={`Merge ${ref.label} into ${actions.currentBranchLabel}`}
                  detail="into checked-out branch"
                  disabled={actions.isBusy}
                  onSelect={() => actions.mergeRefIntoCurrent(ref.label)}
                  onClose={onClose}
                />
                <CommitMenuItem
                  label={`Rebase ${actions.currentBranchLabel} onto ${ref.label}`}
                  detail="replay current branch"
                  tone="danger"
                  disabled={actions.isBusy}
                  onSelect={() => void actions.rebaseCurrentOntoRef(ref.label)}
                  onClose={onClose}
                />
              </Fragment>
            ))}
            <CommitMenuItem
              label={`Advanced merge & rebase with ${integrationRefs[0].label}`}
              detail="open integrate drawer"
              tone="primary"
              disabled={actions.isBusy}
              onSelect={() => actions.openAdvancedIntegrate(integrationRefs[0].label)}
              onClose={onClose}
            />
          </>
        ) : null}
        {remoteEntries.length > 0 ? (
          <>
            <div className="giteye-context-separator" />
            <div className="px-2.5 pb-0.5 pt-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
              Remote branches on this commit
            </div>
            {remoteEntries.map((entry) => {
              if (entry.kind === "checkout") {
                return (
                  <CommitMenuItem
                    key={`checkout-${entry.refLabel}`}
                    label={`Checkout ${entry.refLabel}`}
                    detail={
                      entry.localName
                        ? `creates "${entry.localName}" tracking it`
                        : "cannot derive a local branch name"
                    }
                    disabled={actions.isBusy || !entry.localName}
                    onSelect={() => void actions.checkoutRemoteRef(entry.refLabel)}
                    onClose={onClose}
                  />
                );
              }
              const label = `Fast-forward ${entry.localName}`;
              if (entry.kind === "fast-forward") {
                return (
                  <CommitMenuItem
                    key={`ff-${entry.refLabel}`}
                    label={label}
                    detail={
                      entry.behind > 0
                        ? `to ${entry.refLabel} (${entry.behind} behind)`
                        : `to ${entry.refLabel}`
                    }
                    disabled={actions.isBusy}
                    onSelect={() =>
                      actions.fastForwardLocalToRef(entry.localName, entry.refLabel)
                    }
                    onClose={onClose}
                  />
                );
              }
              return (
                <CommitMenuItem
                  key={`${entry.kind}-${entry.refLabel}`}
                  label={label}
                  detail={
                    entry.kind === "synced"
                      ? `already matches ${entry.refLabel}`
                      : `diverged from ${entry.refLabel} (${entry.ahead} ahead, ${entry.behind} behind)`
                  }
                  disabled
                  onSelect={() => undefined}
                  onClose={onClose}
                />
              );
            })}
          </>
        ) : null}
        <div className="giteye-context-separator" />
        <CommitMenuItem
          label="Reset current branch: soft"
          detail="HEAD only"
          title={resetModeEffect("soft")}
          tone="danger"
          disabled={actions.isBusy}
          onSelect={() => void actions.resetToCommit(target, "soft")}
          onClose={onClose}
        />
        <CommitMenuItem
          label="Reset current branch: mixed"
          detail="HEAD + index"
          title={resetModeEffect("mixed")}
          tone="danger"
          disabled={actions.isBusy}
          onSelect={() => void actions.resetToCommit(target, "mixed")}
          onClose={onClose}
        />
        <CommitMenuItem
          label="Reset current branch: hard"
          detail="HEAD + index + files"
          title={resetModeEffect("hard")}
          tone="danger"
          disabled={actions.isBusy}
          onSelect={() => void actions.resetToCommit(target, "hard")}
          onClose={onClose}
        />
        <div className="giteye-context-separator" />
        <CommitMenuItem
          label="Amend HEAD"
          detail={head ? "rewrite with staged changes" : "only HEAD can be amended"}
          tone="primary"
          disabled={actions.isBusy || !head}
          onSelect={() => actions.amendHead(target, head)}
          onClose={onClose}
        />
        {actions.error ? (
          <p className="border-t border-[var(--color-border-muted)] px-2.5 py-1.5 text-[10.5px] leading-snug text-[var(--color-danger)]">
            {errorMessage(actions.error)}
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function CommitMenuItem({
  label,
  detail,
  title,
  disabled,
  tone = "default",
  onSelect,
  onClose,
}: {
  label: string;
  detail: string;
  /** Hover text when the inline detail is an abbreviation. */
  title?: string;
  disabled?: boolean;
  tone?: "default" | "danger" | "primary";
  onSelect: () => void;
  onClose: () => void;
}) {
  const toneClass =
    tone === "primary"
      ? "text-[var(--color-accent)]"
      : tone === "danger"
        ? "text-[var(--color-danger)]"
        : "text-[var(--color-text-primary)]";

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title ?? `${label} — ${detail}`}
      onClick={() => {
        if (disabled) return;
        onClose();
        onSelect();
      }}
      className={cn("giteye-context-item", toneClass)}
    >
      <span className="giteye-context-label">{label}</span>
      <span className="giteye-context-detail">{detail}</span>
    </button>
  );
}

function formatReflogTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function ReflogRecoveryPanel({ open }: ReflogRecoveryPanelProps) {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const actions = useHistorySurgeryActions();
  const reflogQuery = useQuery(gitQueries.reflog(activeRepoPath, 30, open));
  const entries = reflogQuery.data ?? [];

  if (!open) return null;

  return (
    <div className="border-b border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[12px] font-semibold text-[var(--color-text-primary)]">Reflog recovery</h3>
          <p className="text-[11px] text-[var(--color-text-muted)]">Create a branch from a previous HEAD or check it out after confirming.</p>
        </div>
        {reflogQuery.isFetching ? <span className="text-[11px] text-[var(--color-text-muted)]">Loading…</span> : null}
      </div>
      {reflogQuery.error ? (
        <p className="rounded-md border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-2 py-1.5 text-[11px] text-[var(--color-danger)]">
          Failed to load reflog: {errorMessage(reflogQuery.error)}
        </p>
      ) : entries.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--color-border-muted)] px-2 py-3 text-center text-[11px] text-[var(--color-text-muted)]">
          No reflog entries reported.
        </p>
      ) : (
        <div className="max-h-56 overflow-auto rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-secondary)]/65">
          {entries.map((entry) => (
            <div key={`${entry.selector}-${entry.hash}`} className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-2 border-b border-[var(--color-border-muted)] px-2 py-1.5 text-[11px] last:border-b-0">
              <span className="font-mono text-[var(--color-accent)]">{entry.selector}</span>
              <div className="min-w-0">
                <div className="truncate text-[var(--color-text-primary)]">{entry.message}</div>
                <div className="truncate text-[10px] text-[var(--color-text-muted)]">
                  {(entry.shortHash || entry.hash.slice(0, 8))} · {entry.authorName ?? "unknown"} · {formatReflogTime(entry.timestamp)}
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={actions.isBusy}
                  onClick={(event) => {
                    event.stopPropagation();
                    actions.createBranchFromReflog(entry);
                  }}
                >
                  Branch
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={actions.isBusy}
                  onClick={(event) => {
                    event.stopPropagation();
                    actions.checkoutReflogEntry(entry);
                  }}
                >
                  Checkout
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
