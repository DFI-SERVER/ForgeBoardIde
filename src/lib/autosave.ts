import { effect } from "@preact/signals";
import * as monaco from "monaco-editor";
import {
  saveState,
  fileContents,
  openTabs,
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

/**
 * Cancel any pending debounce, save immediately, and resolve when the save
 * completes (or returns straight away if nothing was unsaved). Use this
 * before destructive state operations (sketch swap, app close) so the
 * user's last edits land on disk before the in-memory cache is wiped.
 */
export async function flushSaveAsync(): Promise<void> {
  if (pendingSave) {
    clearTimeout(pendingSave);
    pendingSave = null;
  }
  if (saveState.value === "unsaved") {
    await saveAllModified();
  }
}

/** Cancel the pending debounce and save immediately (used by Ctrl+S).
 *  Fire-and-forget: callers that need to wait for the save to finish (e.g.
 *  before swapping the open sketch) must use `flushSaveAsync` instead. */
export function flushSave(): void {
  flushSaveAsync().catch((e) => console.error("save failed:", e));
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
 * Translate an absolute on-disk `path` to the `file://` URI Monaco uses for
 * its model and look the model up. Mirrors `getOrCreateModel`'s URI scheme in
 * `MonacoEditor.tsx` — forward slashes, lowercased Windows drive letter,
 * leading slash — so a model created by the editor is found by this lookup.
 *
 * Returns null if no editor has ever opened this path yet (so no Monaco model
 * exists for it). Exported so the same-shape lookup can be unit-tested.
 */
export function findModelForPath(path: string): monaco.editor.ITextModel | null {
  const normalized = path
    .replace(/\\/g, "/")
    .replace(/^([a-zA-Z]):/, (_, d: string) => `/${d.toLowerCase()}:`)
    .replace(/^\/?/, "/");
  const uri = monaco.Uri.parse(`file://${normalized}`);
  return monaco.editor.getModel(uri);
}

/**
 * Apply on-save transforms to every modified file in place — fileContents
 * gets the rewritten text; the live Monaco model for that path (shared across
 * any group displaying it) gets `model.applyEdits`, so a file modified in the
 * inactive pane still has its model buffer rewritten. Cursor preservation on
 * the active editor is best-effort: when the active editor is showing this
 * model, its selections + undo stops are pushed too. No-op when both settings
 * are off.
 */
function applySaveTransforms(): void {
  const s = settings.value;
  if (!s.formatOnSave && !s.trimTrailingWhitespaceOnSave) return;

  const paths = modifiedPaths();
  if (paths.length === 0) return;

  // Active editor (if any) — only used to preserve cursor selections + push
  // an undo stop when the user happens to be focused on a transformed model.
  // The rewrite itself goes through model.applyEdits so panes that don't
  // host the active editor still see the transform.
  const editor = getActiveEditor();
  let nextContents: Map<string, string> | null = null;

  for (const path of paths) {
    const original = fileContents.value.get(path);
    if (original == null) continue;
    const transformed = transformContentForSave(original, path);
    if (transformed === original) continue;

    if (!nextContents) nextContents = new Map(fileContents.value);
    nextContents.set(path, transformed);

    const model = findModelForPath(path);
    // No model yet (a file open in a tab but never mounted in an editor)
    // — just rewrite fileContents and continue. The next mount will seed
    // the model from the rewritten content.
    if (!model) continue;
    if (model.getValue() === transformed) continue;

    // Capture cursor + push undo only when the active editor is displaying
    // this model — undo state is editor-local, but the model edit itself
    // propagates to every editor showing the model.
    const isActiveModel = editor !== null && editor.getModel() === model;
    const selections = isActiveModel ? editor!.getSelections() ?? [] : null;
    if (isActiveModel) editor!.pushUndoStop();
    withProgrammaticEdit(() => {
      model.applyEdits([
        { range: model.getFullModelRange(), text: transformed },
      ]);
    });
    if (isActiveModel) {
      editor!.pushUndoStop();
      if (selections && selections.length > 0) {
        editor!.setSelections(selections);
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
