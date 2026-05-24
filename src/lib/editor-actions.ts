/**
 * Edit-menu wiring — drives the mounted Monaco editor instance. Each function
 * is a no-op when no editor is mounted, so the menu items stay safe to click.
 */
import { getActiveEditor } from "../components/MonacoEditor";
import { formatArduino } from "./format";
import { settings } from "./settings";

export function editorUndo() {
  getActiveEditor()?.trigger("menu", "undo", null);
}

export function editorRedo() {
  getActiveEditor()?.trigger("menu", "redo", null);
}

export function editorCut() {
  const editor = getActiveEditor();
  editor?.focus();
  editor?.trigger("menu", "editor.action.clipboardCutAction", null);
}

export function editorCopy() {
  const editor = getActiveEditor();
  editor?.focus();
  editor?.trigger("menu", "editor.action.clipboardCopyAction", null);
}

export function editorPaste() {
  const editor = getActiveEditor();
  editor?.focus();
  editor?.trigger("menu", "editor.action.clipboardPasteAction", null);
}

export function editorFind() {
  const editor = getActiveEditor();
  editor?.focus();
  editor?.getAction("actions.find")?.run();
}

export function editorReplace() {
  const editor = getActiveEditor();
  editor?.focus();
  editor?.getAction("editor.action.startFindReplaceAction")?.run();
}

/**
 * Auto Format — re-indent the active file to its brace depth. Applied as a
 * single, undoable edit so Ctrl+Z restores the previous layout in one step.
 */
export function editorAutoFormat() {
  const editor = getActiveEditor();
  if (!editor) return;
  const model = editor.getModel();
  if (!model) return;
  const original = model.getValue();
  const formatted = formatArduino(original, " ".repeat(settings.value.tabSize));
  if (formatted === original) return;
  editor.executeEdits("auto-format", [
    { range: model.getFullModelRange(), text: formatted },
  ]);
  editor.pushUndoStop();
}
