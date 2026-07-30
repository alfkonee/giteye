import { getCurrentWindow } from "@tauri-apps/api/window";

export type WindowChromeAction = "close" | "minimize" | "toggleMaximize";
export type WindowControlPlacement = "left" | "right";
export type WindowResizeDirection = "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West";

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
    case "minimize":
      await appWindow.minimize();
      break;
    case "toggleMaximize":
      await appWindow.toggleMaximize();
      break;
  }
}

export async function startWindowResize(direction: WindowResizeDirection) {
  await getCurrentWindow().startResizeDragging(direction);
}
