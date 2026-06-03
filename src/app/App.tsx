import { useEffect } from "react";
import { useAppStore } from "../stores/app-store";
import { RepositoryWelcome } from "../components/repository/RepositoryWelcome";
import { RepositoryWorkspace } from "../components/repository/RepositoryWorkspace";
import { Providers } from "./providers";

export default function App() {
  return (
    <Providers>
      <AppContent />
    </Providers>
  );
}

function AppContent() {
  const route = useAppStore((s) => s.route);
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  if (route.area === "global") {
    return <RepositoryWelcome />;
  }

  return <RepositoryWorkspace />;
}
