/**
 * Editor-tab operations — closing and cycling open tabs. Shared so the tab
 * strip's close button and the Ctrl+W / Ctrl+Tab keybindings stay in lockstep.
 */
import { openTabs, activeTabIndex } from "../state/appState";

/**
 * Close the tab at index `i`, keeping `activeTabIndex` pointing at a sensible
 * neighbour: stay on the same visual slot when a tab to the left or the active
 * tab itself closes, and never run off the end of the list.
 */
export function closeTab(i: number): void {
  const tabs = openTabs.value;
  if (i < 0 || i >= tabs.length) return;
  const active = activeTabIndex.value;
  const newTabs = tabs.filter((_, idx) => idx !== i);
  openTabs.value = newTabs;
  if (active >= newTabs.length) {
    activeTabIndex.value = Math.max(0, newTabs.length - 1);
  } else if (i <= active && active > 0) {
    activeTabIndex.value = active - 1;
  }
}

/** Close the currently active tab (the Ctrl+W path). No-op when none are open. */
export function closeActiveTab(): void {
  closeTab(activeTabIndex.value);
}

/** Activate the next tab, wrapping past the last (the Ctrl+Tab path). */
export function nextTab(): void {
  const n = openTabs.value.length;
  if (n === 0) return;
  activeTabIndex.value = (activeTabIndex.value + 1) % n;
}
