import "./TitleBar.css";
import { activeTabIndex, openTabs } from "../state/appState";

export function TitleBar() {
  const activeFile = openTabs.value[activeTabIndex.value]?.path ?? "—";

  return (
    <div class="titlebar" data-tauri-drag-region>
      <div class="titlebar-left">
        <span class="titlebar-brand">◆ ForgeBoard IDE</span>
        <span class="titlebar-sep">—</span>
        <span class="titlebar-file">{activeFile}</span>
      </div>
      <div class="titlebar-right">
        <span>— □ ×</span>
      </div>
    </div>
  );
}
