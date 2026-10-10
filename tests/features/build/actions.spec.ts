/**
 * Unit tests for the build actions in `src/features/build/actions.ts`.
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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  saveState,
  fileContents,
  editorGroups,
  activeGroupIndex,
  openTabs,
  activeTabIndex,
} from "@/features/editor/state";
import { currentSketch } from "@/features/project/state";
import { connectedPort } from "@/features/boards/state";
import { serialConnected } from "@/features/serial/state";
import { buildPhase } from "@/features/build/state";
import { compileSketch, uploadSketch } from "@/features/build/actions";
import { projectApi } from "@/ipc/project";
import { arduinoApi } from "@/ipc/arduino";

beforeEach(() => {
  vi.restoreAllMocks();
  // Reset the phase so tests that don't care about re-entry don't trip the
  // new guard. The re-entry tests set this explicitly.
  buildPhase.value = "idle";
  // Quiet the build-listener subscriptions — both Tauri events are stubbed
  // with no-op unlisten functions so ensureBuildListeners() resolves.
  vi.spyOn(arduinoApi, "onCompileOutput").mockResolvedValue(() => {});
  vi.spyOn(arduinoApi, "onUploadOutput").mockResolvedValue(() => {});
});

afterEach(() => {
  buildPhase.value = "idle";
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

/* ------------------- re-entry guard against keyboard repeat --------------- */

describe("compileSketch — refuses re-entry while a build is in flight", () => {
  it("does NOT invoke arduino_compile when buildPhase is compiling", async () => {
    const compileSpy = vi.spyOn(arduinoApi, "compile").mockResolvedValue({
      success: true,
      exit_code: 0,
      stderr: "",
    });

    // Set up a sketch so compileSketch wouldn't bail on the precheck.
    currentSketch.value = {
      name: "demo",
      path: "/s",
      files: [
        { name: "demo.ino", path: "/s/demo.ino", is_main: true },
      ],
    };
    buildPhase.value = "compiling";

    await compileSketch();

    expect(compileSpy).not.toHaveBeenCalled();
    // The phase stays untouched — the early return doesn't reset it.
    expect(buildPhase.value).toBe("compiling");
  });

  it("does NOT invoke arduino_compile when buildPhase is uploading", async () => {
    const compileSpy = vi.spyOn(arduinoApi, "compile").mockResolvedValue({
      success: true,
      exit_code: 0,
      stderr: "",
    });

    currentSketch.value = {
      name: "demo",
      path: "/s",
      files: [
        { name: "demo.ino", path: "/s/demo.ino", is_main: true },
      ],
    };
    buildPhase.value = "uploading";

    await compileSketch();

    expect(compileSpy).not.toHaveBeenCalled();
  });
});

describe("uploadSketch — refuses re-entry while a build is in flight", () => {
  it("does NOT invoke arduino_upload when buildPhase is uploading", async () => {
    const uploadSpy = vi.spyOn(arduinoApi, "upload").mockResolvedValue({
      success: true,
      exit_code: 0,
      stderr: "",
    });

    currentSketch.value = {
      name: "demo",
      path: "/s",
      files: [
        { name: "demo.ino", path: "/s/demo.ino", is_main: true },
      ],
    };
    connectedPort.value = "COM3";
    serialConnected.value = false;
    buildPhase.value = "uploading";

    await uploadSketch();

    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("does NOT invoke arduino_upload when buildPhase is compiling", async () => {
    const uploadSpy = vi.spyOn(arduinoApi, "upload").mockResolvedValue({
      success: true,
      exit_code: 0,
      stderr: "",
    });

    currentSketch.value = {
      name: "demo",
      path: "/s",
      files: [
        { name: "demo.ino", path: "/s/demo.ino", is_main: true },
      ],
    };
    connectedPort.value = "COM3";
    serialConnected.value = false;
    buildPhase.value = "compiling";

    await uploadSketch();

    expect(uploadSpy).not.toHaveBeenCalled();
  });
});
