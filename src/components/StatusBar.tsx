import "./StatusBar.css";
import {
  connectionState,
  connectedBoard,
  connectedPort,
  saveState,
} from "../state/appState";
import { ping } from "../ipc/ping";

async function handlePing() {
  try {
    const r = await ping();
    alert(`${r.pong} (v${r.version})`);
  } catch (e) {
    alert(`Ping failed: ${e}`);
  }
}

/** The board-connection summary — mirrors the toolbar ConnectionPill. */
function connectionLabel(): string {
  switch (connectionState.value) {
    case "connected":
      return `${connectedBoard.value} · ${connectedPort.value}`;
    case "detecting":
      return `Detecting on ${connectedPort.value}…`;
    case "unidentified":
      return `Unknown board · ${connectedPort.value}`;
    default:
      return "No board";
  }
}

export function StatusBar() {
  const state = connectionState.value;
  return (
    <footer class="statusbar">
      <span class="sb-item" title="Board connection">
        <span class={`sb-dot sb-dot-${state}`} />
        {connectionLabel()}
      </span>
      <span class="sb-item">Ln 14 · Col 22</span>
      <span class="sb-item">Spaces: 2</span>
      <button class="sb-item sb-ping" onClick={handlePing}>
        ping
      </button>
      <span class="sb-spacer" />
      <span class="sb-item">UTF-8</span>
      <span class="sb-item">LF</span>
      <span class="sb-item">C++</span>
      <span class={`sb-item save-state ${saveState.value}`}>
        {saveState.value === "saved" && "✓ Saved"}
        {saveState.value === "saving" && "… Saving"}
        {saveState.value === "unsaved" && "● Unsaved"}
      </span>
    </footer>
  );
}
