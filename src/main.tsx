import { render } from "preact";
import App from "./App";
import { startAutoSaveLoop } from "./lib/autosave";
import { installShortcuts } from "./lib/shortcuts";
import { bootstrapProject } from "./lib/bootstrap";
import { startBoardWatch } from "./lib/connection";

import "./styles/tokens.css";
import "./styles/global.css";

installShortcuts();
bootstrapProject().catch(console.error);
startAutoSaveLoop();
startBoardWatch();

render(<App />, document.getElementById("root")!);
