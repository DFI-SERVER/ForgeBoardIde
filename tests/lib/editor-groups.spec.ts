import { describe, it, expect, beforeEach } from "vitest";
import {
  splitEditorRight,
  closeGroup,
  setActiveGroup,
  updateActiveGroup,
  addTabToActiveGroup,
  markPathModifiedEverywhere,
  findOpenFile,
  focusOpenFile,
  MAX_GROUPS,
  _resetForTests,
} from "../../src/lib/editor-groups";
import {
  editorGroups,
  activeGroupIndex,
  openTabs,
  activeTabIndex,
} from "../../src/state/appState";

const TAB_A = { path: "/s/a.ino", name: "a.ino", modified: false };
const TAB_B = { path: "/s/b.h", name: "b.h", modified: false };
const TAB_C = { path: "/s/c.cpp", name: "c.cpp", modified: false };

beforeEach(() => {
  _resetForTests();
});

describe("editor-groups — mirror sync", () => {
  it("writing openTabs.value flows into editorGroups[active].tabs", () => {
    openTabs.value = [TAB_A, TAB_B];
    expect(editorGroups.value[0].tabs).toEqual([TAB_A, TAB_B]);
  });

  it("writing activeTabIndex.value flows into editorGroups[active].activeTabIndex", () => {
    openTabs.value = [TAB_A, TAB_B];
    activeTabIndex.value = 1;
    expect(editorGroups.value[0].activeTabIndex).toBe(1);
  });

  it("activeGroupIndex change snaps mirrors to the new active group's tabs", () => {
    // Two groups with different tab sets.
    editorGroups.value = [
      { id: "g0", tabs: [TAB_A], activeTabIndex: 0 },
      { id: "g1", tabs: [TAB_B, TAB_C], activeTabIndex: 1 },
    ];
    activeGroupIndex.value = 1;
    expect(openTabs.value).toEqual([TAB_B, TAB_C]);
    expect(activeTabIndex.value).toBe(1);
  });
});

describe("splitEditorRight", () => {
  it("clones the active group's tabs into a new pane and focuses it", () => {
    updateActiveGroup({ tabs: [TAB_A, TAB_B], activeTabIndex: 1 });
    splitEditorRight();
    expect(editorGroups.value).toHaveLength(2);
    expect(editorGroups.value[1].tabs.map((t) => t.path)).toEqual(
      [TAB_A, TAB_B].map((t) => t.path),
    );
    expect(editorGroups.value[1].activeTabIndex).toBe(1);
    expect(activeGroupIndex.value).toBe(1);
  });

  it("uses unique fresh ids and never reuses old ones", () => {
    updateActiveGroup({ tabs: [TAB_A], activeTabIndex: 0 });
    splitEditorRight();
    const firstSplitId = editorGroups.value[1].id;
    closeGroup(firstSplitId);
    splitEditorRight();
    expect(editorGroups.value[1].id).not.toBe(firstSplitId);
  });

  it("is a no-op when the cap is already reached", () => {
    updateActiveGroup({ tabs: [TAB_A], activeTabIndex: 0 });
    splitEditorRight();
    expect(editorGroups.value).toHaveLength(MAX_GROUPS);
    splitEditorRight();
    expect(editorGroups.value).toHaveLength(MAX_GROUPS);
  });

  it("is a no-op when the active group has no tabs to clone", () => {
    splitEditorRight();
    expect(editorGroups.value).toHaveLength(1);
  });
});

describe("closeGroup", () => {
  it("removes a non-leftmost group and shifts focus", () => {
    updateActiveGroup({ tabs: [TAB_A], activeTabIndex: 0 });
    splitEditorRight();
    expect(editorGroups.value).toHaveLength(2);
    const rightId = editorGroups.value[1].id;
    closeGroup(rightId);
    expect(editorGroups.value).toHaveLength(1);
    expect(editorGroups.value[0].id).toBe("g0");
    expect(activeGroupIndex.value).toBe(0);
  });

  it("closing the focused group falls back to the left neighbour", () => {
    updateActiveGroup({ tabs: [TAB_A], activeTabIndex: 0 });
    splitEditorRight();
    expect(activeGroupIndex.value).toBe(1);
    closeGroup(editorGroups.value[1].id);
    expect(activeGroupIndex.value).toBe(0);
  });

  it("closing an unfocused group leaves the focus on the same group", () => {
    updateActiveGroup({ tabs: [TAB_A], activeTabIndex: 0 });
    splitEditorRight();
    // Refocus the leftmost pane (g0).
    setActiveGroup("g0");
    expect(activeGroupIndex.value).toBe(0);
    closeGroup(editorGroups.value[1].id);
    expect(activeGroupIndex.value).toBe(0);
    expect(editorGroups.value[0].id).toBe("g0");
  });

  it("never removes the last group — empties it instead", () => {
    updateActiveGroup({ tabs: [TAB_A], activeTabIndex: 0 });
    closeGroup("g0");
    expect(editorGroups.value).toHaveLength(1);
    expect(editorGroups.value[0].tabs).toEqual([]);
  });
});

describe("setActiveGroup", () => {
  it("moves focus to the named group", () => {
    updateActiveGroup({ tabs: [TAB_A], activeTabIndex: 0 });
    splitEditorRight();
    expect(activeGroupIndex.value).toBe(1);
    setActiveGroup("g0");
    expect(activeGroupIndex.value).toBe(0);
  });

  it("is a no-op for an unknown group id", () => {
    setActiveGroup("g999");
    expect(activeGroupIndex.value).toBe(0);
  });
});

