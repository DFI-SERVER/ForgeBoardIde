import { signal, computed } from "@preact/signals";
import type { Sketch } from "../ipc/project";
import type { Core, Board, DetectedBoard, Library } from "../ipc/arduino";
import { countDiagnostics, type Diagnostic } from "../lib/diagnostics";

export type RailIcon =
  | "home"
  | "files"
  | "examples"
  | "search"
  | "libraries"
  | "boards"
  | "walkthrough"
  | "settings";

export const activeRail = signal<RailIcon>("files");

/**
 * Board connection — honest state, driven entirely by real detection
 * (see lib/connection.ts). Everything starts empty: nothing is "connected"
 * until a board is actually found on a port.
 */
export const connectedPort = signal<string | null>(null);
/** The real identified board name, e.g. "ESP32-S3 Dev Module" — null until identified. */
export const connectedBoard = signal<string | null>(null);
/** True while an identify probe is running on connectedPort. */
export const identifyInProgress = signal<boolean>(false);

/** Coarse connection state, derived from the signals above. */
export type ConnectionState = "no-board" | "detecting" | "connected" | "unidentified";
export const connectionState = computed<ConnectionState>(() => {
  if (connectedPort.value === null) return "no-board";
  if (identifyInProgress.value) return "detecting";
  return connectedBoard.value !== null ? "connected" : "unidentified";
});

export const bottomPanelOpen = signal<boolean>(true);
export const bottomPanelTab = signal<"serial" | "output" | "plotter" | "problems">("serial");

/** Whether the app-global "New sketch" dialog is open. Driven by the shared
 *  `newSketch()` action so both the sidebar button and the File menu can open it. */
export const newSketchDialogOpen = signal<boolean>(false);

/** Whether the fuzzy-search command palette overlay is open. Toggled by
 *  Ctrl+Shift+P / Ctrl+K; the palette resets its query each time it opens. */
export const paletteOpen = signal<boolean>(false);

/** Whether the Keyboard Shortcuts reference modal is open. Opened by F1, the
 *  Help menu, and a command-palette command; the modal resets its filter each
 *  time it opens. */
export const keyboardShortcutsOpen = signal<boolean>(false);

/**
 * Structured compiler diagnostics from the most recent compile (see
 * lib/diagnostics.ts). Replaced wholesale after each compile — empty until
 * the first compile runs, and reset to empty at the start of every compile.
 */
export const diagnostics = signal<Diagnostic[]>([]);

/** Error / warning tallies derived from `diagnostics`. */
export const diagnosticCounts = computed(() => countDiagnostics(diagnostics.value));

/** Total problem count — the badge on the Problems tab. */
export const problemsCount = computed(
  () => diagnosticCounts.value.errors + diagnosticCounts.value.warnings,
);

/**
 * The editor caret position, 1-based, mirrored from Monaco's
 * onDidChangeCursorPosition. The status bar reads this; the Monaco component
 * is the only writer.
 */
export const cursorPosition = signal<{ line: number; column: number }>({
  line: 1,
  column: 1,
});

/** Currently opened sketch (metadata from disk). */
export const currentSketch = signal<Sketch | null>(null);

/** Per-file contents, keyed by absolute file path. Source of truth for the editor. */
export const fileContents = signal<Map<string, string>>(new Map());

/** Open editor tabs, referenced by absolute file path. */
export const openTabs = signal<{ path: string; name: string; modified: boolean }[]>([]);

export const activeTabIndex = signal<number>(0);

export const saveState = signal<"saved" | "saving" | "unsaved">("saved");

/** Compile / upload lifecycle phase — drives the ActionBar buttons and Output panel. */
export type BuildPhase = "idle" | "compiling" | "uploading" | "success" | "error";
export const buildPhase = signal<BuildPhase>("idle");

/** arduino-cli output lines for the current build, in order. */
export const buildOutput = signal<string[]>([]);

/** FQBN the IDE compiles and uploads against. Board-selector wiring lands in Phase 8. */
export const selectedFqbn = signal<string>("esp32:esp32:esp32s3");

/** Serial Monitor log — received lines, sent lines, and info notices. */
export interface SerialLogEntry {
  ts: number;
  text: string;
  kind: "rx" | "tx" | "info";
}
export const serialLog = signal<SerialLogEntry[]>([]);
export const serialBaud = signal<number>(115200);
export const serialLineEnding = signal<"\n" | "\r\n" | "\r" | "">("\n");
export const serialConnected = signal<boolean>(false);

/** Boards & Ports — installed cores + detected hardware (Phase 8). */
export const installedCores = signal<Core[]>([]);
export const installedBoards = signal<Board[]>([]);
export const detectedPorts = signal<DetectedBoard[]>([]);
export const coreInstallProgress = signal<string[]>([]);
export const coreInstallRunning = signal<string | null>(null);

/** Libraries — registry search + installed set (Phase 9 Library Manager). */
export const installedLibraries = signal<Library[]>([]);
/** Raw text in the library search box (debounced before a search fires). */
export const librarySearchQuery = signal<string>("");
export const librarySearchResults = signal<Library[]>([]);
/** True while a registry search request is in flight. */
export const librarySearchPending = signal<boolean>(false);
/** Name of the library whose install / update / remove is currently running. */
export const libraryInstalling = signal<string | null>(null);
/** Streamed progress lines from the active library install/uninstall. */
export const libraryInstallProgress = signal<string[]>([]);

/** Find in Project — the Search rail's query box (debounced before a search). */
export const projectSearchQuery = signal<string>("");

/**
 * Bumped to ask the Search view to focus (and select) its query input — used
 * by the Ctrl+Shift+F shortcut, which must focus the box even when the Search
 * rail is already the active view and so would not remount.
 */
export const searchFocusRequest = signal<number>(0);

/** Transient bottom-right notification (board auto-detect, etc.). */
export type ToastKind = "success" | "info" | "warn";
export interface ToastMessage {
  text: string;
  kind: ToastKind;
}
export const toast = signal<ToastMessage | null>(null);
