import "./TabBar.css";
import { X } from "lucide-preact";
import { openTabs, activeTabIndex } from "../state/appState";
import { closeTab } from "../lib/tabs";

export function TabBar() {
  const tabs = openTabs.value;
  const active = activeTabIndex.value;

  function setActive(i: number) {
    activeTabIndex.value = i;
  }

  function onCloseClick(i: number, e: MouseEvent) {
    e.stopPropagation();
    closeTab(i);
  }

  return (
    <div class="tabbar">
      {tabs.map((tab, i) => (
        <button
          class={`tab ${i === active ? "active" : ""}`}
          onClick={() => setActive(i)}
        >
          <span class={`tab-dot ${tab.modified ? "modified" : "saved"}`} />
          <span class="tab-name">{tab.name}</span>
          <span class="tab-x" onClick={(e) => onCloseClick(i, e as any)}>
            <X size={14} strokeWidth={1.5} />
          </span>
        </button>
      ))}
    </div>
  );
}
