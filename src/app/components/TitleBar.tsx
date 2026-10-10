import "./TitleBar.css";
import { MenuBar } from "./MenuBar";
import { WindowControls } from "./WindowControls";
import { isMac } from "@/app/platform";

/** On macOS the window keeps its native traffic lights (overlay title bar,
 *  see tauri.macos.conf.json), so the bar leaves room for them on the left
 *  and skips the Windows-style controls on the right. */
export function TitleBar() {
  return (
    <div class={`titlebar${isMac ? " titlebar-mac" : ""}`} data-tauri-drag-region>
      <div class="titlebar-brand" data-tauri-drag-region>
        <img src="/forgeboard-logo.png" class="titlebar-logo" alt="" />
        <span class="brand-name">ForgeBoard</span>
        <span class="brand-sub">IDE</span>
      </div>
      <MenuBar />
      {/* Flexible drag strip — fills the gap so the window stays draggable. */}
      <div class="titlebar-drag" data-tauri-drag-region />
      {!isMac && <WindowControls />}
    </div>
  );
}
