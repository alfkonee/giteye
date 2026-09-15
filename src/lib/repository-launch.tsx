import { useEffect, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "../stores/app-store";
import { useNoticeStore } from "../stores/notice-store";
import { gitActionErrorMessage, gitMutations } from "./git-data";
import { tracedInvoke } from "./invoke-trace";

type LaunchIntent =
  | { kind: "openRepository"; path: string }
  | { kind: "error"; message: string };

type OpenRepository = (path: string) => Promise<unknown>;

// One consumer per webview, including StrictMode's mount/cleanup/remount cycle.
// A batch already taken from Rust is always completed, even if a component unmounts.
let drainInFlight: Promise<void> | null = null;
let drainRequested = false;

function reportLaunchError(error: unknown) {
  useNoticeStore.getState().startNotice({
    title: "Could not open repository from the command line",
    detail: gitActionErrorMessage(error),
    recoveryHint: "Run giteye with an existing Git repository directory, or use Open in the Repo Hub.",
    category: "system",
    status: "error",
  });
}

function requestDrain(openRepository: OpenRepository) {
  drainRequested = true;
  if (drainInFlight) return;
  drainInFlight = (async () => {
    while (drainRequested) {
      drainRequested = false;
      const intents = await tracedInvoke<LaunchIntent[]>("take_repository_launches");
      for (const intent of intents) {
        if (intent.kind === "error") {
          reportLaunchError(intent.message);
        } else {
          // The shared mutation owns cache priming, workspace navigation, and
          // actionable Git error notices. An invalid repo leaves the current one open.
          await openRepository(intent.path).catch(() => undefined);
        }
      }
    }
  })().catch(reportLaunchError).finally(() => {
    drainInFlight = null;
    if (drainRequested) requestDrain(openRepository);
  });
}

export function RepositoryLaunchListener() {
  const queryClient = useQueryClient();
  const setActiveRepoPath = useAppStore((state) => state.setActiveRepoPath);
  const { mutateAsync } = useMutation(gitMutations.openRepository(queryClient, setActiveRepoPath));
  const openRepository = useRef(mutateAsync);
  openRepository.current = mutateAsync;

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const drain = () => {
      if (!disposed) requestDrain((path) => openRepository.current(path));
    };
    // Subscribe before the readiness drain: launches on either side of this
    // handshake are queued in Rust, and redundant wake-ups never repeat a batch.
    void listen("repository-launch-pending", drain).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }
      unlisten = cleanup;
      drain();
    }).catch((error) => {
      if (!disposed) reportLaunchError(error);
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return null;
}
