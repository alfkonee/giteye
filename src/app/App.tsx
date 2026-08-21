import { useEffect } from "react";
import { useAppStore } from "../stores/app-store";
import { RepositoryWelcome } from "../components/repository/RepositoryWelcome";
import { RepositoryWorkspace } from "../components/repository/RepositoryWorkspace";
import { Providers } from "./providers";
import { ToolchainGate } from "../components/toolchain/ToolchainSetup";
import { resolveTheme, useSystemPrefersDark } from "../lib/theme";

export default function App() {
  return (
    <Providers>
      <ToolchainGate><AppContent /></ToolchainGate>
    </Providers>
  );
}

function AppContent() {
  const route = useAppStore((s) => s.route);
  const theme = useAppStore((s) => s.theme);
  const systemPrefersDark = useSystemPrefersDark();
  const resolvedTheme = resolveTheme(theme, systemPrefersDark);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  if (route.area === "global") {
    return <RepositoryWelcome />;
  }

  return <RepositoryWorkspace />;
}
