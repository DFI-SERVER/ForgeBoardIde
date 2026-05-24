import { signal, computed, type Signal } from "@preact/signals";
import type { Sketch } from "../ipc/project";
import type {
  Core,
  Board,
  DetectedBoard,
  Library,
  LibraryExample,
} from "../ipc/arduino";
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

/** Whether the Burn Bootloader confirm dialog is open. Opened by the Tools
 *  menu entry and the matching command-palette command. */
export const burnBootloaderDialogOpen = signal<boolean>(false);

/** Whether the fuzzy-search command palette overlay is open. The Ctrl+Shift+P
 *  / Ctrl+K shortcuts toggle this via togglePalette(); menu-click opens via
 *  openPalette(). The palette resets its query each time it opens. */
export const paletteOpen = signal<boolean>(false);

/** Which palette flow is active. Set by openPalette(); read by CommandPalette
 *  to choose its result provider and select action. Defaults to "command"
 *  for backwards compatibility with existing Ctrl+Shift+P / Ctrl+K callers. */
export type PaletteMode = "command" | "file";
export const paletteMode = signal<PaletteMode>("command");

/** Open the palette in the requested mode. Single entry point so every
 *  trigger goes through one place. */
export function openPalette(mode: PaletteMode = "command"): void {
  paletteMode.value = mode;
  paletteOpen.value = true;
}

/** Toggle the palette. Used by global Ctrl+Shift+P / Ctrl+K, which open the
 *  palette if closed and close it if already open (preserves the muscle
 *  memory from VS Code and the prior ForgeBoard behavior). The mode is only
 *  set when opening. */
export function togglePalette(mode: PaletteMode = "command"): void {
  if (paletteOpen.value) {
    paletteOpen.value = false;
  } else {
    paletteMode.value = mode;
    paletteOpen.value = true;
  }
}

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

/** Maximum number of recently-focused file paths tracked. The buffer is
 *  larger than the Quick Open empty-state list (8) so that filtering to
 *  the current sketch's membership still leaves a useful number of recents
 *  to show after other sketches' entries are excluded. */
export const MAX_RECENT_FILE_PATHS = 16;

/** Most-recently-focused file paths, newest first. Persisted to localStorage
 *  via the same `forgeboard.recent-files` key the tracking module rehydrates
 *  from on boot. Source of truth for Quick Open's empty state. */
export const recentFilePaths = signal<string[]>([]);

/** Push `path` to the front of the recents list, dedup, and trim to
 *  MAX_RECENT_FILE_PATHS. No-op on empty input. */
export function pushRecentFilePath(path: string): void {
  if (!path) return;
  const cur = recentFilePaths.value;
  const filtered = cur.filter((p) => p !== path);
  filtered.unshift(path);
  if (filtered.length > MAX_RECENT_FILE_PATHS) {
    filtered.length = MAX_RECENT_FILE_PATHS;
  }
  recentFilePaths.value = filtered;
}

export const saveState = signal<"saved" | "saving" | "unsaved">("saved");

/** Compile / upload lifecycle phase — drives the ActionBar buttons and Output panel. */
export type BuildPhase = "idle" | "compiling" | "uploading" | "success" | "error";
export const buildPhase = signal<BuildPhase>("idle");

/** arduino-cli output lines for the current build, in order. */
export const buildOutput = signal<string[]>([]);

/**
 * Most recent parsed compile sizes (flash + RAM, used + total) from arduino-cli's
 * size summary. Null until the first successful compile produces a parseable
 * report; reset to null at the start of every compile so the MemoryBar does
 * not show stale numbers while a build is in flight.
 */
export const lastCompileSize = signal<{
  flashUsed: number;
  flashTotal: number;
  ramUsed: number;
  ramTotal: number;
} | null>(null);

/**
 * Per-FQBN history of flash-usage percentages from the last N successful
 * compiles. Persisted via lib/compile-history.ts; keyed by FQBN so the
 * sparkline tracks a particular board's drift over time. Capped at 10 per
 * FQBN — older entries fall off the front when a new one is pushed.
 */
export const compileSizeHistory = signal<Map<string, number[]>>(new Map());

/** FQBN the IDE compiles and uploads against. Board-selector wiring lands in Phase 8. */
export const selectedFqbn = signal<string>("esp32:esp32:esp32s3");

/**
 * One reproducible-build profile, as advertised by a sketch's `sketch.yaml`.
 * Mirrors the `ProfileInfo` returned by the `project_read_profiles` IPC.
 */
export interface SketchProfile {
  name: string;
  fqbn: string;
  notes?: string;
}

/**
 * Profiles loaded from the open sketch's `sketch.yaml`. An empty array means
 * either "no `sketch.yaml`" or "yaml exists but declares no profiles" — the
 * UI hides the profile pill in either case.
 *
 * Repopulated by `bootstrap` / `loadSketch` whenever the open sketch changes.
 */
export const sketchProfiles: Signal<SketchProfile[]> = signal([]);

/**
 * The currently-active profile name, or `null` when the user is using the
 * global board selector instead. When non-null, compile/upload IPCs pass it
 * as `--profile <name>` to arduino-cli; FQBN comes from the profile in that
 * mode. The pill displays a check next to the active entry in its dropdown.
 */
export const activeProfile: Signal<string | null> = signal(null);

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

/** Libraries — full registry browse + installed set (Phase 9 Library Manager). */
export const installedLibraries = signal<Library[]>([]);
/** Raw text in the library search box — filters the cached registry in memory. */
export const librarySearchQuery = signal<string>("");
/**
 * The entire Arduino library registry (~9000 entries), fetched once via
 * `arduino_lib_list_all` and cached. `null` means "not loaded yet" — distinct
 * from `[]`, which would mean "loaded, and empty".
 */
export const libraryRegistry = signal<Library[] | null>(null);
/** Lifecycle of the one-time full-registry fetch. */
export type LibraryRegistryStatus = "idle" | "loading" | "ready" | "error";
export const libraryRegistryStatus = signal<LibraryRegistryStatus>("idle");
/**
 * Search-only fallback results — used when the full-registry fetch failed
 * (e.g. offline) and the user searches the registry the old, per-query way.
 */
export const librarySearchResults = signal<Library[]>([]);
/** True while a fallback registry search request is in flight. */
export const librarySearchPending = signal<boolean>(false);
/** Library Manager browse scope — the All / Installed segmented toggle. */
export type LibraryFilterMode = "all" | "installed";
export const libraryFilterMode = signal<LibraryFilterMode>("all");
/** Name of the library whose install / update / remove is currently running. */
export const libraryInstalling = signal<string | null>(null);
/** Streamed progress lines from the active library install/uninstall. */
export const libraryInstallProgress = signal<string[]>([]);

/** Find in Project — the Search rail's query box (debounced before a search). */
export const projectSearchQuery = signal<string>("");

/**
 * Examples — the Examples rail. The curated starter set is static frontend
 * data (see lib/example-catalog.ts); these signals hold the dynamic,
 * installed-library examples and the live filter text.
 */
export const libraryExamples = signal<LibraryExample[]>([]);
/** Raw text in the Examples search box — filters examples by name as you type. */
export const exampleSearchQuery = signal<string>("");
/** True while the installed-library examples scan is in flight. */
export const exampleScanPending = signal<boolean>(false);
/** Name of the example currently being opened as a new sketch, or null. */
export const exampleOpening = signal<string | null>(null);

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
