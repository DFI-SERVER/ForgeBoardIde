/**
 * Unit tests for the build actions in `src/lib/actions.ts`.
 *
 * The key invariant verified here: `compileSketch` and `uploadSketch` MUST
 * await any pending autosave before they hand off to arduino-cli. Without
 * this, a student typing a fix and immediately hitting Verify or Upload
 * would compile the 2-second-old version and chase a phantom bug.
 *
 * `vi.resetModules()` is avoided — Monaco registers global commands at
 * module-load time and a second registration throws. The tests therefore
 * use plain `vi.spyOn` on the live module graph and rely on the call-order
 * assertion (saveFile must land before compile/upload).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  saveState,
  fileContents,
  editorGroups,
  activeGroupIndex,
  openTabs,
  activeTabIndex,
  currentSketch,
  connectedPort,
  serialConnected,
} from "../../src/state/appState";
import { compileSketch, uploadSketch } from "../../src/lib/actions";
import { projectApi } from "../../src/ipc/project";
import { arduinoApi } from "../../src/ipc/arduino";

beforeEach(() => {
  vi.restoreAllMocks();
  // Quiet the build-listener subscriptions — both Tauri events are stubbed
  // with no-op unlisten functions so ensureBuildListeners() resolves.
  vi.spyOn(arduinoApi, "onCompileOutput").mockResolvedValue(() => {});
  vi.spyOn(arduinoApi, "onUploadOutput").mockResolvedValue(() => {});
});

describe("compileSketch — flushes pending autosave before compile", () => {
  it("awaits saveFile before invoking arduino_compile", async () => {
    const callOrder: string[] = [];
    vi.spyOn(projectApi, "saveFile").mockImplementation(async () => {
      callOrder.push("saveFile");
    });
    vi.spyOn(arduinoApi, "compile").mockImplementation(async () => {
      callOrder.push("compile");
      return { success: true, exit_code: 0, stderr: "" };
    });

    // A modified tab plus saveState = "unsaved" is what makes flushSaveAsync
    // actually call saveFile. Without modified tabs it's a no-op.
    const path = "/s/compile-flush-test.ino";
    editorGroups.value = [
      { id: "g0", tabs: [{ path, name: "compile-flush-test.ino", modified: true }], activeTabIndex: 0 },
    ];
    activeGroupIndex.value = 0;
    openTabs.value = editorGroups.value[0].tabs;
    activeTabIndex.value = 0;
    fileContents.value = new Map([[path, "void setup(){}"]]);
    saveState.value = "unsaved";

    // currentSketch must be set or compileSketch bails early with a precheck.
    currentSketch.value = {
      name: "demo",
      path: "/s",
      files: [{ name: "compile-flush-test.ino", path, is_main: true }],
    };

    await compileSketch();

    // The save must complete before compile is invoked.
    expect(callOrder).toEqual(["saveFile", "compile"]);
  });
});

describe("uploadSketch — flushes pending autosave before upload", () => {
  it("awaits saveFile before invoking arduino_upload", async () => {
    const callOrder: string[] = [];
    vi.spyOn(projectApi, "saveFile").mockImplementation(async () => {
      callOrder.push("saveFile");
    });
    vi.spyOn(arduinoApi, "upload").mockImplementation(async () => {
      callOrder.push("upload");
      return { success: true, exit_code: 0, stderr: "" };
    });

    const path = "/s/upload-flush-test.ino";
    editorGroups.value = [
      { id: "g0", tabs: [{ path, name: "upload-flush-test.ino", modified: true }], activeTabIndex: 0 },
    ];
    activeGroupIndex.value = 0;
    openTabs.value = editorGroups.value[0].tabs;
    activeTabIndex.value = 0;
    fileContents.value = new Map([[path, "void setup(){}"]]);
    saveState.value = "unsaved";

    currentSketch.value = {
      name: "demo",
      path: "/s",
      files: [{ name: "upload-flush-test.ino", path, is_main: true }],
    };
    connectedPort.value = "COM3";
    // Serial closed so the FIX-5 close-before-upload path doesn't try to
    // call serialApi.close (which would need its own mock).
    serialConnected.value = false;

    await uploadSketch();

    expect(callOrder).toEqual(["saveFile", "upload"]);
  });
});
