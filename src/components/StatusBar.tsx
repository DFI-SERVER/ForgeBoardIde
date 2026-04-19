import "./StatusBar.css";
import { connectedBoard, connectedPort, saveState } from "../state/appState";

export function StatusBar() {
  return (
    <footer class="statusbar">
      <span class="sb-item">
        <span class="sb-dot connected" />
        {connectedPort.value ?? "—"} · 115200
      </span>
      <span class="sb-item muted">{connectedBoard.value ?? "No board"}</span>
      <span class="sb-item">Ln 14 · Col 22</span>
      <span class="sb-item">Spaces: 2</span>
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
