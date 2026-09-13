import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { NoticeCenter } from "../components/common/NoticeCenter";
import { AppDialogProvider } from "../components/common/AppDialogProvider";
import { CommandLogConsole } from "../components/common/CommandLogConsole";
import { CommandPalette } from "../components/common/CommandPalette";
import { RustCallTracePanel } from "../components/common/RustCallTracePanel";
import { FrontendTraceCollector } from "../components/common/FrontendTraceCollector";
import { InterruptedJobRecovery } from "../components/common/InterruptedJobRecovery";
import { AppSettingsSync } from "../lib/app-settings-sync";
import { GitJobEventListener, GitStateWatcher } from "../lib/git-watch";
import { gitQueries } from "../lib/git-data";
import { useAppStore } from "../stores/app-store";


function BackgroundPullRequestLoader() {
  const activeRepoPath = useAppStore((state) => state.activeRepoPath);
  const enabled = useAppStore(
    (state) => state.backgroundPullRequestLoading,
  );
  useQuery(gitQueries.githubOverview(activeRepoPath, enabled));
  return null;
}
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppDialogProvider>
        <AppSettingsSync />
        <BackgroundPullRequestLoader />
        <GitStateWatcher />
        <GitJobEventListener />
        <InterruptedJobRecovery />
        <CommandPalette />
        <CommandLogConsole />
        <FrontendTraceCollector />
        <RustCallTracePanel />
        <NoticeCenter />
        {children}
      </AppDialogProvider>
    </QueryClientProvider>
  );
}
