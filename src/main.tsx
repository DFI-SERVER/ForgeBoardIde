import { render } from "preact";
import App from "./App";
import { startAutoSaveLoop } from "./lib/autosave";
import { installShortcuts } from "./lib/shortcuts";
import { bootstrapProject } from "./lib/bootstrap";

import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono";
import "./styles/tokens.css";
import "./styles/global.css";

installShortcuts();
bootstrapProject().catch(console.error);
startAutoSaveLoop();

render(<App />, document.getElementById("root")!);
