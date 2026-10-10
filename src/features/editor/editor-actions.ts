/**
 * Edit-menu wiring — drives the mounted Monaco editor instance. Each function
 * is a no-op when no editor is mounted, so the menu items stay safe to click.
 */
import { getActiveEditor } from "./components/MonacoEditor";
import { formatArduino } from "./format";
import { settings } from "@/features/settings/settings";
import { isFormattableSketchFile } from "./autosave";
import { openTabs, activeTabIndex } from "./state";
import { toast } from "@/app/state";

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

/** Open Monaco's "Go to Line" widget on the active editor. No-op when none
 *  is mounted (the keybinding is harmless when the welcome screen is up). */
export function editorGoToLine() {
  const editor = getActiveEditor();
  editor?.focus();
  editor?.getAction("editor.action.gotoLine")?.run();
}

export function editorReplace() {
  const editor = getActiveEditor();
  editor?.focus();
  editor?.getAction("editor.action.startFindReplaceAction")?.run();
}

/**
 * Auto Format — re-indent the active file to its brace depth. Applied as a
 * single, undoable edit so Ctrl+Z restores the previous layout in one step.
 *
 * Refuses to run on non-C-family files — the formatter is a brace-aware
 * re-indenter and would happily mangle JSON, YAML, Markdown, etc. A toast
 * tells the user why the keystroke did nothing.
 */
export function editorAutoFormat() {
  const active = openTabs.value[activeTabIndex.value];
  if (!active || !isFormattableSketchFile(active.path)) {
    toast.value = {
      text: "Auto Format only runs on C/C++ files.",
      kind: "info",
    };
    return;
  }
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
