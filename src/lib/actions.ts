/**
 * The IDE's core actions, in one place. The menu bar, the sidebar buttons,
 * the action bar and a future command palette all call these — so behaviour
 * stays identical no matter how an action is triggered.
 */
import { open as openNativeDialog } from "@tauri-apps/plugin-dialog";
import { projectApi } from "../ipc/project";
import { arduinoApi } from "../ipc/arduino";
import { loadSketch } from "./sketch";
import { flushSave } from "./autosave";
import { getActiveEditor } from "../components/MonacoEditor";
import {
  currentSketch,
  connectedPort,
  selectedFqbn,
  buildPhase,
  buildOutput,
  bottomPanelOpen,
  bottomPanelTab,
  newSketchDialogOpen,
  openTabs,
  activeTabIndex,
  fileContents,
  toast,
} from "../state/appState";

/** Pull a readable message out of a thrown value (incl. serialized ProjectError). */
export function errText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

/* ---------------------------------------------------------------- File --- */

/**
 * Start a new sketch — opens the app-global "New sketch" dialog. The dialog
 * itself (rendered in App.tsx) collects the name + location and calls
 * `createSketch()`.
 */
export function newSketch() {
  newSketchDialogOpen.value = true;
}

/** Create a sketch on disk and load it into the editor. Throws on failure so
 *  the dialog can surface the error inline. */
export async function createSketch(
  name: string,
  location: string | null,
): Promise<void> {
  const created = await projectApi.create(name, location);
  await loadSketch(created);
}

/** Open an existing sketch — native folder picker, then load it. */
export async function openSketch(): Promise<void> {
  const picked = await openNativeDialog({
    directory: true,
    title: "Open a sketch folder",
  });
  if (typeof picked !== "string") return;
  try {
    const opened = await projectApi.open(picked);
    await loadSketch(opened);
  } catch (e) {
    toast.value = {
      text: `Couldn't open that folder: ${errText(e)}`,
      kind: "warn",
    };
  }
}

/** Open a specific recent sketch by its folder path (used by Open Recent). */
export async function openRecentSketch(path: string): Promise<void> {
  try {
    const opened = await projectApi.open(path);
    await loadSketch(opened);
  } catch (e) {
    toast.value = {
      text: `Couldn't open that sketch: ${errText(e)}`,
      kind: "warn",
    };
  }
}

/** Flush any pending edits to disk immediately (the Ctrl+S path). */
export function saveActiveFile() {
  flushSave();
}

/**
 * Open a sketch file in the editor and, optionally, jump the cursor to a line.
 *
 * Reuses the Files view's open mechanism — finding the file's tab by absolute
 * path and switching `activeTabIndex` to it. If the file belongs to the open
 * sketch but has no tab yet (an edge case — `loadSketch` opens every file as a
 * tab), a tab is created so the click still works. After the tab is active,
 * the Monaco model swap is async, so the line jump is deferred a tick.
 *
 * Used by the Find in Project results list. `line` is 1-based.
 */
export function openFileAtLine(path: string, line?: number): void {
  let idx = openTabs.value.findIndex((t) => t.path === path);

  if (idx < 0) {
    // No tab open for this file — create one if it's part of the sketch.
    const file = currentSketch.value?.files.find((f) => f.path === path);
    if (!file) return;
    if (!fileContents.value.has(path)) return; // contents not loaded — bail
    openTabs.value = [
      ...openTabs.value,
      { path: file.path, name: file.name, modified: false },
    ];
    idx = openTabs.value.length - 1;
  }

  activeTabIndex.value = idx;
  if (line === undefined) return;

  // The editor swaps its model in a useEffect after the tab change commits,
  // so reveal/select on the next macrotask once that content is in place.
  setTimeout(() => {
    const editor = getActiveEditor();
    if (!editor) return;
    const model = editor.getModel();
    const clamped = model
      ? Math.min(Math.max(line, 1), model.getLineCount())
      : Math.max(line, 1);
    editor.revealLineInCenter(clamped);
    editor.setSelection({
      startLineNumber: clamped,
      startColumn: 1,
      endLineNumber: clamped,
      endColumn: 1,
    });
    editor.setPosition({ lineNumber: clamped, column: 1 });
    editor.focus();
  }, 0);
}

/* --------------------------------------------------------------- Build --- */

let listenersReady = false;
async function ensureBuildListeners() {
  if (listenersReady) return;
  listenersReady = true;
  const append = (line: string) => {
    buildOutput.value = [...buildOutput.value, line];
  };
  await arduinoApi.onCompileOutput(append);
  await arduinoApi.onUploadOutput(append);
}

function reportPrecheck(message: string) {
  buildOutput.value = [message];
  buildPhase.value = "idle";
  bottomPanelOpen.value = true;
  bottomPanelTab.value = "output";
}

function beginBuild() {
  buildOutput.value = [];
  bottomPanelOpen.value = true;
  bottomPanelTab.value = "output";
}

/** Verify / Compile the current sketch. */
export async function compileSketch(): Promise<void> {
  const sketch = currentSketch.value;
  if (!sketch) {
    reportPrecheck("No sketch open — open or create a sketch first.");
    return;
  }
  await ensureBuildListeners();
  beginBuild();
  buildPhase.value = "compiling";
  try {
    const result = await arduinoApi.compile(sketch.path, selectedFqbn.value);
    buildPhase.value = result.success ? "success" : "error";
    if (!result.success && result.stderr.trim()) {
      buildOutput.value = [...buildOutput.value, "", result.stderr.trimEnd()];
    }
  } catch (err) {
    buildPhase.value = "error";
    buildOutput.value = [...buildOutput.value, `Error: ${String(err)}`];
  }
}

/** Compile and upload the current sketch to the connected board. */
export async function uploadSketch(): Promise<void> {
  const sketch = currentSketch.value;
  if (!sketch) {
    reportPrecheck("No sketch open — open or create a sketch first.");
    return;
  }
  const port = connectedPort.value;
  if (!port) {
    reportPrecheck("No port selected — connect a board first.");
    return;
  }
  await ensureBuildListeners();
  beginBuild();
  buildPhase.value = "uploading";
  try {
    const result = await arduinoApi.upload(sketch.path, selectedFqbn.value, port);
    buildPhase.value = result.success ? "success" : "error";
    if (!result.success && result.stderr.trim()) {
      buildOutput.value = [...buildOutput.value, "", result.stderr.trimEnd()];
    }
  } catch (err) {
    buildPhase.value = "error";
    buildOutput.value = [...buildOutput.value, `Error: ${String(err)}`];
  }
}

/* ---------------------------------------------------------------- View --- */

/** Show or hide the bottom panel. */
export function toggleBottomPanel() {
  bottomPanelOpen.value = !bottomPanelOpen.value;
}
