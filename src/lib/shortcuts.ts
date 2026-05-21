import { openTabs, activeTabIndex } from "../state/appState";
import { flushSave } from "./autosave";
import {
  newSketch,
  openSketch,
  compileSketch,
  uploadSketch,
} from "./actions";

export function installShortcuts() {
  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();

    // Ctrl+N — new sketch
    if (key === "n") {
      e.preventDefault();
      newSketch();
      return;
    }

    // Ctrl+O — open sketch
    if (key === "o") {
      e.preventDefault();
      openSketch();
      return;
    }

    // Ctrl+S — save immediately
    if (key === "s") {
      e.preventDefault();
      flushSave();
      return;
    }

    // Ctrl+R — verify / compile
    if (key === "r") {
      e.preventDefault();
      compileSketch();
      return;
    }

    // Ctrl+U — upload
    if (key === "u") {
      e.preventDefault();
      uploadSketch();
      return;
    }

    // Ctrl+W — close active tab
    if (key === "w") {
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
    if (e.key === "Tab") {
      e.preventDefault();
      const n = openTabs.value.length;
      if (n === 0) return;
      activeTabIndex.value = (activeTabIndex.value + 1) % n;
      return;
    }
  });
}
