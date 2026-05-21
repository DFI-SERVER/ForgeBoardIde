import "./TitleBar.css";
import { MenuBar } from "./MenuBar";
import { WindowControls } from "./WindowControls";

export function TitleBar() {
  return (
    <div class="titlebar" data-tauri-drag-region>
      <div class="titlebar-brand" data-tauri-drag-region>
        <img src="/forgeboard-logo.png" class="titlebar-logo" alt="" />
        <span class="brand-name">ForgeBoard</span>
        <span class="brand-sub">IDE</span>
      </div>
      <MenuBar />
      {/* Flexible drag strip — fills the gap so the window stays draggable. */}
      <div class="titlebar-drag" data-tauri-drag-region />
      <WindowControls />
    </div>
  );
}
