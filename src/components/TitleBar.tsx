import "./TitleBar.css";
import { activeTabIndex, openTabs } from "../state/appState";

export function TitleBar() {
  const activeFile = openTabs.value[activeTabIndex.value]?.name ?? null;

  return (
    <div class="titlebar" data-tauri-drag-region>
      <div class="titlebar-brand">
        <img src="/forgeboard-logo.png" class="titlebar-logo" alt="" />
        <span class="brand-name">ForgeBoard</span>
        <span class="brand-sub">IDE</span>
      </div>
      {activeFile && (
        <span class="titlebar-file">
          <span class="titlebar-file-sep">/</span>
          <span class="titlebar-file-name">{activeFile}</span>
        </span>
      )}
    </div>
  );
}
