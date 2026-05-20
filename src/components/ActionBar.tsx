import "./ActionBar.css";
import { connectedBoard, connectedPort } from "../state/appState";
import { TabBar } from "./TabBar";

export function ActionBar() {
  return (
    <div class="actionbar">
      <TabBar />

      <div class="actionbar-spacer" />

      <button class="btn btn-ghost" title="Check code for errors">
        <span class="btn-icon check">✓</span>
        <span>Check code</span>
      </button>

      <button class="btn btn-primary" title="Compile and upload to board">
        <span>Upload</span>
        <span>→</span>
      </button>

      <div class="actionbar-divider" />

      <div class="pill">
        <span class="pill-dot sage">◆</span>
        <span>{connectedBoard.value ?? "No board"}</span>
        <span class="pill-caret">▾</span>
      </div>

      <div class="pill">
        <span class="pill-dot-connected" />
        <span>{connectedPort.value ?? "No port"}</span>
        <span class="pill-caret">▾</span>
      </div>
    </div>
  );
}
