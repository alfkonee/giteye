import { useQuery } from "@tanstack/react-query";
import { GitPullRequest, PlugZap, RefreshCw, ShieldCheck } from "lucide-react";
import { gitQueries } from "../../lib/git-data";
import { useAppStore } from "../../stores/app-store";
import { EmptyState } from "../common/EmptyState";
import { ErrorCallout } from "../common/ErrorCallout";
import { LoadingSpinner } from "../common/LoadingSpinner";

export function CollaborationConnect() {
  const activeRepoPath = useAppStore((s) => s.activeRepoPath);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const providerQuery = useQuery(
    gitQueries.githubOverview(activeRepoPath, Boolean(activeRepoPath)),
  );
  const overview = providerQuery.data;
  const providerLabel = overview?.owner && overview.repo
    ? `${overview.owner}/${overview.repo}`
    : "this repository";
  const canOpenProviderViews = Boolean(
    overview?.providerAvailable && overview.isGithubRepository,
  );

  if (!activeRepoPath) {
    return (
      <EmptyState
        icon={<PlugZap className="h-8 w-8" />}
        title="Open a repository"
        description="Provider collaboration is scoped to the active local repository."
      />
    );
  }

  return (
    <div className="h-full overflow-auto bg-[var(--color-bg-primary)] p-6">
      <div className="mx-auto max-w-3xl rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 shadow-[var(--shadow-panel)]">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] text-[var(--color-accent)]">
            <PlugZap className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              Collaboration
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
              Connect provider context
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">
              GitEye keeps local Git tools primary. Provider views load only after
              this explicit entry is opened, so background PR/review requests do
              not run while you are working in core repository views.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-primary)] p-4">
          {providerQuery.isLoading ? (
            <div className="flex items-center gap-3 text-sm text-[var(--color-text-secondary)]">
              <LoadingSpinner size="sm" />
              Checking provider capability for the active repository…
            </div>
          ) : providerQuery.error ? (
            <ErrorCallout message={`Provider metadata unavailable: ${String(providerQuery.error)}`} />
          ) : canOpenProviderViews ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-success)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                    GitHub collaboration is available for {providerLabel}.
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                    {overview?.account
                      ? `Connected as ${overview.account.login}.`
                      : "No account login was returned; public repository data may still be available."} {overview?.pullRequests.length ?? 0} pull requests, {overview?.checkRuns.length ?? 0} checks, and {overview?.reviews.length ?? 0} reviews are cached for this repository.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setActiveView("stacked-prs")}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--color-bg-selected)] px-3 text-sm font-semibold text-white hover:bg-[var(--color-accent-hover)]"
                >
                  <GitPullRequest className="h-4 w-4" />
                  Open Pull Requests
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView("review-studio")}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
                >
                  Open Review Studio
                </button>
                <button
                  type="button"
                  onClick={() => void providerQuery.refetch()}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh Capability
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm text-[var(--color-text-secondary)]">
              <p className="font-semibold text-[var(--color-text-primary)]">
                Provider collaboration is not active for this repository.
              </p>
              <p className="leading-6">
                {overview?.providerAvailable === false
                  ? "The GitHub provider is not available in the current backend session."
                  : overview?.isGithubRepository === false
                    ? "No GitHub remote was detected for the active repository."
                    : "Open this panel again after adding a supported provider remote or account."}
              </p>
              <button
                type="button"
                onClick={() => void providerQuery.refetch()}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-bg-tertiary)] px-3 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              >
                <RefreshCw className="h-4 w-4" />
                Check Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
