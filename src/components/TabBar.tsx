import "./TabBar.css";
import { X } from "lucide-preact";
import { openTabs, activeTabIndex } from "../state/appState";

export function TabBar() {
  const tabs = openTabs.value;
  const active = activeTabIndex.value;

  function setActive(i: number) {
    activeTabIndex.value = i;
  }

  function closeTab(i: number, e: MouseEvent) {
    e.stopPropagation();
    const newTabs = tabs.filter((_, idx) => idx !== i);
    openTabs.value = newTabs;
    if (active >= newTabs.length) activeTabIndex.value = newTabs.length - 1;
    else if (i <= active && active > 0) activeTabIndex.value = active - 1;
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
          <span class="tab-x" onClick={(e) => closeTab(i, e as any)}>
            <X size={14} strokeWidth={1.5} />
          </span>
        </button>
      ))}
    </div>
  );
}
