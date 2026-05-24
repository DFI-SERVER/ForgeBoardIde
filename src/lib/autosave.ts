import { effect } from "@preact/signals";
import {
  saveState,
  fileContents,
  openTabs,
  activeTabIndex,
  editorGroups,
  activeGroupIndex,
} from "../state/appState";
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
 * Walk every group's tabs and yield the set of distinct modified paths.
 * A file open in two panes counts once. Used by save-side code so a split
 * editor never double-saves or skips a tab.
 */
function modifiedPaths(): string[] {
  const seen = new Set<string>();
  for (const group of editorGroups.value) {
    for (const t of group.tabs) {
      if (t.modified) seen.add(t.path);
    }
  }
  return [...seen];
}

/**
 * Apply on-save transforms to every modified file in place — fileContents
 * gets the rewritten text; the live Monaco model for the (single) active
 * editor gets `executeEdits` so the user sees the rewrite and Ctrl+Z still
 * unwinds it. No-op when both settings are off.
 */
function applySaveTransforms(): void {
  const s = settings.value;
  if (!s.formatOnSave && !s.trimTrailingWhitespaceOnSave) return;

  const paths = modifiedPaths();
  if (paths.length === 0) return;

  // The active editor instance — only one tab is in focus across all groups
  // at any moment. We rewrite the live model via executeEdits so undo works.
  const activeTab = openTabs.value[activeTabIndex.value];
  const editor = getActiveEditor();
  let nextContents: Map<string, string> | null = null;

  for (const path of paths) {
    const original = fileContents.value.get(path);
    if (original == null) continue;
    const transformed = transformContentForSave(original, path);
    if (transformed === original) continue;

    if (!nextContents) nextContents = new Map(fileContents.value);
    nextContents.set(path, transformed);

    if (activeTab && activeTab.path === path && editor) {
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

/** Clear the `modified` flag on every tab matching `path` in every group. */
function clearModifiedForPath(path: string): void {
  const groups = editorGroups.value;
  let changed = false;
  const nextGroups = groups.map((g) => {
    const newTabs = g.tabs.map((t) =>
      t.path === path && t.modified ? { ...t, modified: false } : t,
    );
    if (newTabs === g.tabs) return g;
    // Reference equality check on the map fails because we always return a
    // new array; compare each tab to decide whether anything actually flipped.
    const flipped = newTabs.some((t, i) => t !== g.tabs[i]);
    if (!flipped) return g;
    changed = true;
    return { ...g, tabs: newTabs };
  });
  if (!changed) return;
  // Mirror the new tab list of the active group through the alias signals
  // explicitly so subscribers that only watch `openTabs` notice the change
  // without waiting for the bookkeeping effect to fire. (The effect would
  // also catch it, but doing it here keeps the save flow synchronous.)
  const activeIdx = activeGroupIndex.value;
  const activeGroup = nextGroups[activeIdx];
  editorGroups.value = nextGroups;
  if (activeGroup && openTabs.value !== activeGroup.tabs) {
    openTabs.value = activeGroup.tabs;
  }
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
  const paths = modifiedPaths();
  for (const path of paths) {
    const contents = fileContents.value.get(path);
    if (contents == null) continue;
    try {
      await projectApi.saveFile(path, contents);
    } catch (e) {
      console.error("save failed for", path, e);
      saveState.value = "unsaved";
      return;
    }
    // Drop the modified flag on every tab that points at this path (across
    // both groups) so a successful save reconciles split panes too.
    clearModifiedForPath(path);
  }
  // Belt-and-braces: clear any remaining stragglers that had no contents.
  const remaining = modifiedPaths();
  for (const p of remaining) clearModifiedForPath(p);
  saveState.value = "saved";
  pendingSave = null;
}
