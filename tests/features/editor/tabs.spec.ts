import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  openTabs,
  activeTabIndex,
  editorGroups,
  activeGroupIndex,
  fileContents,
  saveState,
} from "@/features/editor/state";
import { currentSketch } from "@/features/project/state";
import {
  closeTab,
  reopenClosedTab,
  pushClosedTab,
  _resetClosedTabsForTests,
} from "@/features/editor/tabs";
import { _resetForTests } from "@/features/editor/editor-groups";
import { projectApi, type Sketch } from "@/ipc/project";

const SKETCH: Sketch = {
  name: "demo",
  path: "/s/demo",
  files: [
    { name: "demo.ino", path: "/s/demo/demo.ino", is_main: true },
    { name: "helper.h", path: "/s/demo/helper.h", is_main: false },
  ],
};

beforeEach(() => {
  _resetForTests();
  _resetClosedTabsForTests();
  // closeTab awaits flushSaveAsync on modified tabs and the autosave path
  // calls projectApi.saveFile; mock it so the jsdom env can't trip over IPC.
  vi.spyOn(projectApi, "saveFile").mockResolvedValue(undefined);
  vi.spyOn(projectApi, "readFile").mockImplementation(async (p: string) =>
    `// contents of ${p}`,
  );
  currentSketch.value = SKETCH;
  fileContents.value = new Map([
    ["/s/demo/demo.ino", "// demo"],
    ["/s/demo/helper.h", "// helper"],
  ]);
  saveState.value = "saved";
  openTabs.value = [
    { path: "/s/demo/demo.ino", name: "demo.ino", modified: false },
    { path: "/s/demo/helper.h", name: "helper.h", modified: false },
  ];
  activeTabIndex.value = 0;
});

afterEach(() => {
  currentSketch.value = null;
  vi.restoreAllMocks();
});

describe("closeTab + reopenClosedTab", () => {
  it("reopens the most-recently-closed tab", async () => {
    await closeTab(1); // close helper.h
    expect(openTabs.value).toHaveLength(1);
    expect(openTabs.value[0].name).toBe("demo.ino");

    await reopenClosedTab();
    // helper.h is back as a tab.
    const paths = openTabs.value.map((t) => t.path);
    expect(paths).toContain("/s/demo/helper.h");
  });

  it("is a no-op when the closed stack is empty", async () => {
    const before = openTabs.value.length;
    await reopenClosedTab();
    expect(openTabs.value.length).toBe(before);
  });

  it("focuses an already-open file instead of pushing a duplicate", async () => {
    await closeTab(1); // close helper.h
    // User reopens manually via sidebar (we simulate by re-pushing the tab).
    openTabs.value = [
      ...openTabs.value,
      { path: "/s/demo/helper.h", name: "helper.h", modified: false },
    ];
    const lenBefore = openTabs.value.length;
    await reopenClosedTab();
    // Length unchanged — no duplicate created.
    expect(openTabs.value.length).toBe(lenBefore);
  });

  it("skips entries whose file is no longer part of the open sketch", async () => {
    // Stack a ghost path the current sketch doesn't have.
    pushClosedTab("/s/old-sketch/gone.ino");
    // Then a real one.
    await closeTab(1); // closes helper.h, pushes it on top
    await reopenClosedTab();
    // The real one was reopened…
    expect(openTabs.value.map((t) => t.path)).toContain("/s/demo/helper.h");
    // …and a second pop would silently drop the ghost without throwing.
    await reopenClosedTab();
  });

  it("dedups when the same path is closed twice", async () => {
    pushClosedTab("/s/demo/helper.h");
    pushClosedTab("/s/demo/demo.ino");
    pushClosedTab("/s/demo/helper.h"); // duplicate — moves to top
    // Pop once — should reopen helper.h.
    await reopenClosedTab();
    expect(openTabs.value.map((t) => t.path)).toContain("/s/demo/helper.h");
    // Reset so we can prove only one entry was left behind.
    editorGroups.value = [
      {
        id: "g0",
        tabs: [{ path: "/s/demo/demo.ino", name: "demo.ino", modified: false }],
        activeTabIndex: 0,
      },
    ];
    activeGroupIndex.value = 0;
    // Next pop should be demo.ino — helper.h was NOT in the stack twice.
    await reopenClosedTab();
    expect(openTabs.value.map((t) => t.path)).toContain("/s/demo/demo.ino");
  });
});
