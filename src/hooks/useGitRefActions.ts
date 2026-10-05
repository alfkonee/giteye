import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitActionErrorMessage as describeError, gitMutations, gitQueries } from "../lib/git-data";
import { formatDryRunPreview } from "../lib/git-preview";
import { gitApi } from "../lib/tauri-api";
import { useAppStore } from "../stores/app-store";
import { useNoticeStore } from "../stores/notice-store";
import type { GitTag, StashEntry } from "../types/git";
import { appDialog } from "../components/common/AppDialogProvider";

function previewLines(lines: string[]) {
  if (!lines.length) return "No file-level preview was returned.";
  const visible = lines.slice(0, 80);
  return visible.join("\n") + (lines.length > 80 ? `\n…${lines.length - 80} more preview line(s) omitted.` : "");
}

/** The same preview, confirmation and mutation flow is used by history and management views. */
export function useGitRefActions() {
  const repoPath = useAppStore((state) => state.activeRepoPath);
  const queryClient = useQueryClient();
  const remotes = useQuery(gitQueries.remotes(repoPath));
  const createTagMutation = useMutation(gitMutations.createTag(queryClient, repoPath));
  const createStashMutation = useMutation(gitMutations.createStash(queryClient, repoPath));
  const applyMutation = useMutation(gitMutations.applyStash(queryClient, repoPath));
  const popMutation = useMutation(gitMutations.popStash(queryClient, repoPath));
  const dropMutation = useMutation(gitMutations.dropStash(queryClient, repoPath));
  const stashBranchMutation = useMutation(gitMutations.createBranchFromStash(queryClient, repoPath));
  const tagCheckoutMutation = useMutation(gitMutations.checkoutTag(queryClient, repoPath));
  const branchMutation = useMutation(gitMutations.createBranch(queryClient, repoPath));
  const pushMutation = useMutation(gitMutations.pushTag(queryClient, repoPath));
  const deleteMutation = useMutation(gitMutations.deleteTag(queryClient, repoPath));
  const deleteRemoteMutation = useMutation(gitMutations.deleteRemoteTag(queryClient, repoPath));
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const run = async (label: string, action: (path: string) => Promise<void>) => {
    if (busyRef.current || !repoPath) return;
    busyRef.current = true;
    setIsBusy(true);
    setError(null);
    try {
      await action(repoPath);
    } catch (caught) {
      const detail = describeError(caught);
      setError(detail);
      useNoticeStore.getState().startNotice({ title: `${label} failed`, detail, repoPath, status: "error" });
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  };

  const guardOperation = async (path: string) => {
    const operation = await gitApi.getOperationSummary(path);
    if (operation.operation || operation.conflicts.length) {
      await appDialog.alert("Finish or abort the active Git operation and resolve unmerged files before changing saved work.", "Operation in progress");
      return false;
    }
    return true;
  };

  const chooseRemote = async (label: string) => {
    const configured = remotes.data ?? await queryClient.fetchQuery(gitQueries.remotes(repoPath));
    if (!configured.length) {
      await appDialog.alert("Add a remote before using this action.", "No remote configured");
      return null;
    }
    return (await appDialog.prompt(`${label} remote:`, configured[0]?.name ?? "origin", "Choose remote"))?.trim() || null;
  };

  const createTag = (target?: string) => run("Create tag", async () => {
    const name = (await appDialog.prompt("Name for the new tag:", "", "Create tag"))?.trim();
    if (!name) return;
    const message = await appDialog.prompt("Annotation message (leave blank for a lightweight tag):", "", "Tag annotation");
    if (message === null) return;
    await createTagMutation.mutateAsync({ name, target, message: message.trim() || undefined });
  });

  const createStash = () => run("Create stash", async (path) => {
    if (!(await guardOperation(path))) return;
    const message = await appDialog.prompt("Optional stash message:", "", "Create stash");
    if (message === null) return;
    const includeUntracked = await appDialog.confirm("Include untracked files in this stash? Choose Cancel to save tracked changes only.", "Include untracked files?");
    if (!(await appDialog.confirm(`Save current staged and unstaged changes${includeUntracked ? ", including untracked files" : ""} to a stash?`, "Create stash?"))) return;
    await createStashMutation.mutateAsync({ message: message.trim() || undefined, includeUntracked });
  });

  const stashAction = (stash: StashEntry, action: "apply" | "pop") => run(`${action} stash`, async (path) => {
    if (!(await guardOperation(path))) return;
    let preview: string[];
    try {
      preview = await gitApi.previewStash(path, stash);
    } catch (caught) {
      await appDialog.alert(`Unable to preview ${stash.name}: ${describeError(caught)}`, "Stash preview failed");
      return;
    }
    const isPop = action === "pop";
    if (!(await appDialog.confirm(
      `${isPop ? "Pop" : "Apply"} ${stash.name}?\n\n${stash.message || "Stashed changes"}${isPop ? "\n\nPop removes the stash entry after a successful application." : ""}\n\nPreview:\n${previewLines(preview)}`,
      `${isPop ? "Pop" : "Apply"} stash?`, isPop ? "danger" : "warning",
    ))) return;
    if (isPop) await popMutation.mutateAsync(stash);
    else await applyMutation.mutateAsync(stash);
  });

  const applyStash = (stash: StashEntry) => stashAction(stash, "apply");
  const popStash = (stash: StashEntry) => stashAction(stash, "pop");
  const dropStash = (stash: StashEntry) => run("Drop stash", async () => {
    if (!(await appDialog.confirm(
      `Drop ${stash.name}?\n\n${stash.message || "Stashed changes"}\n\nThis removes the stash entry. Recovery may require reflog/manual Git recovery if this was accidental.`,
      "Drop stash?", "danger",
    ))) return;
    await dropMutation.mutateAsync(stash);
  });
  const branchFromStash = (stash: StashEntry) => run("Create branch from stash", async (path) => {
    if (!(await guardOperation(path))) return;
    const name = (await appDialog.prompt(`Name the branch to create at the original base ${stash.baseCommitHash.slice(0, 8)}. The saved work will be restored on it.`, `stash-${stash.shortHash}`, "Create branch from stash"))?.trim();
    if (!name) return;
    if (!(await appDialog.confirm(`Create and check out branch "${name}" at ${stash.baseCommitHash.slice(0, 8)}, restore ${stash.name}, then remove that stash only after successful application? Your working tree must be clean.`, "Restore stash on new branch?", "warning"))) return;
    await stashBranchMutation.mutateAsync({ name, stash });
  });
  const checkoutTag = (tag: GitTag) => run("Checkout tag", async (path) => {
    if (!(await guardOperation(path)) || !tag.commitHash) return;
    if (!(await appDialog.confirm(`Check out tag "${tag.name}" at ${tag.commitHash}? This detaches HEAD from your current branch. Your working tree must be clean.`, "Checkout detached HEAD?", "warning"))) return;
    await tagCheckoutMutation.mutateAsync({ name: tag.name, commitHash: tag.commitHash });
  });
  const branchFromTag = (tag: GitTag) => run("Create branch from tag", async (path) => {
    if (!(await guardOperation(path)) || !tag.commitHash) return;
    const name = (await appDialog.prompt(`Name the branch starting at tag "${tag.name}" (${tag.commitHash.slice(0, 8)}).`, tag.name.replace(/[^a-zA-Z0-9/_-]/g, "-") || `tag-${tag.shortHash}`, "New branch name"))?.trim();
    if (!name) return;
    if (!(await appDialog.confirm(`Create branch "${name}" at ${tag.commitHash.slice(0, 8)} and check it out? Your working tree must be clean.`, "Create branch from tag?"))) return;
    if (!(await guardOperation(path))) return;
    if ((await gitApi.getStatus(path)).length > 0) {
      await appDialog.alert("Commit or stash your local changes before creating and checking out a branch from a tag.", "Working tree is not clean");
      return;
    }
    await branchMutation.mutateAsync({ name, checkout: true, startPoint: tag.commitHash });
  });
  const pushTag = (tag: GitTag) => run("Push tag", async (path) => {
    const remote = await chooseRemote(`Push "${tag.name}" to`);
    if (!remote) return;
    let preview: string;
    try {
      preview = formatDryRunPreview(await gitApi.pushTagDryRun(path, remote, tag.name), "Git did not report any ref updates for this tag push dry run.");
    } catch (caught) {
      await appDialog.alert(`Unable to preview tag push for "${tag.name}": ${describeError(caught)}`, "Tag push preview failed");
      return;
    }
    if (!(await appDialog.confirm(`Push tag "${tag.name}" to ${remote}?\n\nPreview:\n${preview}`, "Push tag?"))) return;
    await pushMutation.mutateAsync({ remote, name: tag.name });
  });
  const deleteLocalTag = (tag: GitTag) => run("Delete local tag", async () => {
    if (!(await appDialog.confirm(`Delete local tag "${tag.name}"? This does not remove the tag from remotes.`, "Delete local tag?", "danger"))) return;
    await deleteMutation.mutateAsync(tag.name);
  });
  const deleteRemoteTag = (tag: GitTag) => run("Delete remote tag", async (path) => {
    const remote = await chooseRemote(`Delete "${tag.name}" from`);
    if (!remote) return;
    let preview: string;
    try {
      preview = formatDryRunPreview(await gitApi.deleteRemoteTagDryRun(path, remote, tag.name), "Git did not report a ref deletion for this remote tag dry run.");
    } catch (caught) {
      await appDialog.alert(`Unable to preview remote tag deletion for "${tag.name}": ${describeError(caught)}`, "Remote tag deletion preview failed");
      return;
    }
    if (!(await appDialog.confirm(`Delete remote tag "${tag.name}" from ${remote}?\n\nPreview:\n${preview}\n\nThis does not delete the local tag. Recovery: push the local tag again, or recreate it at the intended commit before pushing.`, "Delete remote tag?", "danger"))) return;
    await deleteRemoteMutation.mutateAsync({ remote, name: tag.name });
  });

  return { isBusy, error, createTag, createStash, applyStash, popStash, dropStash, branchFromStash, checkoutTag, branchFromTag, pushTag, deleteLocalTag, deleteRemoteTag };
}
