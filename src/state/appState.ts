import { signal, computed } from "@preact/signals";
import type { Sketch } from "../ipc/project";
import type { Core, Board, DetectedBoard } from "../ipc/arduino";

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

export const connectedBoard = signal<string | null>("ForgeBoard Beginner");
export const connectedPort = signal<string | null>("COM3");

export const bottomPanelOpen = signal<boolean>(true);
export const bottomPanelTab = signal<"serial" | "output" | "plotter" | "problems">("serial");

export const problemsCount = computed(() => 0);

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
