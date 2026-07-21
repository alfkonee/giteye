import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gitApi } from "./tauri-api";
import { useAppStore } from "../stores/app-store";
import { useNoticeStore } from "../stores/notice-store";
import { DEFAULT_SETTINGS } from "../types/app";

const APP_SETTINGS_QUERY_KEY = ["app-settings"] as const;

function settingsErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

export function AppSettingsSync() {
  const queryClient = useQueryClient();
  const theme = useAppStore((state) => state.theme);
  const diffMode = useAppStore((state) => state.diffMode);
  const [hydrated, setHydrated] = useState(false);
  const skipNextSave = useRef(false);
  const latestSettings = useRef(DEFAULT_SETTINGS);
  const settingsQuery = useQuery({
    queryKey: APP_SETTINGS_QUERY_KEY,
    queryFn: gitApi.getAppSettings,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const { mutate: saveAppSettings } = useMutation({
    mutationFn: gitApi.saveAppSettings,
    onSuccess: (settings) => {
      latestSettings.current = settings;
      queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, settings);
    },
    onError: (error) => {
      useNoticeStore.getState().startNotice({
        title: "Settings were not saved",
        detail: settingsErrorMessage(error),
        status: "error",
        category: "system",
      });
    },
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    latestSettings.current = settingsQuery.data;
  }, [settingsQuery.data]);

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
        ...latestSettings.current,
        theme,
        diffMode,
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [diffMode, hydrated, saveAppSettings, theme]);

  return null;
}
