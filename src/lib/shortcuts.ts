import { openTabs, activeTabIndex } from "../state/appState";
import { flushSave } from "./autosave";

export function installShortcuts() {
  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;

    // Ctrl+S — save immediately
    if (mod && e.key === "s") {
      e.preventDefault();
      flushSave();
      return;
    }

    // Ctrl+W — close active tab
    if (mod && e.key === "w") {
      e.preventDefault();
      const i = activeTabIndex.value;
      const newTabs = openTabs.value.filter((_, idx) => idx !== i);
      openTabs.value = newTabs;
      if (activeTabIndex.value >= newTabs.length) {
        activeTabIndex.value = Math.max(0, newTabs.length - 1);
      }
      return;
    }

    // Ctrl+Tab — next tab
    if (mod && e.key === "Tab") {
      e.preventDefault();
      const n = openTabs.value.length;
      if (n === 0) return;
      activeTabIndex.value = (activeTabIndex.value + 1) % n;
      return;
    }
  });
}
