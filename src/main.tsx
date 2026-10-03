import { render } from "preact";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { startAutoSaveLoop, flushSaveAsync } from "./lib/autosave";
import { installShortcuts } from "./lib/shortcuts";
import { bootstrapProject } from "./lib/bootstrap";
import { startBoardWatch } from "./lib/connection";
import { startRecentFilesTracking } from "./lib/recent-files";
import { startCompileHistoryTracking } from "./lib/compile-history";
import { startPersistedBoardTracking } from "./lib/persisted-board";
import { initLayout } from "./lib/layout";
import { settings } from "./lib/settings";
import { applyAppTheme } from "./lib/monaco-setup";
import { startEditorGroupsSync } from "./lib/editor-groups";
import { correctionsApi } from "./ipc/corrections";

import "./styles/tokens.css";
import "./styles/global.css";

// Stamp data-theme on <html> BEFORE the first paint so the app never flashes
// the default Dark palette and then re-tints. Settings have already hydrated
// from localStorage by this point (module top-level work).
applyAppTheme(settings.value.theme);

// Restore the saved sidebar width / bottom-panel height before the first
// render, so the layout never flashes a default size and then jumps.
initLayout();
// Bridge the editorGroups source-of-truth and the openTabs / activeTabIndex
// writable mirrors before anything else mutates them — bootstrapProject will
// open a sketch and populate the first group, and the autosave loop subscribes
// to openTabs. Both rely on the sync being live.
startEditorGroupsSync();
installShortcuts();
// Sync platform corrections (overlay files into installed arduino-cli
// platform dirs) BEFORE bootstrapProject so the first compile/upload sees
// the patched recipe. Fire-and-forget on the apply side — failures are
// non-fatal and will surface in Settings → Platform corrections.
if (settings.value.applyPlatformCorrections) {
  correctionsApi.apply().catch((e) => {
    console.error("apply platform corrections failed:", e);
  });
} else {
  // User opted out — make sure no stale overlay files survive from a prior
  // session where the setting was on.
  correctionsApi.remove().catch((e) => {
    console.error("remove platform corrections failed:", e);
  });
}
bootstrapProject().catch(console.error);
startAutoSaveLoop();
startBoardWatch();
startRecentFilesTracking();
startCompileHistoryTracking();
startPersistedBoardTracking();

// Flush any pending autosave before the window closes. Without this, the
// 2-second autosave debounce can silently drop the user's last edits when
// they close the app mid-typing.
//
// Pattern: the FIRST close-request preventDefaults, runs the save flush, then
// calls close() again. The second pass sees the `flushed` flag and lets the
// close go through. This avoids needing the `allow-destroy` permission and
// dodges the silent-fail mode the prior `destroy()`-based path hit when the
// destroy-permission scope went stale across rebuilds.
const appWindow = getCurrentWindow();
let flushedForClose = false;
appWindow.onCloseRequested(async (event) => {
  if (flushedForClose) return;
  event.preventDefault();
  try {
    await flushSaveAsync();
  } catch (e) {
    console.error("autosave flush before close failed:", e);
  }
  flushedForClose = true;
  // Re-issue the close. The handler runs again, sees `flushedForClose`, and
  // lets the default close proceed without firing the flush a second time.
  await appWindow.close();
});

render(<App />, document.getElementById("root")!);
