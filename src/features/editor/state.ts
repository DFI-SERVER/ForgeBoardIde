/**
 * Editor groups, tabs, file contents, cursor, save state, and recent files.
 */
import { signal } from "@preact/signals";

/**
 * The editor caret position, 1-based, mirrored from Monaco's
 * onDidChangeCursorPosition. The status bar reads this; the Monaco component
 * is the only writer.
 */
export const cursorPosition = signal<{ line: number; column: number }>({
  line: 1,
  column: 1,
});

/** Per-file contents, keyed by absolute file path. Source of truth for the editor. */
export const fileContents = signal<Map<string, string>>(new Map());

/** One open editor tab, keyed by an absolute file path. */
export interface Tab {
  path: string;
  name: string;
  modified: boolean;
  /** Sketch folder this tab belongs to when it is NOT a member of
   *  `currentSketch` — e.g. an example opened side-by-side with the user's
   *  own sketch. When set, compile/upload target this folder instead of
   *  `currentSketch.path` so what is on screen is what gets built. Undefined
   *  for tabs that belong to the active sketch (the common case). */
  sketchPath?: string;
}

/**
 * One editor group — a vertical pane with its own tab strip + Monaco editor.
 * `id` is a stable string ("g0", "g1", …) used as a Preact key and as the
 * second dimension of the per-(group, path) Monaco view-state cache, so a
 * group remembers each file's cursor + scroll independently of the other.
 */
export interface EditorGroup {
  id: string;
  tabs: Tab[];
  activeTabIndex: number;
}

/**
 * The list of editor groups, left-to-right. The MVP supports at most two
 * groups (a single vertical split); helpers in `lib/editor-groups.ts` enforce
 * that cap. The first group ("g0") always exists, even when empty.
 */
export const editorGroups = signal<EditorGroup[]>([
  { id: "g0", tabs: [], activeTabIndex: 0 },
]);

/** Index of the focused group. Clicks inside a pane (or tab) move it here. */
export const activeGroupIndex = signal<number>(0);

/**
 * The active group's tabs — kept in sync with `editorGroups[activeGroupIndex]`
 * by the effect bootstrapped in `lib/editor-groups.ts`. Writable: existing
 * consumers (`openTabs.value = [...]`) still work and their changes flow
 * back into `editorGroups`. New code that explicitly cares about multiple
 * groups should write through the helpers in `lib/editor-groups.ts` instead.
 */
export const openTabs = signal<Tab[]>([]);

/** The active group's active tab index — kept in sync with `editorGroups`. */
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
