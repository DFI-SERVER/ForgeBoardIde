/**
 * Compile and upload: stream arduino-cli output, parse diagnostics and sizes, paint editor markers.
 */
import * as monaco from "monaco-editor";
import { arduinoApi } from "@/ipc/arduino";
import { serialApi } from "@/ipc/serial";
import { flushSaveAsync } from "@/features/editor/autosave";
import { settings } from "@/features/settings/settings";
import { parseDiagnostics, type Diagnostic } from "./diagnostics";
import { parseCompileSize } from "./size-parser";
import { pushCompileSize } from "./compile-history";
import { effectiveFqbn, isPortlessUploadFqbn } from "@/features/boards/effective-fqbn";
import { bottomPanelOpen, bottomPanelTab, toast } from "@/app/state";
import { currentSketch } from "@/features/project/state";
import { connectedPort, activeProfile } from "@/features/boards/state";
import { serialConnected, serialBaud } from "@/features/serial/state";
import { editorGroups, activeGroupIndex } from "@/features/editor/state";
import { buildPhase, buildOutput, buildProgress, diagnostics, lastCompileSize } from "./state";
import { ProgressTracker, isCommandLine, loadExpectedInvocations, saveExpectedInvocations } from "./progress";
import { uploadFailureDiagnostic } from "./upload-failure";

/** The owner string under which the IDE's compiler markers are registered. */
const MARKER_OWNER = "arduino";

let listenersReady = false;

/**
 * Hard cap on lines retained in `buildOutput`. A verbose `-v` arduino-cli
 * compile of a heavy framework (ESP-IDF, RP2040 SDK) can emit tens of
 * thousands of lines; without a cap the array grows until the Output panel's
 * DOM count makes the IDE unusable. The oldest lines are dropped (the user
 * cares about the most recent errors and the final size summary) and a
 * single replacement marker takes their slot so the array stays at MAX.
 */
const MAX_BUILD_OUTPUT_LINES = 5000;

/** Append `line` to `buildOutput`, dropping the oldest lines + inserting a
 *  truncation marker if the cap would be exceeded. The marker counts toward
 *  the cap so the visible length is stable at MAX. */
function appendBuildOutputLine(line: string): void {
  const next = [...buildOutput.value, line];
  if (next.length > MAX_BUILD_OUTPUT_LINES) {
    // Drop the oldest lines, keeping the last MAX-1, prepended with a marker.
    const overflow = next.length - MAX_BUILD_OUTPUT_LINES;
    next.splice(0, overflow + 1, `… (${overflow + 1} earlier lines truncated)`);
  }
  buildOutput.value = next;
}

/** The tracker for the build in flight; null between builds. */
let tracker: ProgressTracker | null = null;

/**
 * One streamed output line. Drives the progress bar, and reaches the Output
 * panel unless it is raw tool chatter and verbose output is off — arduino-cli
 * is always run verbose so the stage markers exist, see `progress.ts`.
 */
function handleBuildLine(line: string): void {
  const p = tracker?.feed(line);
  if (p) buildProgress.value = p;
  if (!settings.value.verboseBuild && isCommandLine(line)) return;
  appendBuildOutputLine(line);
}

/** Start tracking a build of `fqbn`, seeded with the previous build's size. */
function startProgress(fqbn: string): void {
  tracker = new ProgressTracker(loadExpectedInvocations(fqbn));
  buildProgress.value = { stage: "Starting", percent: 0 };
}

/** Finish tracking: remember the size for next time on success, clear the bar. */
function finishProgress(fqbn: string, success: boolean): void {
  if (success && tracker) saveExpectedInvocations(fqbn, tracker.invocationCount);
  tracker = null;
  buildProgress.value = null;
}

async function ensureBuildListeners() {
  if (listenersReady) return;
  listenersReady = true;
  await arduinoApi.onCompileOutput(handleBuildLine);
  await arduinoApi.onUploadOutput(handleBuildLine);
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
 * Diagnose an upload failure and return a one-paragraph hint when the symptoms
 * match the ESP32-S3 native-USB "port glitched mid-upload" pattern — only the
 * bootloader chunk lands, the chip is left with `invalid header: 0xffffffff`
 * on next boot. Returns null when the failure doesn't match (compile error,
 * locked port, wrong chip, etc.) so the caller doesn't overlay an irrelevant
 * suggestion onto a different problem.
 */
