/**
 * The IDE's core actions, in one place. The menu bar, the sidebar buttons,
 * the action bar and a future command palette all call these — so behaviour
 * stays identical no matter how an action is triggered.
 */
import {
  open as openNativeDialog,
  save as saveNativeDialog,
} from "@tauri-apps/plugin-dialog";
import * as monaco from "monaco-editor";
import { projectApi } from "../ipc/project";
import { arduinoApi } from "../ipc/arduino";
import { loadSketch } from "./sketch";
import { flushSave } from "./autosave";
import { splitEditorRight as splitEditorRightImpl } from "./editor-groups";
import { settings } from "./settings";
import { getActiveEditor } from "../components/MonacoEditor";
import { parseDiagnostics, type Diagnostic } from "./diagnostics";
import { parseCompileSize } from "./size-parser";
import { pushCompileSize } from "./compile-history";
import {
  currentSketch,
  activeRail,
  connectedPort,
  selectedFqbn,
  activeProfile,
  buildPhase,
  buildOutput,
  bottomPanelOpen,
  bottomPanelTab,
  newSketchDialogOpen,
  burnBootloaderDialogOpen,
  openTabs,
  activeTabIndex,
  fileContents,
  diagnostics,
  lastCompileSize,
  toast,
} from "../state/appState";

/** The owner string under which the IDE's compiler markers are registered. */
const MARKER_OWNER = "arduino";

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

/**
 * Open an example as a fresh, editable sketch.
 *
 * An example is never edited in place. Its source is copied into a brand-new
 * sketch in the sketchbook, which is then loaded into the editor. The new
 * sketch is named after the example; on a name collision a numeric suffix is
 * appended (`Blink`, `Blink 2`, `Blink 3`, …) until a free name is found.
 *
 * `exampleName` is the display name (e.g. "Blink"); `source` is the full `.ino`
 * to seed the sketch with. Surfaces failures as a toast.
 */
