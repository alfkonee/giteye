import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { gitMutations } from "./git-data";
import { useNoticeStore } from "../stores/notice-store";
import type { Branch } from "../types/git";
import type { CheckoutBranchStrategy } from "./tauri-api";

/** Local name a remote-tracking ref maps onto: `origin/feature/x` → `feature/x`. */
export function localNameForRemoteBranch(remote: Branch): string {
  const separator = remote.shortName.indexOf("/");
  return separator < 1 ? "" : remote.shortName.slice(separator + 1);
}

/**
 * Local branch that owns a remote-tracking ref. Configured upstream wins; a
 * same-name local branch is the fallback so freshly created branches that lost
 * their upstream config still resolve.
 */
export function findTrackingLocalBranch(
  remote: Branch,
  branches: Branch[],
): Branch | null {
  const byUpstream = branches.find(
    (branch) => !branch.isRemote && branch.upstream === remote.shortName,
  );
  if (byUpstream) return byUpstream;

  const localName = localNameForRemoteBranch(remote);
  if (!localName) return null;
  return (
    branches.find(
      (branch) => !branch.isRemote && branch.shortName === localName,
    ) ?? null
  );
}

export type BranchActivationPlan =
  | { kind: "already-current"; branch: Branch }
  | { kind: "switch-local"; branch: Branch }
  | { kind: "create-tracking"; remote: Branch; localName: string }
  | { kind: "fast-forward"; remote: Branch; local: Branch; behind: number }
  | { kind: "already-synced"; remote: Branch; local: Branch; ahead: number }
  | { kind: "diverged"; remote: Branch; local: Branch; ahead: number; behind: number };

/**
 * Decides what activating (double-clicking) a branch row should do.
 *
 * Local branches switch. Remote branches resolve to their tracking local
 * branch: create-and-check-out when none exists, fast-forward when the local
 * side is strictly behind, and refuse with a diverged plan when Git could not
 * fast-forward. Ahead/behind counts are only trusted when the local branch
 * actually tracks the ref that was activated.
 */
export function planBranchActivation(
  branch: Branch,
  branches: Branch[],
): BranchActivationPlan {
  if (!branch.isRemote) {
    return branch.isCurrent
      ? { kind: "already-current", branch }
      : { kind: "switch-local", branch };
  }

  const local = findTrackingLocalBranch(branch, branches);
  if (!local) {
    return {
      kind: "create-tracking",
      remote: branch,
      localName: localNameForRemoteBranch(branch),
    };
  }

  if (local.upstream !== branch.shortName) {
    // Name match without tracking config: counts describe another upstream, so
    // let Git's own ancestry check decide whether the fast-forward is legal.
    return { kind: "fast-forward", remote: branch, local, behind: 0 };
  }

  const ahead = local.ahead ?? 0;
  const behind = local.behind ?? 0;
  if (ahead > 0 && behind > 0) {
    return { kind: "diverged", remote: branch, local, ahead, behind };
  }
  if (behind > 0) {
    return { kind: "fast-forward", remote: branch, local, behind };
  }
  return { kind: "already-synced", remote: branch, local, ahead };
}


/** Row tooltip describing what a double-click on this branch will do. */
export function describeBranchActivation(branch: Branch, branches: Branch[]): string {
  const plan = planBranchActivation(branch, branches);
  switch (plan.kind) {
    case "already-current":
      return "Current branch";
    case "switch-local":
      return "Double-click to switch branch";
    case "create-tracking":
      return plan.localName
        ? `Double-click to create local branch "${plan.localName}" tracking ${plan.remote.shortName}`
        : `${plan.remote.shortName} does not name a branch under a remote`;
    case "fast-forward":
      return plan.local.isCurrent
        ? `Double-click to fast-forward ${plan.local.shortName} to ${plan.remote.shortName}`
        : `Double-click to switch to ${plan.local.shortName} and fast-forward it to ${plan.remote.shortName}`;
    case "already-synced":
      return plan.local.isCurrent
        ? `${plan.local.shortName} already matches ${plan.remote.shortName}`
        : `Double-click to switch to ${plan.local.shortName} (already matches ${plan.remote.shortName})`;
    case "diverged":
      return `${plan.local.shortName} diverged from ${plan.remote.shortName} (${plan.ahead} ahead, ${plan.behind} behind)`;
  }
}

function notifyInfo(title: string, detail: string, repoPath: string | null) {
  const notices = useNoticeStore.getState();
  const id = notices.startNotice({ title, detail, repoPath, status: "info" });
  notices.finishNotice(id, "info", detail);
}