export function uploadFailureHint(
  outputLines: readonly string[],
  stderr: string,
): string | null {
  const combined = `${outputLines.join("\n")}\n${stderr}`;
  // Strip ANSI so a coloured progress bar still matches.
  const clean = combined.replace(/\x1b\[[0-9;]*m/g, "");
  const serialPostError =
    /Cannot configure port/i.test(clean) ||
    /PermissionError\(\s*13/.test(clean) ||
    /A serial exception/i.test(clean);
  if (!serialPostError) return null;
  return [
    "Hint: the upload dropped mid-flash on a native-USB ESP32-S3 board. Only the",
    "bootloader landed, so the chip will boot to `invalid header: 0xffffffff`.",
    "Try: (1) hit Upload again, (2) hold BOOT on the board while clicking Upload,",
    "(3) swap to a known-good USB data cable — many USB-C cables are charge-only.",
  ].join("\n");
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
  // Bucket history by the FQBN we actually compiled against — when a
  // sketch.yaml profile is active, that's the profile's board, not the
  // global selector. Otherwise the sparkline would mix samples from two
  // different boards into the same series.
  pushCompileSize(effectiveFqbn(), flashPercent);
}

/**
 * Build target derived from the active editor tab.
 *
 * The active tab's sketch is what gets compiled / uploaded — so what is on
 * screen is what gets built. For a tab that belongs to `currentSketch`
 * (no `sketchPath` set), this is `currentSketch.path` plus its profile.
 * For an example tab opened via `openExample`, this is the example's own
 * folder with no profile (the active profile is bound to `currentSketch`
 * and would be the wrong yaml for a different sketch).
 */
function activeBuildTarget(): {
  path: string;
  name: string;
  profile: string | null;
} | null {
  // Read from editorGroups directly (source of truth) instead of the
  // openTabs / activeTabIndex mirrors. The mirrors are kept in sync via
  // effects, but a write that bypasses the suppression flag can leave
  // them lagging the source for a tick — and an upload triggered in
  // that window would build the wrong sketch.
  const groups = editorGroups.value;
  const group = groups[activeGroupIndex.value] ?? groups[0];
  const active = group?.tabs[group.activeTabIndex];
  if (active?.sketchPath) {
    const segs = active.sketchPath.split(/[\\/]/);
    const name = segs.filter((s) => s.length > 0).pop() ?? active.sketchPath;
    return { path: active.sketchPath, name, profile: null };
  }
  const sketch = currentSketch.value;
  if (sketch) {
    return { path: sketch.path, name: sketch.name, profile: activeProfile.value };
  }
  return null;
}

/** Verify / Compile the sketch the active tab belongs to. */
export async function compileSketch(): Promise<void> {
  // Re-entry guard: keyboard shortcuts (Ctrl+R) bypass the ActionBar's
  // disabled state, so a second invocation while a compile or upload is
  // already in flight would spawn another arduino-cli process and have both
  // stream into the same listener.
  const phase = buildPhase.value;
  if (phase === "compiling" || phase === "uploading") return;
  // Flush any pending autosave so the build sees the latest content on disk.
  // Without this, a student typing a fix and immediately hitting Verify/Upload
  // would compile the 2-second-old version and chase a phantom bug.
  await flushSaveAsync();
  const target = activeBuildTarget();
  if (!target) {
    reportPrecheck("No sketch open — open or create a sketch first.");
    return;
  }
  await ensureBuildListeners();
  beginBuild();
  buildPhase.value = "compiling";
  const fqbn = effectiveFqbn();
  startProgress(fqbn);
  try {
    const result = await arduinoApi.compile(
      target.path,
      // Board + the user's board options. Ignored by arduino-cli when a
      // profile is passed (the profile owns the FQBN then).
      fqbn,
      // Always verbose: the stage markers the progress bar needs only exist
      // in -v output. The Output panel filters the chatter itself.
      true,
      target.profile,
    );
    buildPhase.value = result.success ? "success" : "error";
    finishProgress(fqbn, result.success);
    if (!result.success && result.stderr.trim()) {
      buildOutput.value = [...buildOutput.value, "", result.stderr.trimEnd()];
    }
    recordDiagnostics(result.stderr);
    if (result.success) recordCompileSize(result.stderr);
  } catch (err) {
    buildPhase.value = "error";
    finishProgress(fqbn, false);
    buildOutput.value = [...buildOutput.value, `Error: ${String(err)}`];
    recordDiagnostics("");
  }
}

/** Compile and upload the current sketch to the connected board. */
export async function uploadSketch(): Promise<void> {
  // Re-entry guard: keyboard shortcuts (Ctrl+U) bypass the ActionBar's
  // disabled state, so a second invocation while a compile or upload is
  // already in flight would spawn another arduino-cli process and have both
  // stream into the same listener.
  const phase = buildPhase.value;
  if (phase === "compiling" || phase === "uploading") return;
  // Flush any pending autosave so the build sees the latest content on disk.
  // Without this, a student typing a fix and immediately hitting Verify/Upload
  // would compile the 2-second-old version and chase a phantom bug.
  await flushSaveAsync();
  const target = activeBuildTarget();
  if (!target) {
    reportPrecheck("No sketch open — open or create a sketch first.");
    return;
  }
  const port = connectedPort.value;
  // STM32 DFU/SWD uploads find the target themselves (no COM port exists in
  // DFU mode) — only serial-flashed families need a port selected up front.
  const portless = isPortlessUploadFqbn(effectiveFqbn());
  if (!port && !portless) {
    reportPrecheck("No port selected — connect a board first.");
    return;
  }
  await ensureBuildListeners();
  beginBuild();
  buildPhase.value = "uploading";

  // Close the serial monitor before upload — Windows COM ports are exclusive
  // (CreateFile FILE_SHARE_NONE), so esptool/avrdude will get ACCESS_DENIED
  // if Serial Monitor is holding the port. Reopen after the upload completes.
  const wasSerialOpen = serialConnected.value;
  const savedPort = connectedPort.value;
  const savedBaud = serialBaud.value;
  if (wasSerialOpen) {
    try {
      await serialApi.close();
      serialConnected.value = false;
    } catch (e) {
      console.error("couldn't close serial before upload:", e);
      // Continue anyway — upload may still succeed if the port isn't
      // actually held (some platforms allow concurrent reads).
    }
  }

  const fqbn = effectiveFqbn();
  startProgress(fqbn);
  try {
    const result = await arduinoApi.upload(
      target.path,
      fqbn,
      port ?? null,
      true,
      target.profile,
    );
    buildPhase.value = result.success ? "success" : "error";
    finishProgress(fqbn, result.success);
    if (!result.success && result.stderr.trim()) {
      buildOutput.value = [...buildOutput.value, "", result.stderr.trimEnd()];
    }
    // Append a focused hint when the failure matches the ESP32-S3 native-USB
    // "port glitched mid-upload" pattern — bootloader write at 0x0 succeeded,
    // but the connection dropped before the partition table and app firmware
    // could land. The chip will then loop on `invalid header: 0xffffffff`.
    // The hint tells the user exactly what to try next, without lying about
    // the upload having succeeded.
    if (!result.success) {
      const hint = uploadFailureHint(buildOutput.value, result.stderr);
      if (hint) {
        buildOutput.value = [...buildOutput.value, "", hint];
        toast.value = { text: "Upload failed mid-flash — see Output", kind: "warn" };
      }
    }
    recordDiagnostics(result.stderr);
    if (result.success) {
      recordCompileSize(result.stderr);
    } else if (diagnostics.value.length === 0) {
      // Not a code problem: the compiler was happy and the flasher failed.
      // Turn the failure into one Problems entry so the Check → Debug →
      // Solution flow shows the cause and the numbered fix steps there.
      const d = uploadFailureDiagnostic(buildOutput.value, result.stderr);
      if (d) {
        diagnostics.value = [d];
        bottomPanelTab.value = "problems";
      }
    }
  } catch (err) {
    buildPhase.value = "error";
    finishProgress(fqbn, false);
    buildOutput.value = [...buildOutput.value, `Error: ${String(err)}`];
    recordDiagnostics("");
  } finally {
    if (wasSerialOpen && savedPort) {
      try {
        await serialApi.open(savedPort, savedBaud);
        serialConnected.value = true;
      } catch (e) {
        // Quietly fall back to disconnected state. The user can reopen
        // manually from the Serial Monitor button.
        console.error("couldn't reopen serial after upload:", e);
      }
    }
  }
}
