import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as monaco from "monaco-editor";
import {
  currentSketch,
  fileContents,
  editorGroups,
  activeGroupIndex,
  openTabs,
  activeTabIndex,
  saveState,
  sketchProfiles,
  activeProfile,
  diagnostics,
  buildOutput,
  buildPhase,
  lastCompileSize,
} from "../../src/state/appState";
import { projectApi, type Sketch } from "../../src/ipc/project";

/* ----------------------------------------------------------- fixtures --- */

const OLD_SKETCH: Sketch = {
  name: "Old",
  path: "/s/Old",
  files: [{ name: "Old.ino", path: "/s/Old/Old.ino", is_main: true }],
};

const NEW_SKETCH: Sketch = {
  name: "New",
  path: "/s/New",
  files: [{ name: "New.ino", path: "/s/New/New.ino", is_main: true }],
};

/* ---------------------------------------------------------- harness ---- */

beforeEach(() => {
  // Default mocks — each test that cares about call ordering can override.
  vi.spyOn(projectApi, "readFile").mockImplementation(async (p: string) =>
    `// contents of ${p}`,
  );
  vi.spyOn(projectApi, "saveFile").mockResolvedValue(undefined);
  vi.spyOn(projectApi, "readProfiles").mockResolvedValue(null);

  // Reset shared signals so tests don't leak into each other.
  sketchProfiles.value = [];
  activeProfile.value = null;
  saveState.value = "saved";
  currentSketch.value = null;
  fileContents.value = new Map();
  editorGroups.value = [{ id: "g0", tabs: [], activeTabIndex: 0 }];
  activeGroupIndex.value = 0;
  openTabs.value = [];
  activeTabIndex.value = 0;
  diagnostics.value = [];
  buildOutput.value = [];
  buildPhase.value = "idle";
  lastCompileSize.value = null;
});

afterEach(() => {
  // Tear down any Monaco models created during the test so the next test
  // starts from an empty model registry.
  for (const m of monaco.editor.getModels()) m.dispose();
  vi.restoreAllMocks();
});

/* -------------------------------------- loadSketch — unsaved-edit safety --- */

describe("loadSketch — preserves unsaved edits before swapping sketch", () => {
  it("flushes pending save before wiping fileContents", async () => {
    const { loadSketch } = await import("../../src/lib/sketch");

    // Set up: one group with the old sketch's tab marked modified.
    currentSketch.value = OLD_SKETCH;
    const oldPath = OLD_SKETCH.files[0].path;
    const dirtyContents = "void setup() { /* USER EDIT */ }";

    editorGroups.value = [
      {
        id: "g0",
        tabs: [{ path: oldPath, name: "Old.ino", modified: true }],
        activeTabIndex: 0,
      },
    ];
    openTabs.value = editorGroups.value[0].tabs;
    fileContents.value = new Map([[oldPath, dirtyContents]]);
    saveState.value = "unsaved";

    const saveSpy = vi.spyOn(projectApi, "saveFile").mockResolvedValue(undefined);

    await loadSketch(NEW_SKETCH);

    // The user's last edit landed on disk before the in-memory cache was
    // wiped. Before the fix, fileContents was replaced with the new sketch's
    // file map without ever calling saveFile for the old, modified path.
    expect(saveSpy).toHaveBeenCalledWith(oldPath, dirtyContents);
    // And after loading, the new sketch is current.
    expect(currentSketch.value).toBe(NEW_SKETCH);
    expect(fileContents.value.has(NEW_SKETCH.files[0].path)).toBe(true);
  });
});

/* -------------------------------------- loadSketch — stale model purge ---- */

describe("loadSketch — disposes Monaco models for stale buffers", () => {
  it("disposes every existing model so the next mount rebuilds from fresh seeds", async () => {
    const { loadSketch } = await import("../../src/lib/sketch");

    // Seed a Monaco model that mimics one the editor created last session.
    const stalePath = "/s/Old/Old.ino";
    const staleUri = monaco.Uri.parse(`file://${stalePath}`);
    const staleModel = monaco.editor.createModel(
      "stale contents from previous session",
      "arduino",
      staleUri,
    );
    expect(monaco.editor.getModels()).toHaveLength(1);
    expect(staleModel.isDisposed()).toBe(false);

    await loadSketch(NEW_SKETCH);

    // Every model was disposed; getOrCreateModel will lazily rebuild them.
    expect(staleModel.isDisposed()).toBe(true);
    expect(monaco.editor.getModels()).toHaveLength(0);
  });
});

/* -------------------------------- loadSketch — per-build transient state --- */

describe("loadSketch — clears per-build transient state on swap", () => {
  it("resets diagnostics, buildOutput, buildPhase and lastCompileSize", async () => {
    const { loadSketch } = await import("../../src/lib/sketch");

    // Seed every signal with a non-default value, as if a previous build had
    // just finished and the user immediately swaps to a new sketch.
    diagnostics.value = [
      {
        file: "/s/Old/Old.ino",
        line: 2,
        column: 1,
        severity: "error",
        message: "stale diagnostic",
      },
    ];
    buildOutput.value = ["stale output line 1", "stale output line 2"];
    buildPhase.value = "error";
    lastCompileSize.value = {
      flashUsed: 1000,
      flashTotal: 4000,
      ramUsed: 500,
      ramTotal: 2000,
    };

    await loadSketch(NEW_SKETCH);

    // Every per-build signal collapses back to its empty / idle / null state
    // so the Problems, Output and MemoryBar panels don't pin yesterday's
    // build to today's sketch.
    expect(diagnostics.value).toEqual([]);
    expect(buildOutput.value).toEqual([]);
    expect(buildPhase.value).toBe("idle");
    expect(lastCompileSize.value).toBeNull();
  });
});
