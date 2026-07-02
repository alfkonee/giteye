import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { gitApi } from "./tauri-api";
import { useAppStore } from "../stores/app-store";
import { DEFAULT_SETTINGS } from "../types/app";

const APP_SETTINGS_QUERY_KEY = ["app-settings"] as const;

export function AppSettingsSync() {
  const theme = useAppStore((state) => state.theme);
  const diffMode = useAppStore((state) => state.diffMode);
  const [hydrated, setHydrated] = useState(false);
  const skipNextSave = useRef(false);
  const settingsQuery = useQuery({
    queryKey: APP_SETTINGS_QUERY_KEY,
    queryFn: gitApi.getAppSettings,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const { mutate: saveAppSettings } = useMutation({
    mutationFn: gitApi.saveAppSettings,
  });

  useEffect(() => {
    if (!settingsQuery.data || hydrated) return;
    useAppStore.setState({
      theme: settingsQuery.data.theme,
      diffMode: settingsQuery.data.diffMode,
    });
    skipNextSave.current = true;
    setHydrated(true);
  }, [hydrated, settingsQuery.data]);

  useEffect(() => {
    if (hydrated || !settingsQuery.isError) return;
    setHydrated(true);
  }, [hydrated, settingsQuery.isError]);

  useEffect(() => {
    if (!hydrated) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const timeout = window.setTimeout(() => {
      saveAppSettings({
        ...DEFAULT_SETTINGS,
        theme,
        diffMode,
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [diffMode, hydrated, saveAppSettings, theme]);

  return null;
}
