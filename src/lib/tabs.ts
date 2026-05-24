/**
 * Editor-tab operations — closing and cycling open tabs. Shared so the tab
 * strip's close button and the Ctrl+W / Ctrl+Tab keybindings stay in lockstep.
 *
 * Tabs are scoped to the active editor group. Closing the last tab in a
 * non-leftmost group also collapses that group back into a single-pane
 * layout — the user expects closing all files in a split to undo the split.
 */
import {
  editorGroups,
  activeGroupIndex,
  openTabs,
  activeTabIndex,
} from "../state/appState";
import { closeGroup, updateActiveGroup } from "./editor-groups";

/**
 * Close the tab at index `i` in the ACTIVE group, keeping `activeTabIndex`
 * pointing at a sensible neighbour: stay on the same visual slot when a tab
 * to the left or the active tab itself closes, and never run off the end of
 * the list. If the close empties a non-first group, the group is collapsed
 * away so the user is dropped back into a single-pane layout.
 */
export function closeTab(i: number): void {
  const tabs = openTabs.value;
  if (i < 0 || i >= tabs.length) return;
  const active = activeTabIndex.value;
  const newTabs = tabs.filter((_, idx) => idx !== i);
  let nextActive = active;
  if (active >= newTabs.length) {
    nextActive = Math.max(0, newTabs.length - 1);
  } else if (i <= active && active > 0) {
    nextActive = active - 1;
  }
  // If this drains a non-first group, drop the group entirely. (The first
  // group is preserved even when empty so the WelcomeScreen has a place
  // to land — `closeGroup` handles that special case.)
  if (newTabs.length === 0) {
    const groups = editorGroups.value;
    const idx = activeGroupIndex.value;
    const current = groups[idx];
    if (current && groups.length > 1) {
      closeGroup(current.id);
      return;
    }
  }
  updateActiveGroup({ tabs: newTabs, activeTabIndex: nextActive });
}

/** Close the currently active tab (the Ctrl+W path). No-op when none are open. */
export function closeActiveTab(): void {
  closeTab(activeTabIndex.value);
}

/** Activate the next tab in the active group, wrapping past the last (the
 *  Ctrl+Tab path). */
export function nextTab(): void {
  const n = openTabs.value.length;
  if (n === 0) return;
  activeTabIndex.value = (activeTabIndex.value + 1) % n;
}