describe("updateActiveGroup", () => {
  it("replaces only the tabs when tabs is in the patch", () => {
    updateActiveGroup({ tabs: [TAB_A, TAB_B] });
    expect(editorGroups.value[0].tabs).toEqual([TAB_A, TAB_B]);
    expect(openTabs.value).toEqual([TAB_A, TAB_B]);
  });

  it("clamps activeTabIndex into the new tabs' range", () => {
    updateActiveGroup({ tabs: [TAB_A, TAB_B], activeTabIndex: 99 });
    expect(editorGroups.value[0].activeTabIndex).toBe(1);
  });
});

describe("addTabToActiveGroup", () => {
  it("appends a new path and selects it", () => {
    updateActiveGroup({ tabs: [TAB_A], activeTabIndex: 0 });
    addTabToActiveGroup(TAB_B);
    expect(editorGroups.value[0].tabs).toEqual([TAB_A, TAB_B]);
    expect(editorGroups.value[0].activeTabIndex).toBe(1);
  });

  it("dedupes — selecting an already-open tab instead of appending", () => {
    updateActiveGroup({ tabs: [TAB_A, TAB_B], activeTabIndex: 1 });
    addTabToActiveGroup(TAB_A);
    expect(editorGroups.value[0].tabs).toEqual([TAB_A, TAB_B]);
    expect(editorGroups.value[0].activeTabIndex).toBe(0);
  });
});

describe("markPathModifiedEverywhere", () => {
  it("flips modified on every matching tab across all groups", () => {
    updateActiveGroup({ tabs: [TAB_A, TAB_B], activeTabIndex: 0 });
    splitEditorRight();
    // Both g0 and g1 have a tab for TAB_A.path; mark it modified.
    markPathModifiedEverywhere(TAB_A.path);
    for (const group of editorGroups.value) {
      const t = group.tabs.find((x) => x.path === TAB_A.path);
      expect(t?.modified).toBe(true);
    }
    // Other tabs untouched.
    expect(editorGroups.value[0].tabs[1].modified).toBe(false);
  });

  it("is a no-op when no tab points at the path", () => {
    updateActiveGroup({ tabs: [TAB_A], activeTabIndex: 0 });
    const before = editorGroups.value;
    markPathModifiedEverywhere("/s/nope");
    expect(editorGroups.value).toBe(before);
  });
});

describe("findOpenFile", () => {
  it("returns null when no group has the path", () => {
    updateActiveGroup({ tabs: [TAB_A], activeTabIndex: 0 });
    expect(findOpenFile("/s/never.ino")).toBeNull();
  });

  it("finds a path in the only group", () => {
    updateActiveGroup({ tabs: [TAB_A, TAB_B], activeTabIndex: 0 });
    expect(findOpenFile(TAB_B.path)).toEqual({
      groupId: "g0",
      tabIndex: 1,
    });
  });

  it("finds a path in the right pane when only the right pane has it", () => {
    // Set up: g0 has TAB_A; split to g1 (cloned); then close TAB_A out of
    // g0 only by giving g0 a smaller tab list. The result: only g1 holds
    // TAB_A, and findOpenFile must surface it from g1.
    updateActiveGroup({ tabs: [TAB_A], activeTabIndex: 0 });
    splitEditorRight();
    // Replace g0's tabs so TAB_A is gone there; activeGroupIndex is g1.
    setActiveGroup("g0");
    updateActiveGroup({ tabs: [TAB_B], activeTabIndex: 0 });
    const hit = findOpenFile(TAB_A.path);
    expect(hit).not.toBeNull();
    expect(hit!.groupId).not.toBe("g0");
  });

  it("returns the leftmost group when both panes have the same file", () => {
    // Clone-split keeps both groups holding TAB_A — the scan must report
    // the leftmost (g0), mirroring VS Code's "reveal on this side" rule.
    updateActiveGroup({ tabs: [TAB_A], activeTabIndex: 0 });
    splitEditorRight();
    expect(findOpenFile(TAB_A.path)).toEqual({
      groupId: "g0",
      tabIndex: 0,
    });
  });
});

describe("focusOpenFile", () => {
  it("returns false and leaves focus untouched when nothing matches", () => {
    updateActiveGroup({ tabs: [TAB_A], activeTabIndex: 0 });
    const beforeIdx = activeGroupIndex.value;
    expect(focusOpenFile("/s/nope.ino")).toBe(false);
    expect(activeGroupIndex.value).toBe(beforeIdx);
  });

  it("focuses the matching group and selects the tab", () => {
    // Two groups, file only in g1, focus starts on g0 → must shift to g1.
    updateActiveGroup({ tabs: [TAB_A], activeTabIndex: 0 });
    splitEditorRight();
    setActiveGroup("g0");
    // g1 still has TAB_A from the clone-split; replace its tabs with
    // [TAB_B, TAB_C] for clarity, then look up TAB_C.
    setActiveGroup(editorGroups.value[1].id);
    updateActiveGroup({ tabs: [TAB_B, TAB_C], activeTabIndex: 0 });
    setActiveGroup("g0");
    expect(activeGroupIndex.value).toBe(0);

    expect(focusOpenFile(TAB_C.path)).toBe(true);
    expect(activeGroupIndex.value).toBe(1);
    expect(editorGroups.value[1].activeTabIndex).toBe(1);
  });

  it("is a stable no-op when the file is already focused in the active group", () => {
    updateActiveGroup({ tabs: [TAB_A, TAB_B], activeTabIndex: 1 });
    expect(focusOpenFile(TAB_B.path)).toBe(true);
    expect(activeGroupIndex.value).toBe(0);
    expect(editorGroups.value[0].activeTabIndex).toBe(1);
  });
});
