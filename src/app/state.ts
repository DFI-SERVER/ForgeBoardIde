/**
 * App-shell state: which rail is active, bottom panel visibility, and the global toast.
 */
import { signal } from "@preact/signals";

export type RailIcon =
  | "home"
  | "files"
  | "examples"
  | "search"
  | "libraries"
  | "boards"
  | "settings";

// HomeView is the friendliest landing — Recent sketches + cards beat dropping
// a first-time user straight into an empty Files tree.
export const activeRail = signal<RailIcon>("home");

export const bottomPanelOpen = signal<boolean>(true);

export const bottomPanelTab = signal<"serial" | "output" | "plotter" | "problems">("serial");

/** Transient bottom-right notification (board auto-detect, etc.). */
export type ToastKind = "success" | "info" | "warn";

export interface ToastMessage {
  text: string;
  kind: ToastKind;
}

export const toast = signal<ToastMessage | null>(null);
