import { getCurrentWindow } from "@tauri-apps/api/window";

export type WindowChromeAction = "close" | "drag" | "minimize" | "toggleMaximize";
export type WindowControlPlacement = "left" | "right";

export function getWindowControlPlacement(): WindowControlPlacement {
  if (typeof navigator === "undefined") {
    return "right";
  }

  return navigator.userAgent.toLowerCase().includes("mac") ? "left" : "right";
}

export async function runWindowChromeAction(action: WindowChromeAction) {
  const appWindow = getCurrentWindow();

  switch (action) {
    case "close":
      await appWindow.close();
      break;
    case "drag":
      await appWindow.startDragging();
      break;
    case "minimize":
      await appWindow.minimize();
      break;
    case "toggleMaximize":
      await appWindow.toggleMaximize();
      break;
  }
}