export async function openExample(
  exampleName: string,
  source: string,
): Promise<void> {
  // A sketch folder name must be a single, separator-free path component;
  // a library example name can contain spaces or other characters. Keep
  // letters, digits, spaces, '-' and '_'; collapse the rest to spaces.
  const base =
    exampleName
      .replace(/[^A-Za-z0-9 _-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Example";

  try {
    let created;
    // project_create rejects an existing folder with AlreadyExists; retry
    // with an incrementing suffix until a free name is found.
    for (let attempt = 1; ; attempt++) {
      const candidate = attempt === 1 ? base : `${base} ${attempt}`;
      try {
        created = await projectApi.create(candidate, null);
        break;
      } catch (e) {
        if (isAlreadyExists(e) && attempt < 100) continue;
        throw e;
      }
    }
    // Seed the new sketch's main .ino with the example's source, then reload
    // so the editor shows the example content rather than the blank stub.
    const main = created.files.find((f) => f.is_main) ?? created.files[0];
    if (main) {
      await projectApi.saveFile(main.path, source);
    }
    const fresh = await projectApi.open(created.path);
    await loadSketch(fresh);
    toast.value = {
      text: `Opened "${exampleName}" as a new sketch`,
      kind: "success",
    };
  } catch (e) {
    toast.value = {
      text: `Couldn't open that example: ${errText(e)}`,
      kind: "warn",
    };
  }
}

/** True when a thrown value is a serialized `ProjectError::AlreadyExists`. */
function isAlreadyExists(e: unknown): boolean {
  return (
    !!e &&
    typeof e === "object" &&
    "type" in e &&
    (e as { type: unknown }).type === "AlreadyExists"
  );
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

/**
 * Archive the current sketch — zip its folder to a `.zip` the user chooses.
 * A no-op (with a toast) when no sketch is open.
 */
export async function archiveSketch(): Promise<void> {
  const sketch = currentSketch.value;
  if (!sketch) {
    toast.value = { text: "No sketch open to archive.", kind: "warn" };
    return;
  }
  const dest = await saveNativeDialog({
    title: "Archive sketch",
    defaultPath: `${sketch.name}.zip`,
    filters: [{ name: "Zip archive", extensions: ["zip"] }],
  });
  if (typeof dest !== "string") return;
  try {
    await projectApi.archiveSketch(sketch.path, dest);
    toast.value = { text: `Sketch archived to ${dest}`, kind: "success" };
  } catch (e) {
    toast.value = {
      text: `Couldn't archive the sketch: ${errText(e)}`,
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
  // A fresh compile invalidates the previous run's problems and squiggles.
  diagnostics.value = [];
  clearDiagnosticMarkers();
  // …and the previous run's memory bar, so we don't pin yesterday's numbers
  // to today's compile output while the new build is in flight.
  lastCompileSize.value = null;
}

/* ---------------------------------------------------------- Diagnostics --- */

/** Wipe every editor model's compiler markers (start-of-compile reset). */
function clearDiagnosticMarkers() {
  for (const model of monaco.editor.getModels()) {
    monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
  }
}

/**
 * Paint compiler diagnostics onto the open editor models as squiggles.
 *
 * Diagnostics are grouped by file and matched to a Monaco model by the file's
 * absolute path (`model.uri.path`). Monaco stores URI paths with a leading
 * slash and forward slashes, so a Windows compiler path is normalised the
 * same way before comparison. Diagnostics for files that have no open model
 * are simply not drawn (they still appear in the Problems panel).
 */
function applyDiagnosticMarkers(list: Diagnostic[]) {
  // model.uri.path style: forward slashes, lower-cased drive letter, leading
  // slash. Normalise a raw compiler path to the same shape so they compare.
  const normalize = (p: string) =>
    p
      .replace(/\\/g, "/")
      .replace(/^([a-zA-Z]):/, (_, d: string) => `/${d.toLowerCase()}:`)
      .replace(/^\/?/, "/")
      .toLowerCase();

  const byNormalizedFile = new Map<string, Diagnostic[]>();
  for (const d of list) {
    const key = normalize(d.file);
    const bucket = byNormalizedFile.get(key);
    if (bucket) bucket.push(d);
    else byNormalizedFile.set(key, [d]);
  }

  for (const model of monaco.editor.getModels()) {
    const modelKey = model.uri.path.toLowerCase();
    const forModel = byNormalizedFile.get(modelKey);
    if (!forModel || forModel.length === 0) {
      monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
      continue;
    }
    const markers: monaco.editor.IMarkerData[] = forModel.map((d) => {
      const maxLine = model.getLineCount();
      const line = Math.min(Math.max(d.line, 1), maxLine);
      const lineMaxCol = model.getLineMaxColumn(line);
      const startCol = Math.min(Math.max(d.column, 1), lineMaxCol);
      return {
        severity:
          d.severity === "error"
            ? monaco.MarkerSeverity.Error
            : monaco.MarkerSeverity.Warning,
        message: d.message,
        startLineNumber: line,
        startColumn: startCol,
        endLineNumber: line,
        endColumn: lineMaxCol,
      };
    });
    monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
  }
}

/**
 * Parse a finished compile's raw output into structured diagnostics, publish
 * them to the `diagnostics` signal, and paint them as editor squiggles.
 *
 * `buildOutput` holds the streamed compiler lines; `stderr` is the captured
 * stderr from the compile result (a superset on failure). Both are fed to the
 * parser and de-duplicated so a problem emitted on both streams appears once.
 */
function recordDiagnostics(stderr: string) {
  const parsed = [
    ...parseDiagnostics(buildOutput.value),
    ...parseDiagnostics(stderr),
  ];
  const seen = new Set<string>();
  const unique: Diagnostic[] = [];
  for (const d of parsed) {
    const key = `${d.file}|${d.line}|${d.column}|${d.severity}|${d.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(d);
  }
  diagnostics.value = unique;
  applyDiagnosticMarkers(unique);
}

/**
 * Parse the size summary out of a finished build's output and publish it.
 *
 * arduino-cli's two `Sketch uses … / Global variables use …` lines reach us on
 * the streamed compile-output channel (already inside `buildOutput`), but they
 * may also appear in stderr on some toolchains; feed both through the parser
 * and keep the result on success. On a failed build (linker error, etc.) the
 * lines are not emitted and the parser returns null — `lastCompileSize` stays
 * null, which is exactly what `beginBuild()` reset it to.
 */
function recordCompileSize(stderr: string) {
  const parsed =
    parseCompileSize(buildOutput.value) ?? parseCompileSize(stderr);
  if (!parsed) return;
  lastCompileSize.value = parsed;
  const flashPercent = (parsed.flashUsed / parsed.flashTotal) * 100;
  pushCompileSize(selectedFqbn.value, flashPercent);
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
    const result = await arduinoApi.compile(
      sketch.path,
      selectedFqbn.value,
      settings.value.verboseBuild,
      activeProfile.value,
    );
    buildPhase.value = result.success ? "success" : "error";
    if (!result.success && result.stderr.trim()) {
      buildOutput.value = [...buildOutput.value, "", result.stderr.trimEnd()];
    }
    recordDiagnostics(result.stderr);
    if (result.success) recordCompileSize(result.stderr);
  } catch (err) {
    buildPhase.value = "error";
    buildOutput.value = [...buildOutput.value, `Error: ${String(err)}`];
    recordDiagnostics("");
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
    const result = await arduinoApi.upload(
      sketch.path,
      selectedFqbn.value,
      port,
      settings.value.verboseBuild,
      activeProfile.value,
    );
    buildPhase.value = result.success ? "success" : "error";
    if (!result.success && result.stderr.trim()) {
      buildOutput.value = [...buildOutput.value, "", result.stderr.trimEnd()];
    }
    recordDiagnostics(result.stderr);
    if (result.success) recordCompileSize(result.stderr);
  } catch (err) {
    buildPhase.value = "error";
    buildOutput.value = [...buildOutput.value, `Error: ${String(err)}`];
    recordDiagnostics("");
  }
}

/* ---------------------------------------------------------------- View --- */

/** Show or hide the bottom panel. */
export function toggleBottomPanel() {
  bottomPanelOpen.value = !bottomPanelOpen.value;
}

/**
 * Split the editor right — clone the active group's tabs + active file into
 * a new pane next to it. No-op when a split already exists, or when nothing
 * is open to clone.
 */
export function splitEditorRight() {
  splitEditorRightImpl();
}

/** Open the bottom panel and switch it to the Problems tab. */
export function showProblems() {
  bottomPanelOpen.value = true;
  bottomPanelTab.value = "problems";
}

/** Open the bottom panel on the Serial Monitor tab. */
export function openSerialMonitor() {
  bottomPanelOpen.value = true;
  bottomPanelTab.value = "serial";
}

/** Open the bottom panel on the Serial Plotter tab. */
export function openSerialPlotter() {
  bottomPanelOpen.value = true;
  bottomPanelTab.value = "plotter";
}

/** Switch the activity rail to the Libraries view. */
export function openLibraries() {
  activeRail.value = "libraries";
}

/** Switch the activity rail to the Boards view. */
export function openBoardsManager() {
  activeRail.value = "boards";
}

/* --------------------------------------------------------------- Tools --- */

/** Open the Burn Bootloader confirm dialog. The dialog itself collects the
 *  programmer selection and invokes the backend on confirm — see
 *  `BurnBootloaderDialog.tsx`. */
export function openBurnBootloaderDialog() {
  burnBootloaderDialogOpen.value = true;
}
