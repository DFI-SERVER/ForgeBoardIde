import { signal, computed } from "@preact/signals";

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

export const openTabs = signal<{ path: string; modified: boolean }[]>([
  { path: "led-chase.ino", modified: true },
  { path: "pins.h", modified: false },
  { path: "config.h", modified: false },
]);

export const activeTabIndex = signal<number>(0);

export const saveState = signal<"saved" | "saving" | "unsaved">("saved");
