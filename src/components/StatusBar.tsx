import "./StatusBar.css";
import {
  connectedBoard,
  connectedPort,
  saveState,
  serialConnected,
  serialBaud,
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

export function StatusBar() {
  return (
    <footer class="statusbar">
      <span class="sb-item">
        <span class={`sb-dot ${serialConnected.value ? "connected" : "idle"}`} />
        {connectedPort.value ?? "—"} · {serialBaud.value}
      </span>
      <span class="sb-item muted">{connectedBoard.value ?? "No board"}</span>
      <span class="sb-item">Ln 14 · Col 22</span>
      <span class="sb-item">Spaces: 2</span>
      <button class="sb-item sb-ping" onClick={handlePing}>ping</button>
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
