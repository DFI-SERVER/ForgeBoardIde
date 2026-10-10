/**
 * Editor groups — vertical panes that each have their own tab strip + Monaco
 * editor. The MVP supports a single split (max two groups); `fileContents`
 * stays a global Map so the same file edited in one pane shows the live edits
 * in the other.
 *
 * `editorGroups` (in `features/editor/state`) is the source of truth. The aliases
 * `openTabs` and `activeTabIndex` are *writable mirrors* of the active group's
 * state so the dozens of existing consumers (TabBar, FileSidebar, the autosave
 * effect, the Find-in-Project openFileAtLine, …) continue to work without
 * being rewritten. The two effects below keep them in lockstep, with a
 * mirror-suppression guard to prevent infinite ping-pong.
 *
 * The mirror does NOT lose information from inactive groups: a write to
 * `openTabs.value` only updates the active group's `tabs`; group "g1"'s tabs
 * remain wherever the helpers put them.
 */
import { effect, batch } from "@preact/signals";
import {
  editorGroups,
  activeGroupIndex,
  openTabs,
  activeTabIndex,
  type EditorGroup,
  type Tab,
} from "./state";

/** Maximum number of groups the MVP allows (one split → two panes). */
export const MAX_GROUPS = 2;

/** Monotonic counter for new group ids. Lives in module scope so each
 *  `splitEditorRight()` produces a fresh, never-reused identifier even if
 *  the user splits, closes, and splits again. */
let groupIdCounter = 1;

/**
 * True while one of the bookkeeping effects below is propagating a change.
 * Without this, the active-group → mirrors effect would echo right back into
 * the mirrors → active-group effect and trigger a write cycle.
 */
let suppressMirror = 0;

/* ---------------------------------------------------------- core helpers --- */

/** Read the active group, never null — `editorGroups` always has g0. */
function activeGroup(): EditorGroup {
  return editorGroups.value[activeGroupIndex.value] ?? editorGroups.value[0];
}

/**
 * Replace the active group's tabs + activeTabIndex with `patch`. Updates
 * `editorGroups` immutably (via map), so a subscriber that compares array
 * identity still re-renders. Writes through the suppression flag so the
 * mirror effects don't bounce.
 */
export function updateActiveGroup(patch: {
  tabs?: Tab[];
  activeTabIndex?: number;
}): void {
  const groups = editorGroups.value;
  const idx = activeGroupIndex.value;
  if (idx < 0 || idx >= groups.length) return;
  const current = groups[idx];
  const nextTabs = patch.tabs ?? current.tabs;
  // Clamp the new index into the new tabs' range; this matters when patch
  // sets only one of the two and the other carries over from the old state.
  const requestedIdx =
    patch.activeTabIndex !== undefined ? patch.activeTabIndex : current.activeTabIndex;
  const clampedIdx =
    nextTabs.length === 0 ? 0 : Math.min(Math.max(requestedIdx, 0), nextTabs.length - 1);
  const nextGroup: EditorGroup = {
    ...current,
    tabs: nextTabs,
    activeTabIndex: clampedIdx,
  };
  suppressMirror++;
  try {
    batch(() => {
      editorGroups.value = groups.map((g, i) => (i === idx ? nextGroup : g));
      openTabs.value = nextTabs;
      activeTabIndex.value = clampedIdx;
    });
  } finally {
    suppressMirror--;
  }
}

/**
 * Mark every tab pointing at `path` in EVERY group as modified. Used by the
 * Monaco change listener so editing a file that happens to be open in both
 * panes flips the dirty dot in both tab strips. No-op when no tab matches.
 */
export function markPathModifiedEverywhere(path: string): void {
  const groups = editorGroups.value;
  let anyChange = false;
  const nextGroups = groups.map((g) => {
    let groupChanged = false;
    const newTabs = g.tabs.map((t) => {
      if (t.path !== path || t.modified) return t;
      groupChanged = true;
      return { ...t, modified: true };
    });
    if (!groupChanged) return g;
    anyChange = true;
    return { ...g, tabs: newTabs };
  });
  if (!anyChange) return;
  const activeIdx = activeGroupIndex.value;
  const activeAfter = nextGroups[activeIdx];
  suppressMirror++;
  try {
    batch(() => {
      editorGroups.value = nextGroups;
      if (activeAfter) openTabs.value = activeAfter.tabs;
    });
  } finally {
    suppressMirror--;
  }
}

/**
 * Append a tab to the active group, dedup by path. If the path is already
 * open in the active group, activate that tab; otherwise push and select.
 * The contents map (`fileContents`) is the caller's responsibility — this
 * helper only manages the tab list.
 */
