import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { NoticeCenter } from "../components/common/NoticeCenter";
import { CommandLogDrawer } from "../components/common/CommandLogDrawer";
import { RustCallTracePanel } from "../components/common/RustCallTracePanel";
import { FrontendTraceCollector } from "../components/common/FrontendTraceCollector";
import { AppSettingsSync } from "../lib/app-settings-sync";
import { GitJobEventListener, GitStateWatcher } from "../lib/git-watch";

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
      <AppSettingsSync />
      <GitStateWatcher />
      <GitJobEventListener />
      <CommandLogDrawer />
      <FrontendTraceCollector />
      <RustCallTracePanel />
      <NoticeCenter />
      {children}
    </QueryClientProvider>
  );
}
