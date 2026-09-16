import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { gitActionErrorMessage, gitKeys, gitQueries } from "./git-data";
import { useAppStore } from "../stores/app-store";
import type { Branch, BranchPullRequestMatch } from "../types/git";
import { appDialog } from "../components/common/AppDialogProvider";

/** Only mount with a selected branch after the user opens a menu or PR dialog. */
export function useBranchPullRequests(repoPath: string | null, branch: Branch | null) {
  const queryClient = useQueryClient();
  const activeRepoPath = useAppStore((state) => state.activeRepoPath);
  const selection = useRef({ branch, repoPath });
  if (selection.current.branch !== branch) selection.current = { branch, repoPath };
  const isCurrentSelection = Boolean(branch && repoPath)
    && repoPath === activeRepoPath && selection.current.repoPath === repoPath;
  const query = useQuery(gitQueries.branchPullRequests(repoPath, branch?.name ?? null, isCurrentSelection));

  const openPullRequest = async (pullRequest: BranchPullRequestMatch) => {
    if (!isCurrentSelection || useAppStore.getState().activeRepoPath !== repoPath
      || pullRequest.state.toLowerCase() !== "open") return false;
    if (!pullRequest.reviewInApp) {
      try {
        if (!pullRequest.url) throw new Error("GitHub did not return a pull request URL.");
        await openUrl(pullRequest.url);
        return true;
      } catch (error) {
        await appDialog.alert(gitActionErrorMessage(error), "Unable to open pull request");
        return false;
      }
    }
    queryClient.setQueryData(gitKeys.pullRequestSummary(repoPath, pullRequest.number), pullRequest);
    const store = useAppStore.getState();
    store.setSelectedPullRequestId(String(pullRequest.number));
    store.setActiveView("review-studio");
    return true;
  };

  return { query, openPullRequest, isCurrentSelection };
}
