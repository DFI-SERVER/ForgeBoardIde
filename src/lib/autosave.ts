import { effect } from "@preact/signals";
import { saveState, fileContents, openTabs, activeTabIndex } from "../state/appState";
import { projectApi } from "../ipc/project";
import { settings } from "./settings";
import { formatArduino } from "./format";
import { getActiveEditor, withProgrammaticEdit } from "../components/MonacoEditor";

const AUTOSAVE_MS = 2000;
let pendingSave: number | null = null;

/** Extensions whose contents the C-brace re-indenter is safe to apply to.
 *  Anything else (README.md, library.properties, keywords.txt, JSON, YAML…)
 *  will silently get mangled by the formatter, so format-on-save is skipped
 *  for those tabs. The trim-trailing-whitespace transform is fine for any
 *  text file and still applies. */
const C_LIKE_EXT = /\.(ino|pde|cpp|cxx|cc|c|h|hpp|hxx)$/i;

export function isFormattableSketchFile(path: string): boolean {
  return C_LIKE_EXT.test(path);
}

/** Fire-and-forget wrapper that surfaces async failures to the console so a
 *  bare `setTimeout(saveAllModified)` or `flushSave()` doesn't leak an
 *  unhandled-promise-rejection event the user never sees. */
function runSave(): void {
  saveAllModified().catch((e) => console.error("autosave failed:", e));
}

export function startAutoSaveLoop() {
  effect(() => {
    // Access signals to subscribe
    fileContents.value;
    openTabs.value;
    if (saveState.value !== "unsaved") return;
    if (pendingSave) clearTimeout(pendingSave);
    pendingSave = window.setTimeout(runSave, AUTOSAVE_MS);
  });
}

/** Cancel the pending debounce and save immediately (used by Ctrl+S). */
export function flushSave() {
  if (pendingSave) {
    clearTimeout(pendingSave);
    pendingSave = null;
  }
  if (saveState.value === "unsaved") runSave();
}

/**
 * Strip trailing spaces and tabs from every line, but leave the line count
 * alone — blank lines stay, the final newline (or lack thereof) survives.
 */
export function trimTrailingWhitespace(content: string): string {
  return content.replace(/[ \t]+(?=\r?\n|$)/g, "");
}

/**
 * Apply the user's on-save transforms (format, then trim) to `content`.
 * Returns the input unchanged when no transform is enabled — callers can
 * cheaply check identity to decide whether to update editor state.
 *
 * `path` controls whether the C-brace formatter is allowed: omitted or a
 * C-like extension → format applies; any other extension → only trim runs.
 * Format-on-save also trims (formatArduino does it as part of re-indenting),
 * so the trim setting is only consulted when format is skipped.
 */
export function transformContentForSave(content: string, path?: string): string {
  const s = settings.value;
  const canFormat = path === undefined || isFormattableSketchFile(path);
  if (s.formatOnSave && canFormat) return formatArduino(content, " ".repeat(s.tabSize));
  if (s.trimTrailingWhitespaceOnSave) return trimTrailingWhitespace(content);
  return content;
}

/**
 * Apply on-save transforms to every modified tab in place — fileContents for
 * inactive tabs, the live Monaco model for the active tab (so the user sees
 * the rewrite and Ctrl+Z still unwinds it). No-op when both settings are off.
 */
function applySaveTransforms(): void {
  const s = settings.value;
  if (!s.formatOnSave && !s.trimTrailingWhitespaceOnSave) return;

  const tabs = openTabs.value;
  const activeTab = tabs[activeTabIndex.value];
  const editor = getActiveEditor();
  let nextContents: Map<string, string> | null = null;

  for (const t of tabs) {
    if (!t.modified) continue;
    const original = fileContents.value.get(t.path);
    if (original == null) continue;
    const transformed = transformContentForSave(original, t.path);
    if (transformed === original) continue;

    if (!nextContents) nextContents = new Map(fileContents.value);
    nextContents.set(t.path, transformed);

    // The active tab's Monaco model is the user-visible source of truth —
    // rewrite via executeEdits so the change joins the same undo stack as
    // the user's own edits. The leading pushUndoStop separates the rewrite
    // from the user's last keystroke so Ctrl+Z unwinds them in two steps,
    // not one. Passing the current selections as endCursorState pins the
    // caret to (roughly) where the user was, rather than Monaco's default
    // of dropping it at the end of the inserted text.
    if (t === activeTab && editor) {
      const ed = editor;
      const model = ed.getModel();
      if (model) {
        const selections = ed.getSelections() ?? [];
        ed.pushUndoStop();
        withProgrammaticEdit(() => {
          ed.executeEdits(
            "on-save-transform",
            [{ range: model.getFullModelRange(), text: transformed }],
            selections,
          );
        });
        ed.pushUndoStop();
      }
    }
  }

  if (nextContents) fileContents.value = nextContents;
}

async function saveAllModified() {
  // Flip into "saving" BEFORE running on-save transforms — applySaveTransforms
  // writes fileContents.value, which is subscribed in startAutoSaveLoop's
  // effect. Without this ordering, that write fires the effect while
  // saveState is still "unsaved", arming a phantom 2-second-delayed timer
  // that re-enters saveAllModified for zero work and a UI flicker.
  saveState.value = "saving";
  // A throw from formatArduino or Monaco's executeEdits used to escape and
  // leave saveState pinned at "saving" forever, permanently disabling both
  // the autosave effect and Ctrl+S. Best-effort: log and proceed with the
  // un-transformed content rather than bricking the save subsystem.
  try {
    applySaveTransforms();
  } catch (e) {
    console.error("on-save transforms failed; saving original content:", e);
  }
  const tabs = openTabs.value;
  for (const t of tabs) {
    if (!t.modified) continue;
    const contents = fileContents.value.get(t.path);
    if (contents == null) continue;
    try {
      await projectApi.saveFile(t.path, contents);
    } catch (e) {
      console.error("save failed for", t.path, e);
      saveState.value = "unsaved";
      return;
    }
  }
  openTabs.value = tabs.map((t) => ({ ...t, modified: false }));
  saveState.value = "saved";
  pendingSave = null;
}
