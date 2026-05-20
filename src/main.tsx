import { render } from "preact";
import App from "./App";
import { startAutoSaveLoop } from "./lib/autosave";

import "./styles/tokens.css";
import "./styles/global.css";

startAutoSaveLoop();

render(<App />, document.getElementById("root")!);