interface BranchSwitchTarget {
  branch: Branch;
  /** Ref to fast-forward the branch onto once the checkout lands. */
  fastForwardTo: string | null;
}

export interface UseBranchActivationOptions {
  repoPath: string | null;
  branches: Branch[];
  /** Opens the advanced merge/rebase controls prefilled with a ref. */
  onAdvancedIntegrate?: (ref: string) => void;
}

/**
 * Shared double-click behavior for every branch surface (sidebar tree, branch
 * list). Owns the checkout confirmation dialog state plus the follow-up
 * fast-forward so remote rows behave identically wherever they are rendered.
 */
export function useBranchActivation({
  repoPath,
  branches,
  onAdvancedIntegrate,
}: UseBranchActivationOptions) {
  const queryClient = useQueryClient();
  const checkoutMutation = useMutation(
    gitMutations.checkoutBranch(queryClient, repoPath),
  );
  const createMutation = useMutation(
    gitMutations.createBranch(queryClient, repoPath),
  );
  const fastForwardMutation = useMutation(
    gitMutations.fastForwardBranch(queryClient, repoPath),
  );
  const [switchTarget, setSwitchTarget] = useState<BranchSwitchTarget | null>(
    null,
  );

  const activateBranch = (branch: Branch) => {
    const plan = planBranchActivation(branch, branches);

    switch (plan.kind) {
      case "already-current":
        return;

      case "switch-local":
        setSwitchTarget({ branch: plan.branch, fastForwardTo: null });
        return;

      case "create-tracking": {
        if (!plan.localName) {
          notifyInfo(
            "Cannot check out remote ref",
            `"${plan.remote.shortName}" does not name a branch under a remote.`,
            repoPath,
          );
          return;
        }
        if (
          !window.confirm(
            `No local branch tracks "${plan.remote.shortName}".\n\nCreate local branch "${plan.localName}" from it and check it out?`,
          )
        ) {
          return;
        }
        createMutation.mutate({
          name: plan.localName,
          checkout: true,
          startPoint: plan.remote.shortName,
        });
        return;
      }

      case "diverged": {
        if (
          window.confirm(
            `"${plan.local.shortName}" and "${plan.remote.shortName}" have diverged (${plan.ahead} ahead, ${plan.behind} behind).\n\nFast-forward is not possible. Open the merge & rebase controls prefilled with "${plan.remote.shortName}"?`,
          )
        ) {
          onAdvancedIntegrate?.(plan.remote.shortName);
        }
        return;
      }

      case "already-synced": {
        if (!plan.local.isCurrent) {
          setSwitchTarget({ branch: plan.local, fastForwardTo: null });
          return;
        }
        notifyInfo(
          "Already up to date",
          plan.ahead > 0
            ? `${plan.local.shortName} is ${plan.ahead} ahead of ${plan.remote.shortName}; nothing to fast-forward.`
            : `${plan.local.shortName} already matches ${plan.remote.shortName}.`,
          repoPath,
        );
        return;
      }

      case "fast-forward": {
        if (!plan.local.isCurrent) {
          setSwitchTarget({
            branch: plan.local,
            fastForwardTo: plan.remote.shortName,
          });
          return;
        }
        fastForwardMutation.mutate({
          branchName: plan.local.shortName,
          upstream: plan.remote.shortName,
        });
        return;
      }
    }
  };

  const confirmSwitch = (strategy: CheckoutBranchStrategy) => {
    const target = switchTarget;
    if (!target) return;
    checkoutMutation.mutate(
      { branchName: target.branch.shortName, strategy },
      {
        onSuccess: () => {
          setSwitchTarget(null);
          if (target.fastForwardTo) {
            fastForwardMutation.mutate({
              branchName: target.branch.shortName,
              upstream: target.fastForwardTo,
            });
          }
        },
      },
    );
  };

  return {
    activateBranch,
    switchBranch: switchTarget?.branch ?? null,
    switchFollowUp: switchTarget?.fastForwardTo
      ? `GitEye will fast-forward ${switchTarget.branch.shortName} to ${switchTarget.fastForwardTo} right after the switch.`
      : null,
    switchPending: checkoutMutation.isPending,
    confirmSwitch,
    cancelSwitch: () => setSwitchTarget(null),
    isPending:
      checkoutMutation.isPending ||
      createMutation.isPending ||
      fastForwardMutation.isPending,
    error:
      checkoutMutation.error ?? createMutation.error ?? fastForwardMutation.error,
  };
}
