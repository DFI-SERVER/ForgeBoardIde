/**
 * Keybindings — the single source of truth for every keyboard shortcut.
 *
 * One list, three consumers:
 *   - `shortcuts.ts` installs a window keydown handler from the `global`
 *     entries here, so the documented combo is the combo that actually fires.
 *   - `commands.ts` builds its palette commands from this list, so a command's
 *     shortcut hint can never drift from its real binding.
 *   - The Keyboard Shortcuts reference modal renders this list verbatim.
 *
 * Adding or changing a shortcut is a one-line edit here; everything else
 * follows. The `keybindings.spec.ts` suite guards the invariants (unique ids,
 * no two entries on the same combo, every entry labelled and categorised).
 */
import { activeRail, openPalette, togglePalette, keyboardShortcutsOpen } from "../state/appState";
import {
  newSketch,
  openSketch,
  saveActiveFile,
  compileSketch,
  uploadSketch,
  toggleBottomPanel,
  openSerialMonitor,
  openLibraries,
  splitEditorRight,
  toggleFullscreen,
} from "./actions";
import {
  editorFind,
  editorReplace,
  editorUndo,
  editorRedo,
  editorAutoFormat,
  editorGoToLine,
} from "./editor-actions";
import { searchFocusRequest, type RailIcon } from "../state/appState";
import { closeActiveTab, nextTab, reopenClosedTab } from "./tabs";

/** Shortcut grouping, in the order the reference modal lists them. */
export type KeybindingCategory = "File" | "Sketch" | "Edit" | "Tools" | "View";

/** Display order for categories in the reference modal. */
export const CATEGORY_ORDER: KeybindingCategory[] = [
  "File",
  "Sketch",
  "Edit",
  "Tools",
  "View",
];

/**
 * Where a binding is handled:
 *   - `global` — installed by `installShortcuts()` on the window.
 *   - `editor` — owned by Monaco's own keybinding service (undo/redo); listed
 *     here for the reference, but not installed globally so we don't shadow
 *     the editor's native, selection-aware handling.
 */
export type KeybindingScope = "global" | "editor";

/** A single keyboard shortcut. */
export interface Keybinding {
  /** Stable, unique identifier — also the palette command id. */
  id: string;
  /**
   * Canonical combo string, e.g. `"Ctrl+Shift+P"` or `"F1"`. Modifiers in the
   * fixed order Ctrl, Shift, Alt; the key last. This exact string is shown to
   * the user and is parsed by `matchKeyEvent`, so the two never disagree.
   */
  combo: string;
  /** Human-readable action name, shown in the reference and the palette. */
  label: string;
  /** Grouping label. */
  category: KeybindingCategory;
  /** Where the binding lives (see `KeybindingScope`). */
  scope: KeybindingScope;
  /** Performs the action. */
  run: () => void;
}

/** Switch the activity rail to a given view. */
function goRail(rail: RailIcon): () => void {
  return () => {
    activeRail.value = rail;
  };
}

/** Find in Project — focus the Search rail's query box. */
function findInProject(): void {
  activeRail.value = "search";
  searchFocusRequest.value++;
}

/**
 * Every keyboard shortcut, grouped by category. The reference modal renders
 * them in this order; `CATEGORY_ORDER` decides the group order.
 */
