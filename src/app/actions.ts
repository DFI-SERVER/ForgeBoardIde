/**
 * App-shell navigation: bottom panel tabs, rail views, fullscreen.
 */
import { activeRail, bottomPanelOpen, bottomPanelTab } from "./state";

/** Show or hide the bottom panel. */
export function toggleBottomPanel() {
  bottomPanelOpen.value = !bottomPanelOpen.value;
}

/** Open the bottom panel and switch it to the Problems tab. */
export function showProblems() {
  bottomPanelOpen.value = true;
  bottomPanelTab.value = "problems";
}

/** Open the bottom panel on the Serial Monitor tab. */
export function openSerialMonitor() {
  bottomPanelOpen.value = true;
  bottomPanelTab.value = "serial";
}

/** Open the bottom panel on the Serial Plotter tab. */
export function openSerialPlotter() {
  bottomPanelOpen.value = true;
  bottomPanelTab.value = "plotter";
}

/** Switch the activity rail to the Libraries view. */
export function openLibraries() {
  activeRail.value = "libraries";
}

/** Switch the activity rail to the Boards view. */
export function openBoardsManager() {
  activeRail.value = "boards";
}

/**
 * Toggle the OS-level fullscreen state on the IDE's main window. The Tauri
 * window API is dynamically imported so this module can still be unit-tested
 * in the jsdom env where `@tauri-apps/api/window` isn't usable. Failures
 * (no IPC available, window already detached) are swallowed — fullscreen is
 * a convenience, not a hard requirement.
 */
export async function toggleFullscreen(): Promise<void> {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    const isFs = await w.isFullscreen();
    await w.setFullscreen(!isFs);
  } catch (e) {
    console.error("toggle fullscreen failed:", e);
  }
}
