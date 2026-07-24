import type { RepositoryInfo } from "./git";

export interface AppSettings {
  theme: "dark" | "light";
  gitExecutablePath: string | null;
  userName: string | null;
  userEmail: string | null;
  diffMode: "unified" | "split";
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  gitExecutablePath: null,
  userName: null,
  userEmail: null,
  diffMode: "unified",
};

export interface ToolComponentStatus {
  installed: boolean;
  version: string | null;
  executablePath: string | null;
}

export interface ToolchainStatus {
  platform: string;
  git: ToolComponentStatus;
  lfs: ToolComponentStatus;
  lfsEnabled: boolean;
  installProvider: string | null;
  canInstallGit: boolean;
  canInstallLfs: boolean;
  supportsCustomGitVersion: boolean;
  userToolsDirectory: string;
}

export interface ToolInstallResult {
  message: string;
  status: ToolchainStatus;
}

export interface ActiveRepoState {
  repository: RepositoryInfo | null;
  isLoading: boolean;
  error: string | null;
}