export const keybindings: Keybinding[] = [
  /* ---------------------------------------------------------- File --- */
  {
    id: "file.new",
    combo: "Ctrl+N",
    label: "New Sketch",
    category: "File",
    scope: "global",
    run: newSketch,
  },
  {
    id: "file.open",
    combo: "Ctrl+O",
    label: "Open Sketch",
    category: "File",
    scope: "global",
    run: openSketch,
  },
  {
    id: "file.quickOpen",
    combo: "Ctrl+P",
    label: "Quick Open File",
    category: "File",
    scope: "global",
    run: () => openPalette("file"),
  },
  {
    id: "file.save",
    combo: "Ctrl+S",
    label: "Save",
    category: "File",
    scope: "global",
    run: saveActiveFile,
  },
  {
    id: "file.closeTab",
    combo: "Ctrl+W",
    label: "Close Tab",
    category: "File",
    scope: "global",
    // closeActiveTab is async (flushes autosave first); fire-and-forget so the
    // keybinding `run` signature stays sync.
    run: () => {
      void closeActiveTab();
    },
  },
  {
    id: "file.reopenClosedTab",
    combo: "Ctrl+Shift+T",
    label: "Reopen Closed Tab",
    category: "File",
    scope: "global",
    // reopenClosedTab is async (may read from disk if the file isn't already
    // cached in fileContents); fire-and-forget keeps the `run` signature sync.
    run: () => {
      void reopenClosedTab();
    },
  },

  /* -------------------------------------------------------- Sketch --- */
  {
    id: "sketch.compile",
    combo: "Ctrl+R",
    label: "Verify / Compile",
    category: "Sketch",
    scope: "global",
    run: compileSketch,
  },
  {
    id: "sketch.upload",
    combo: "Ctrl+U",
    label: "Upload",
    category: "Sketch",
    scope: "global",
    run: uploadSketch,
  },

  /* ---------------------------------------------------------- Edit --- */
  {
    id: "edit.undo",
    combo: "Ctrl+Z",
    label: "Undo",
    category: "Edit",
    scope: "editor",
    run: editorUndo,
  },
  {
    id: "edit.redo",
    combo: "Ctrl+Y",
    label: "Redo",
    category: "Edit",
    scope: "editor",
    run: editorRedo,
  },
  {
    id: "edit.find",
    combo: "Ctrl+F",
    label: "Find",
    category: "Edit",
    scope: "global",
    run: editorFind,
  },
  {
    id: "edit.replace",
    combo: "Ctrl+H",
    label: "Replace",
    category: "Edit",
    scope: "global",
    run: editorReplace,
  },
  {
    id: "edit.findInProject",
    combo: "Ctrl+Shift+F",
    label: "Find in Project",
    category: "Edit",
    scope: "global",
    run: findInProject,
  },
  {
    id: "edit.gotoLine",
    combo: "Ctrl+G",
    label: "Go to Line",
    category: "Edit",
    scope: "global",
    run: editorGoToLine,
  },

  /* --------------------------------------------------------- Tools --- */
  {
    id: "tools.autoFormat",
    combo: "Ctrl+T",
    label: "Auto Format",
    category: "Tools",
    scope: "global",
    run: editorAutoFormat,
  },
  {
    id: "tools.serialMonitor",
    combo: "Ctrl+Shift+M",
    label: "Serial Monitor",
    category: "Tools",
    scope: "global",
    run: openSerialMonitor,
  },
  {
    id: "tools.manageLibraries",
    combo: "Ctrl+Shift+I",
    label: "Manage Libraries",
    category: "Tools",
    scope: "global",
    run: openLibraries,
  },

  /* ---------------------------------------------------------- View --- */
  {
    id: "view.commandPalette",
    combo: "Ctrl+Shift+P",
    label: "Command Palette",
    category: "View",
    scope: "global",
    run: () => {
      togglePalette();
    },
  },
  {
    id: "view.commandPalette.k",
    combo: "Ctrl+K",
    label: "Command Palette",
    category: "View",
    scope: "global",
    run: () => {
      togglePalette();
    },
  },
  {
    id: "view.keyboardShortcuts",
    combo: "F1",
    label: "Keyboard Shortcuts",
    category: "View",
    scope: "global",
    run: () => {
      keyboardShortcutsOpen.value = true;
    },
  },
  {
    id: "view.toggleBottomPanel",
    combo: "Ctrl+J",
    label: "Toggle Bottom Panel",
    category: "View",
    scope: "global",
    run: toggleBottomPanel,
  },
  {
    id: "view.nextTab",
    combo: "Ctrl+Tab",
    label: "Next Tab",
    category: "View",
    scope: "global",
    run: nextTab,
  },
  {
    id: "view.splitEditorRight",
    combo: "Ctrl+\\",
    label: "Split Editor Right",
    category: "View",
    scope: "global",
    run: splitEditorRight,
  },
  {
    id: "view.goHome",
    combo: "Ctrl+1",
    label: "Go to Home",
    category: "View",
    scope: "global",
    run: goRail("home"),
  },
  {
    id: "view.goFiles",
    combo: "Ctrl+2",
    label: "Go to Files",
    category: "View",
    scope: "global",
    run: goRail("files"),
  },
  {
    id: "view.goExamples",
    combo: "Ctrl+3",
    label: "Go to Examples",
    category: "View",
    scope: "global",
    run: goRail("examples"),
  },
  {
    id: "view.goSearch",
    combo: "Ctrl+4",
    label: "Go to Search",
    category: "View",
    scope: "global",
    run: goRail("search"),
  },
  {
    id: "view.goLibraries",
    combo: "Ctrl+5",
    label: "Go to Libraries",
    category: "View",
    scope: "global",
    run: goRail("libraries"),
  },
  {
    id: "view.goBoards",
    combo: "Ctrl+6",
    label: "Go to Boards",
    category: "View",
    scope: "global",
    run: goRail("boards"),
  },
  {
    id: "view.settings",
    combo: "Ctrl+,",
    label: "Open Settings",
    category: "View",
    scope: "global",
    run: goRail("settings"),
  },
  {
    id: "view.toggleFullscreen",
    combo: "F11",
    label: "Toggle Fullscreen",
    category: "View",
    scope: "global",
    // toggleFullscreen is async (dynamically imports the Tauri window API);
    // fire-and-forget keeps the run signature sync.
    run: () => {
      void toggleFullscreen();
    },
  },
];

/* ------------------------------------------------------------ lookup --- */

/** Find a keybinding by id — used by the menu bar to label its items. */
export function keybindingById(id: string): Keybinding | undefined {
  return keybindings.find((k) => k.id === id);
}

/** The combo string for a keybinding id, or `undefined` if there is none. */
export function comboFor(id: string): string | undefined {
  return keybindingById(id)?.combo;
}

/* ----------------------------------------------------------- matching --- */

/**
 * Build the canonical combo string for a keyboard event — the same shape the
 * `combo` fields use, so a parsed event can be compared to them directly.
 *
 * Modifiers are emitted in the fixed order Ctrl, Shift, Alt. `metaKey` (the
 * macOS Command key) folds into Ctrl so a single binding list serves both
 * platforms. Letter keys are upper-cased; named keys (Tab, F1, digits) pass
 * through as-is.
 */
export function eventCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  let key = e.key;
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();
  // Named keys (Tab, F1, Escape, …) and digits are already canonical.

  parts.push(key);
  return parts.join("+");
}

/**
 * Resolve a keyboard event to the global keybinding it triggers, if any.
 * Only `scope: "global"` bindings are considered — editor-scoped bindings
 * (undo/redo) are left to Monaco. Returns `undefined` when nothing matches.
 */
export function matchKeyEvent(e: KeyboardEvent): Keybinding | undefined {
  const combo = eventCombo(e);
  return keybindings.find((k) => k.scope === "global" && k.combo === combo);
}
