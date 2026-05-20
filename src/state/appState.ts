import { signal, computed } from "@preact/signals";
import type { Sketch } from "../ipc/project";

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