export function addTabToActiveGroup(tab: Tab): void {
  const group = activeGroup();
  const existing = group.tabs.findIndex((t) => t.path === tab.path);
  if (existing >= 0) {
    updateActiveGroup({ activeTabIndex: existing });
    return;
  }
  updateActiveGroup({
    tabs: [...group.tabs, tab],
    activeTabIndex: group.tabs.length,
  });
}

/**
 * Locate a file already open in any group. Returns the matched group's id and
 * the tab's index within that group, or null when no group has it open. The
 * walk is left-to-right, so a duplicate (same file open in both panes) finds
 * the leftmost group first — matching VS Code's "next reveal in this side"
 * behaviour.
 */
export function findOpenFile(
  path: string,
): { groupId: string; tabIndex: number } | null {
  for (const group of editorGroups.value) {
    const idx = group.tabs.findIndex((t) => t.path === path);
    if (idx >= 0) return { groupId: group.id, tabIndex: idx };
  }
  return null;
}

/**
 * Switch focus to an already-open file across any group. Returns true when a
 * matching group was found and focus + the active tab were updated; returns
 * false (no-op) when no group has the file. Callers that want
 * `open-or-create-tab` semantics check the boolean and fall back to their
 * own "read from disk + addTabToActiveGroup" path.
 */
export function focusOpenFile(path: string): boolean {
  const hit = findOpenFile(path);
  if (!hit) return false;
  const idx = editorGroups.value.findIndex((g) => g.id === hit.groupId);
  if (idx < 0) return false;
  activeGroupIndex.value = idx;
  updateActiveGroup({ activeTabIndex: hit.tabIndex });
  return true;
}

/**
 * Set focus to a group by id. No-op if the id does not exist. Click anywhere
 * inside a pane (editor or tab strip) routes through here.
 */
export function setActiveGroup(groupId: string): void {
  const idx = editorGroups.value.findIndex((g) => g.id === groupId);
  if (idx < 0 || idx === activeGroupIndex.value) return;
  activeGroupIndex.value = idx;
}

/**
 * Split the active group to the right: clone its tab list and active tab
 * into a new group with a fresh id. The new group becomes active. No-op
 * when the cap is already hit, when there is no group to split, or when the
 * active group has no tabs (nothing meaningful to clone).
 */
export function splitEditorRight(): void {
  const groups = editorGroups.value;
  if (groups.length >= MAX_GROUPS) return;
  const source = activeGroup();
  if (!source || source.tabs.length === 0) return;
  const id = `g${groupIdCounter++}`;
  const newGroup: EditorGroup = {
    id,
    // Shallow-copy the tab list — each Tab is a fresh object, so the two
    // groups can mark them modified / closed independently without sharing
    // state through reference equality.
    tabs: source.tabs.map((t) => ({ ...t })),
    activeTabIndex: source.activeTabIndex,
  };
  const nextGroups = [...groups, newGroup];
  const nextActive = nextGroups.length - 1;
  suppressMirror++;
  try {
    batch(() => {
      editorGroups.value = nextGroups;
      activeGroupIndex.value = nextActive;
      // The mirrors snap to the new active group.
      openTabs.value = newGroup.tabs;
      activeTabIndex.value = newGroup.activeTabIndex;
    });
  } finally {
    suppressMirror--;
  }
}

/**
 * Remove the group with the given id. If it was the active group, focus
 * falls back to the previous one (clamped to 0). The first ("g0") group is
 * never deleted outright; if it would be the only one closed, it is reset
 * to an empty tab list instead, so the editor never enters a no-group
 * state (which would leave the WelcomeScreen with no host to mount in).
 */
export function closeGroup(groupId: string): void {
  const groups = editorGroups.value;
  if (groups.length <= 1) {
    // Only one group — reset it to empty rather than removing it.
    updateActiveGroup({ tabs: [], activeTabIndex: 0 });
    return;
  }
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx < 0) return;
  const nextGroups = groups.filter((_, i) => i !== idx);
  const oldActive = activeGroupIndex.value;
  let nextActive: number;
  if (oldActive === idx) {
    // Closing the focused group — fall back to the group immediately to
    // its left (or 0 if we were the leftmost).
    nextActive = Math.max(0, idx - 1);
  } else if (oldActive > idx) {
    // Indices to the right of the removed group shift down by one.
    nextActive = oldActive - 1;
  } else {
    nextActive = oldActive;
  }
  const newActiveGroup = nextGroups[nextActive];
  suppressMirror++;
  try {
    batch(() => {
      editorGroups.value = nextGroups;
      activeGroupIndex.value = nextActive;
      openTabs.value = newActiveGroup.tabs;
      activeTabIndex.value = newActiveGroup.activeTabIndex;
    });
  } finally {
    suppressMirror--;
  }
}

