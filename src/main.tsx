import { render } from "preact";
import App from "./App";
import { startAutoSaveLoop } from "./lib/autosave";
import { installShortcuts } from "./lib/shortcuts";
import { bootstrapProject } from "./lib/bootstrap";
import { startBoardWatch } from "./lib/connection";
import { startRecentFilesTracking } from "./lib/recent-files";
import { startCompileHistoryTracking } from "./lib/compile-history";
import { initLayout } from "./lib/layout";
import { settings } from "./lib/settings";
import { applyAppTheme } from "./lib/monaco-setup";
import { startEditorGroupsSync } from "./lib/editor-groups";

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
bootstrapProject().catch(console.error);
startAutoSaveLoop();
startBoardWatch();
startRecentFilesTracking();
startCompileHistoryTracking();

render(<App />, document.getElementById("root")!);
