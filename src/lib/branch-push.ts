import { formatDryRunPreview } from "./git-preview";
import type { PushBranchRequest } from "./tauri-api";

export interface BranchPushTarget {
  shortName: string;
  upstream: string | null;
}

export interface BranchPushFlowOptions {
  branch: BranchPushTarget;
  remoteNames: string[];
  forceWithLease: boolean;
  dryRunPreview: (request: PushBranchRequest) => Promise<string[]>;
  submitPush: (request: PushBranchRequest) => void;
}

/**
 * Shared push flow used by every entry point (Toolbar, Branches, Command Palette).
 *
 * When the branch has no upstream it walks the user through publishing it and
 * setting upstream tracking; otherwise it pushes to the existing upstream.
 * Returns `true` when a push was submitted, `false` when the user canceled or
 * the flow aborted before submitting.
 */
export async function runBranchPushFlow(
  options: BranchPushFlowOptions,
): Promise<boolean> {
  const { branch, remoteNames, forceWithLease, dryRunPreview, submitPush } =
    options;
  const needsUpstream = !branch.upstream;
  const remote = window
    .prompt(
      needsUpstream
        ? `Add upstream for "${branch.shortName}" — remote`
        : "Push to remote",
      branch.upstream?.split("/", 1)[0] ?? remoteNames[0] ?? "origin",
    )
    ?.trim();
  if (!remote) return false;
  const upstreamBranch = branch.upstream?.startsWith(`${remote}/`)
    ? branch.upstream.slice(remote.length + 1)
    : branch.shortName;
  const remoteBranch = window
    .prompt(
      needsUpstream
        ? `Add upstream for "${branch.shortName}" — remote branch`
        : "Remote branch name",
      upstreamBranch,
    )
    ?.trim();
  if (remoteBranch === undefined) return false;
  const target = `${remote}/${remoteBranch || branch.shortName}`;
  const setUpstream =
    !forceWithLease &&
    (needsUpstream ||
      window.confirm(
        `Set "${branch.shortName}" to track ${target} after push?`,
      ));
  const request: PushBranchRequest = {
    remote,
    localBranch: branch.shortName,
    remoteBranch: remoteBranch || null,
    setUpstream,
    forceWithLease,
  };
  let previewText: string;
  try {
    previewText = formatDryRunPreview(
      await dryRunPreview(request),
      "Git did not report any ref updates for this push dry run.",
    );
  } catch (error) {
    window.alert(
      `Unable to preview push to ${target}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
  const forceWarning = forceWithLease
    ? "\n\nThis can rewrite the remote branch if your lease is current. Recovery: keep the old remote tip from a collaborator, reflog, or host audit log and push a recovery branch if this is wrong."
    : "";
  if (
    !window.confirm(
      `Push "${branch.shortName}" to ${target}?${forceWarning}\n\nPreview:\n${previewText}`,
    )
  ) {
    return false;
  }
  submitPush(request);
  return true;
}
