import { render } from "preact";
import App from "./App";
import { startAutoSaveLoop } from "./lib/autosave";
import { installShortcuts } from "./lib/shortcuts";

import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono";
import "./styles/tokens.css";
import "./styles/global.css";

installShortcuts();
startAutoSaveLoop();

render(<App />, document.getElementById("root")!);
