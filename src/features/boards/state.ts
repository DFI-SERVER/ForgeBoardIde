/**
 * Board connection, selected FQBN, sketch profiles, and installed cores/boards.
 */
import { signal, computed, type Signal } from "@preact/signals";
import type { Core, Board, DetectedBoard } from "@/ipc/arduino";

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

/** Whether the Burn Bootloader confirm dialog is open. Opened by the Tools
 *  menu entry and the matching command-palette command. */
export const burnBootloaderDialogOpen = signal<boolean>(false);

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

/** Boards & Ports — installed cores + detected hardware (Phase 8). */
export const installedCores = signal<Core[]>([]);

export const installedBoards = signal<Board[]>([]);

export const detectedPorts = signal<DetectedBoard[]>([]);

export const coreInstallProgress = signal<string[]>([]);

export const coreInstallRunning = signal<string | null>(null);

/**
 * Why the last board scan could not run, in user words — or null when the
 * watcher is scanning normally. Set when `arduino-cli board list` itself
 * fails (first launch without internet, missing discovery tool, broken
 * install), which is different from "scanned fine, found nothing". The
 * connection pill shows it so an empty board list is never silent.
 */
export const boardScanError = signal<string | null>(null);

/** True while the first-launch arduino-cli setup (index + discovery tool
 *  download) is running. The connection pill shows "Preparing Arduino
 *  tools…" instead of "No board" during that window. */
export const toolsPreparing = signal<boolean>(false);
