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
  currentSketch,
  fileContents,
} from "../state/appState";
import {
  closeGroup,
  updateActiveGroup,
  addTabToActiveGroup,
  focusOpenFile,
} from "./editor-groups";
import { flushSaveAsync } from "./autosave";
import { projectApi } from "../ipc/project";

/**
 * Stack of recently-closed tab paths, newest at the end. Ctrl+Shift+T pops
 * the most recent and reopens it. Capped at 20 entries so a long IDE
 * session full of opens/closes can't grow the array unbounded; older
 * entries fall off the bottom as new ones are pushed on top.
 */
const closedTabStack: string[] = [];
const CLOSED_TAB_STACK_MAX = 20;

/** Push `path` onto the closed-tab stack, dedupping by path and capping
 *  growth. Exported for tests; not part of the public API. */
export function pushClosedTab(path: string): void {
  if (!path) return;
  // De-dup: a path closed twice in a row should not occupy two slots —
  // remove the older entry so the newest position wins.
  const dup = closedTabStack.indexOf(path);
  if (dup >= 0) closedTabStack.splice(dup, 1);
  closedTabStack.push(path);
  if (closedTabStack.length > CLOSED_TAB_STACK_MAX) {
    closedTabStack.splice(0, closedTabStack.length - CLOSED_TAB_STACK_MAX);
  }
}

/** Test helper — empties the closed-tab stack. */
export function _resetClosedTabsForTests(): void {
  closedTabStack.length = 0;
}

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

  // Record the closed tab so Ctrl+Shift+T can reopen it. Pushed BEFORE the
  // group bookkeeping below so even an early-out from the group-collapse
  // branch still leaves the path on the stack.
  pushClosedTab(tab.path);

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

/**
 * Reopen the most-recently-closed tab in the active group. Pops the closed
 * stack repeatedly so a path the user has since reopened (and re-closed) is
 * not surfaced twice, and so stale entries that no longer belong to the open
 * sketch are skipped silently. No-op when the stack is empty.
 *
 * The file is sourced from `currentSketch` — the closed-tab stack only ever
 * records tabs the IDE itself opened, so the file's contents are already in
 * `fileContents`; if the path is missing (sketch swap, file deleted on
 * disk) the entry is dropped and the next candidate is tried.
 */
export async function reopenClosedTab(): Promise<void> {
  while (closedTabStack.length > 0) {
    const path = closedTabStack.pop()!;
    // Already open in some pane (the user closed it, then opened it again
    // via the sidebar) — just focus it and we're done.
    if (focusOpenFile(path)) return;
    // The closed tab must still be part of the open sketch — otherwise we'd
    // be opening a stale file from a previously-loaded sketch.
    const sketch = currentSketch.value;
    const file = sketch?.files.find((f) => f.path === path);
    if (!file) continue;
    // Read the file's contents into `fileContents` if it isn't already
    // there (loadSketch normally preloads every sketch file, but a future
    // change might not). A read failure simply drops this entry and tries
    // the next one rather than spamming the user.
    if (!fileContents.value.has(path)) {
      try {
        const content = await projectApi.readFile(path);
        const next = new Map(fileContents.value);
        next.set(path, content);
        fileContents.value = next;
      } catch {
        continue;
      }
    }
    addTabToActiveGroup({ path: file.path, name: file.name, modified: false });
    return;
  }
}
