import "./Breadcrumb.css";
import { openTabs, activeTabIndex } from "../state/appState";

export function Breadcrumb() {
  const tab = openTabs.value[activeTabIndex.value];
  if (!tab) return null;
  // For Phase 2, use a fixed mock project path. Phase 3 replaces with real path.
  const projectName = "led-chase";
  return (
    <div class="breadcrumb">
      <span>sketches</span>
      <span class="sep">/</span>
      <span>{projectName}</span>
      <span class="sep">/</span>
      <span class="current">{tab.path}</span>
    </div>
  );
}
