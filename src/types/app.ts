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

export interface ActiveRepoState {
  repository: RepositoryInfo | null;
  isLoading: boolean;
  error: string | null;
}
