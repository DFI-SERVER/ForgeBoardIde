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
import { flushSaveAsync } from "./autosave";

/**
 * Close the tab at index `i` in the ACTIVE group, keeping `activeTabIndex`
 * pointing at a sensible neighbour: stay on the same visual slot when a tab
 * to the left or the active tab itself closes, and never run off the end of
 * the list. If the close empties a non-first group, the group is collapsed
 * away so the user is dropped back into a single-pane layout.
 *
 * Async because we flush any pending autosave BEFORE removing a modified tab
 * — discarding a modified tab without saving would strand the unsaved edits
 * in fileContents only, losing the last debounce window's worth of typing.
 */
export async function closeTab(i: number): Promise<void> {
  const tabs = openTabs.value;
  if (i < 0 || i >= tabs.length) return;
  const tab = tabs[i];

  // Flush BEFORE removing — discarding a modified tab without saving would
  // strand the unsaved edits in fileContents only.
  if (tab.modified) {
    await flushSaveAsync();
  }

  // Re-read the active tab list — flushSaveAsync may have re-rendered or
  // changed `modified` flags. Bail if the index is no longer valid.
  const freshTabs = openTabs.value;
  if (i >= freshTabs.length) return;

  const active = activeTabIndex.value;
  const newTabs = freshTabs.filter((_, idx) => idx !== i);
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
export async function closeActiveTab(): Promise<void> {
  await closeTab(activeTabIndex.value);
}

/** Activate the next tab in the active group, wrapping past the last (the
 *  Ctrl+Tab path). */
export function nextTab(): void {
  const n = openTabs.value.length;
  if (n === 0) return;
  activeTabIndex.value = (activeTabIndex.value + 1) % n;
}
