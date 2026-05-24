import { render } from "preact";
import App from "./App";
import { startAutoSaveLoop } from "./lib/autosave";
import { installShortcuts } from "./lib/shortcuts";
import { bootstrapProject } from "./lib/bootstrap";
import { startBoardWatch } from "./lib/connection";
import { startRecentFilesTracking } from "./lib/recent-files";
import { initLayout } from "./lib/layout";
import { settings } from "./lib/settings";
import { applyAppTheme } from "./lib/monaco-setup";

import "./styles/tokens.css";
import "./styles/global.css";

// Stamp data-theme on <html> BEFORE the first paint so the app never flashes
// the default Dark palette and then re-tints. Settings have already hydrated
// from localStorage by this point (module top-level work).
applyAppTheme(settings.value.theme);

// Restore the saved sidebar width / bottom-panel height before the first
// render, so the layout never flashes a default size and then jumps.
initLayout();
installShortcuts();
bootstrapProject().catch(console.error);
startAutoSaveLoop();
startBoardWatch();
startRecentFilesTracking();

render(<App />, document.getElementById("root")!);
