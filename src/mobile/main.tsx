// main.tsx — entry for the ForgeBoard mobile IDE preview (mobile.html).
// Standalone from the desktop app: no Tauri startup, pure UI so it runs in a
// plain browser via `pnpm dev` → /mobile.html.

import { render } from "preact";
import { MobileApp } from "./App";

import "./tokens.css";
import "./ide.css";

render(<MobileApp />, document.getElementById("root")!);
