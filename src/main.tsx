import { render } from "preact";
import App from "./App";
import { startAutoSaveLoop } from "./lib/autosave";
import { installShortcuts } from "./lib/shortcuts";

import "./styles/tokens.css";
import "./styles/global.css";

installShortcuts();
startAutoSaveLoop();

render(<App />, document.getElementById("root")!);