/* -------------------------------------------------- bookkeeping effects --- */

/**
 * Wire the bidirectional sync between `editorGroups[activeGroupIndex]` and
 * the writable mirrors `openTabs` / `activeTabIndex`. Idempotent: a second
 * call after the first is a no-op so test files importing the module
 * multiple times do not double-subscribe.
 */
let wired = false;
export function startEditorGroupsSync(): void {
  if (wired) return;
  wired = true;

  // editorGroups / activeGroupIndex → mirrors. Runs once at boot to seed the
  // mirrors from g0, and again on every group transition (split / close /
  // setActive). Skipped while one of the helpers is in the middle of a
  // co-ordinated write to avoid bouncing.
  //
  // The mirror reads use `.peek()` so this effect does NOT take a dependency
  // on `openTabs` / `activeTabIndex` — that would set up the very feedback
  // loop the suppression flag is meant to prevent.
  effect(() => {
    const groups = editorGroups.value;
    const idx = activeGroupIndex.value;
    if (suppressMirror) return;
    const group = groups[idx] ?? groups[0];
    if (!group) return;
    suppressMirror++;
    try {
      // Self-heal a stale index: if some code path shrank `editorGroups`
      // without re-pointing `activeGroupIndex`, the `?? groups[0]` fallback
      // above mirrors g0 — but helpers like `updateActiveGroup` bounds-check
      // the raw index and would silently no-op on every subsequent tab
      // operation. Snap the index to the group we actually mirrored.
      if (idx < 0 || idx >= groups.length) activeGroupIndex.value = 0;
      // Only assign when the value differs by identity to avoid spurious
      // effect re-runs. The mirrors are read by countless components; an
      // identity-equal write still produces a notification in @preact/signals.
      if (openTabs.peek() !== group.tabs) openTabs.value = group.tabs;
      if (activeTabIndex.peek() !== group.activeTabIndex) {
        activeTabIndex.value = group.activeTabIndex;
      }
    } finally {
      suppressMirror--;
    }
  });

  // mirrors → editorGroups[activeGroupIndex]. Lets existing call sites
  // continue to use `openTabs.value = …` and `activeTabIndex.value = …`
  // with the tab/index changes flowing back into the source of truth.
  //
  // `editorGroups` and `activeGroupIndex` are read via `.peek()` to keep
  // this effect's dependency set narrow — it must only fire on a mirror
  // write, never on its own writeback into `editorGroups`.
  effect(() => {
    const tabs = openTabs.value;
    const idx = activeTabIndex.value;
    if (suppressMirror) return;
    const groups = editorGroups.peek();
    const groupIdx = activeGroupIndex.peek();
    const current = groups[groupIdx];
    if (!current) return;
    if (current.tabs === tabs && current.activeTabIndex === idx) return;
    const clampedIdx =
      tabs.length === 0 ? 0 : Math.min(Math.max(idx, 0), tabs.length - 1);
    const next: EditorGroup = { ...current, tabs, activeTabIndex: clampedIdx };
    suppressMirror++;
    try {
      editorGroups.value = groups.map((g, i) => (i === groupIdx ? next : g));
      if (clampedIdx !== idx) activeTabIndex.value = clampedIdx;
    } finally {
      suppressMirror--;
    }
  });
}

/* ------------------------------------------------------------ test reset --- */

/**
 * Test helper — reset the module to its boot state (one empty group, no
 * suppression carrying over from a prior assertion). Not exported via index;
 * imported directly by `tests/lib/editor-groups.spec.ts`.
 */
export function _resetForTests(): void {
  suppressMirror = 0;
  groupIdCounter = 1;
  editorGroups.value = [{ id: "g0", tabs: [], activeTabIndex: 0 }];
  activeGroupIndex.value = 0;
  openTabs.value = [];
  activeTabIndex.value = 0;
}

/* ----------------------------------------------------------- auto-start --- */

// Bridge the source-of-truth and its mirrors as soon as anyone imports this
// module — tests and the dev/prod app alike. The `wired` guard inside
// `startEditorGroupsSync` makes re-imports a no-op. Doing this at module
// load means callers don't have to remember to bootstrap before reading
// the mirrors, and tests that touch `openTabs.value = …` get the writeback
// behaviour for free.
startEditorGroupsSync();
