import { describe, it, expect, beforeEach } from "vitest";
import {
  baseName,
  dirName,
  reconcileRenamedTab,
  reconcileDeletedTab,
} from "@/features/project/file-ops";
import {
  openTabs,
  activeTabIndex,
  fileContents,
  editorGroups,
  activeGroupIndex,
} from "@/features/editor/state";
import { _resetForTests } from "@/features/editor/editor-groups";

beforeEach(() => {
  _resetForTests();
  fileContents.value = new Map();
});

describe("baseName", () => {
  it("extracts the final segment of a Windows path", () => {
    expect(baseName("C:\\sketches\\blink\\blink.ino")).toBe("blink.ino");
  });
  it("extracts the final segment of a POSIX path", () => {
    expect(baseName("/home/user/blink/pins.h")).toBe("pins.h");
  });
  it("returns the input when there is no separator", () => {
    expect(baseName("loose.txt")).toBe("loose.txt");
  });
});

describe("dirName", () => {
  it("returns the directory of a Windows path", () => {
    expect(dirName("C:\\sketches\\blink\\blink.ino")).toBe(
      "C:\\sketches\\blink",
    );
  });
  it("returns the directory of a POSIX path", () => {
    expect(dirName("/home/user/blink/pins.h")).toBe("/home/user/blink");
  });
});

describe("reconcileRenamedTab", () => {
  it("repoints an open tab and updates its label", () => {
    openTabs.value = [
      { path: "C:\\s\\blink\\old.h", name: "old.h", modified: true },
      { path: "C:\\s\\blink\\blink.ino", name: "blink.ino", modified: false },
    ];
    reconcileRenamedTab("C:\\s\\blink\\old.h", "C:\\s\\blink\\new.h");
    expect(openTabs.value[0]).toEqual({
      path: "C:\\s\\blink\\new.h",
      name: "new.h",
      modified: true,
    });
    // The unrelated tab is untouched.
    expect(openTabs.value[1].name).toBe("blink.ino");
  });

  it("re-keys cached file contents to the new path", () => {
    fileContents.value = new Map([["C:\\s\\b\\old.h", "#define A 1"]]);
    reconcileRenamedTab("C:\\s\\b\\old.h", "C:\\s\\b\\new.h");
    expect(fileContents.value.has("C:\\s\\b\\old.h")).toBe(false);
    expect(fileContents.value.get("C:\\s\\b\\new.h")).toBe("#define A 1");
  });

  it("is a no-op when the renamed file has no open tab", () => {
    openTabs.value = [
      { path: "C:\\s\\b\\blink.ino", name: "blink.ino", modified: false },
    ];
    reconcileRenamedTab("C:\\s\\b\\other.h", "C:\\s\\b\\renamed.h");
    expect(openTabs.value[0].path).toBe("C:\\s\\b\\blink.ino");
  });
});

describe("reconcileDeletedTab", () => {
  it("closes the deleted file's tab", () => {
    openTabs.value = [
      { path: "C:\\s\\b\\a.h", name: "a.h", modified: false },
      { path: "C:\\s\\b\\b.h", name: "b.h", modified: false },
    ];
    reconcileDeletedTab("C:\\s\\b\\a.h");
    expect(openTabs.value).toHaveLength(1);
    expect(openTabs.value[0].path).toBe("C:\\s\\b\\b.h");
  });

  it("drops the deleted file's cached contents", () => {
    fileContents.value = new Map([
      ["C:\\s\\b\\a.h", "x"],
      ["C:\\s\\b\\b.h", "y"],
    ]);
    reconcileDeletedTab("C:\\s\\b\\a.h");
    expect(fileContents.value.has("C:\\s\\b\\a.h")).toBe(false);
    expect(fileContents.value.has("C:\\s\\b\\b.h")).toBe(true);
  });

  it("is a no-op when the deleted file is not open", () => {
    openTabs.value = [
      { path: "C:\\s\\b\\blink.ino", name: "blink.ino", modified: false },
    ];
    reconcileDeletedTab("C:\\s\\b\\gone.h");
    expect(openTabs.value).toHaveLength(1);
  });
});

describe("reconcileRenamedTab — split editor", () => {
  it("repoints every matching tab across both groups", () => {
    editorGroups.value = [
      {
        id: "g0",
        tabs: [{ path: "/s/a.h", name: "a.h", modified: false }],
        activeTabIndex: 0,
      },
      {
        id: "g1",
        tabs: [{ path: "/s/a.h", name: "a.h", modified: true }],
        activeTabIndex: 0,
      },
    ];
    activeGroupIndex.value = 0;
    reconcileRenamedTab("/s/a.h", "/s/renamed.h");
    expect(editorGroups.value[0].tabs[0].path).toBe("/s/renamed.h");
    expect(editorGroups.value[1].tabs[0].path).toBe("/s/renamed.h");
    expect(editorGroups.value[0].tabs[0].name).toBe("renamed.h");
    // The second pane's modified flag survives the rename.
    expect(editorGroups.value[1].tabs[0].modified).toBe(true);
  });
});

describe("reconcileDeletedTab — split editor", () => {
  it("removes the file's tab from every group", () => {
    editorGroups.value = [
      {
        id: "g0",
        tabs: [
          { path: "/s/a.h", name: "a.h", modified: false },
          { path: "/s/b.h", name: "b.h", modified: false },
        ],
        activeTabIndex: 0,
      },
      {
        id: "g1",
        tabs: [{ path: "/s/a.h", name: "a.h", modified: false }],
        activeTabIndex: 0,
      },
    ];
    activeGroupIndex.value = 0;
    reconcileDeletedTab("/s/a.h");
    // g0 keeps b.h. g1 had only the deleted file → collapsed away.
    expect(editorGroups.value).toHaveLength(1);
    expect(editorGroups.value[0].tabs.map((t) => t.path)).toEqual(["/s/b.h"]);
  });

  it("preserves the first group even when its only tab is deleted", () => {
    editorGroups.value = [
      {
        id: "g0",
        tabs: [{ path: "/s/only.h", name: "only.h", modified: false }],
        activeTabIndex: 0,
      },
    ];
    activeGroupIndex.value = 0;
    reconcileDeletedTab("/s/only.h");
    expect(editorGroups.value).toHaveLength(1);
    expect(editorGroups.value[0].tabs).toEqual([]);
  });
});
