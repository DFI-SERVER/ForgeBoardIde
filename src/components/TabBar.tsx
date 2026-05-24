import "./TabBar.css";
import { X } from "lucide-preact";
import { openTabs, activeTabIndex } from "../state/appState";
import { closeTab } from "../lib/tabs";
import { iconForName } from "../lib/file-icons";

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
      {tabs.map((tab, i) => {
        const Icon = iconForName(tab.name);
        return (
          <button
            key={tab.path}
            class={`tab ${i === active ? "active" : ""} ${tab.modified ? "modified" : ""}`}
            onClick={() => setActive(i)}
          >
            <span class="tab-icon">
              <Icon size={13} strokeWidth={1.6} />
            </span>
            <span class="tab-name">{tab.name}</span>
            {/* The close affordance and the modified-indicator share the
                same slot. CSS shows the dot when modified + unhovered, and
                the X otherwise (or on hover, even when modified). */}
            <span class="tab-trailing">
              <span class="tab-dot" aria-hidden="true" />
              <span
                class="tab-x"
                aria-label={`Close ${tab.name}`}
                onClick={(e) => onCloseClick(i, e as any)}
              >
                <X size={13} strokeWidth={1.6} />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
