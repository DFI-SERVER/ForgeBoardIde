import "./Breadcrumb.css";
import { openTabs, activeTabIndex, currentSketch } from "../state/appState";

export function Breadcrumb() {
  const tab = openTabs.value[activeTabIndex.value];
  if (!tab) return null;
  const projectName = currentSketch.value?.name ?? "sketch";
  return (
    <div class="breadcrumb">
      <span>sketches</span>
      <span class="sep">/</span>
      <span>{projectName}</span>
      <span class="sep">/</span>
      <span class="current">{tab.name}</span>
    </div>
  );
}
