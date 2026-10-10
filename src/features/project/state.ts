/**
 * The open sketch and the Find-in-Project / New Sketch UI state.
 */
import { signal } from "@preact/signals";
import type { Sketch } from "@/ipc/project";

/** Whether the app-global "New sketch" dialog is open. Driven by the shared
 *  `newSketch()` action so both the sidebar button and the File menu can open it. */
export const newSketchDialogOpen = signal<boolean>(false);

/** Currently opened sketch (metadata from disk). */
export const currentSketch = signal<Sketch | null>(null);

/** Find in Project — the Search rail's query box (debounced before a search). */
export const projectSearchQuery = signal<string>("");

/**
 * Bumped to ask the Search view to focus (and select) its query input — used
 * by the Ctrl+Shift+F shortcut, which must focus the box even when the Search
 * rail is already the active view and so would not remount.
 */
export const searchFocusRequest = signal<number>(0);
