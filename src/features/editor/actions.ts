/**
 * Editor actions: save the active file, jump to a file/line, split the editor.
 */
import { flushSave } from "./autosave";
import {
  splitEditorRight as splitEditorRightImpl,
  focusOpenFile,
  addTabToActiveGroup,
} from "./editor-groups";
import { getActiveEditor } from "./components/MonacoEditor";
import { currentSketch } from "@/features/project/state";
import { fileContents } from "./state";

/** Flush any pending edits to disk immediately (the Ctrl+S path). */
export function saveActiveFile() {
  flushSave();
}

/**
 * Open a sketch file in the editor and, optionally, jump the cursor to a line
 * (and column).
 *
 * Reuses the Files view's open mechanism — finding the file's tab by absolute
 * path and switching `activeTabIndex` to it. If the file belongs to the open
 * sketch but has no tab yet (an edge case — `loadSketch` opens every file as a
 * tab), a tab is created so the click still works. After the tab is active,
 * the Monaco model swap is async, so the line jump is deferred a tick.
 *
 * Used by the Find in Project results list and the Problems panel. Both
 * `line` and `column` are 1-based; `column` defaults to 1 so callers that
 * only know the line still land at the start of it.
 */
export function openFileAtLine(
  path: string,
  line?: number,
  column?: number,
): void {
  // First check every group — if any pane already has the file open, just
  // jump focus to it instead of duplicating the tab in the active group.
  // Without this scan, a Find-in-Project click on a result for a file open
  // in the OTHER pane would produce a second copy in the active pane.
  if (!focusOpenFile(path)) {
    // Not open anywhere yet — create a tab in the active group if the file
    // is part of the open sketch and its contents are already in memory.
    const file = currentSketch.value?.files.find((f) => f.path === path);
    if (!file) return;
    if (!fileContents.value.has(path)) return; // contents not loaded — bail
    addTabToActiveGroup({ path: file.path, name: file.name, modified: false });
  }

  if (line === undefined) return;

  // The editor swaps its model in a useEffect after the tab change commits,
  // so reveal/select on the next macrotask once that content is in place.
  setTimeout(() => {
    const editor = getActiveEditor();
    if (!editor) return;
    const model = editor.getModel();
    const clampedLine = model
      ? Math.min(Math.max(line, 1), model.getLineCount())
      : Math.max(line, 1);
    const col = column ?? 1;
    const lineMaxCol = model ? model.getLineMaxColumn(clampedLine) : col;
    const clampedCol = Math.min(Math.max(col, 1), lineMaxCol);
    const sel = {
      startLineNumber: clampedLine,
      startColumn: clampedCol,
      endLineNumber: clampedLine,
      endColumn: clampedCol,
    };
    editor.revealLineInCenter(clampedLine);
    editor.setSelection(sel);
    editor.setPosition({ lineNumber: clampedLine, column: clampedCol });
    editor.focus();
  }, 0);
}

/**
 * Split the editor right — clone the active group's tabs + active file into
 * a new pane next to it. No-op when a split already exists, or when nothing
 * is open to clone.
 */
export function splitEditorRight() {
  splitEditorRightImpl();
}
