/**
 * File-tree operations for the Files sidebar context menu — create, rename
 * and delete, plus the bookkeeping each one implies: refresh the sketch's
 * file list and reconcile the open editor tabs.
 *
 * Kept separate from the menu component so the (UI-free) reconciliation logic
 * is independently testable, and so the menu, keybindings and any future
 * caller share one implementation.
 */
import { projectApi } from "../ipc/project";
import {
  currentSketch,
  fileContents,
  openTabs,
  activeTabIndex,
} from "../state/appState";
import { errText } from "./actions";
import { closeTab } from "./tabs";

/** Basename of an absolute path, handling both `/` and `\` separators. */
export function baseName(path: string): string {
  const m = path.split(/[\\/]/);
  return m[m.length - 1] || path;
}

/** Directory portion of an absolute path (no trailing separator). */
export function dirName(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx >= 0 ? path.slice(0, idx) : path;
}

/**
 * Re-read the current sketch from disk and replace `currentSketch` so the
 * Files tree reflects on-disk reality after a create/rename/delete.
 *
 * Unlike `loadSketch`, this does *not* touch open tabs or re-read file
 * contents — callers reconcile tabs themselves so unsaved edits in unrelated
 * tabs survive. A no-op when no sketch is open.
 */
export async function refreshSketchTree(): Promise<void> {
  const sketch = currentSketch.value;
  if (!sketch) return;
  const fresh = await projectApi.open(sketch.path);
  currentSketch.value = fresh;
}

/**
 * Reconcile editor state for a renamed/moved file: a tab still pointing at
 * `oldPath` is repointed to `newPath` (and its label updated), and the file's
 * cached contents are re-keyed. Safe to call when the file is not open.
 */
export function reconcileRenamedTab(oldPath: string, newPath: string): void {
  openTabs.value = openTabs.value.map((t) =>
    t.path === oldPath
      ? { ...t, path: newPath, name: baseName(newPath) }
      : t,
  );
  const contents = fileContents.value;
  if (contents.has(oldPath)) {
    const next = new Map(contents);
    next.set(newPath, next.get(oldPath)!);
    next.delete(oldPath);
    fileContents.value = next;
  }
}

/**
 * Reconcile editor state for a deleted file: close its tab if open and drop
 * its cached contents. Safe to call when the file is not open.
 */
export function reconcileDeletedTab(path: string): void {
  const idx = openTabs.value.findIndex((t) => t.path === path);
  if (idx >= 0) closeTab(idx);
  const contents = fileContents.value;
  if (contents.has(path)) {
    const next = new Map(contents);
    next.delete(path);
    fileContents.value = next;
  }
}

/** Outcome of a file operation — `ok` carries an optional resulting path. */
export type FileOpResult =
  | { ok: true; path?: string }
  | { ok: false; error: string };

/**
 * Create an empty file `name` in directory `dir`, refresh the tree, and open
 * the new file in a tab. `dir` is typically the sketch root.
 */
export async function createFileOp(
  dir: string,
  name: string,
): Promise<FileOpResult> {
  try {
    const path = await projectApi.createFile(dir, name);
    await refreshSketchTree();
    // Open the freshly created file: read its (empty) contents and add a tab.
    const text = await projectApi.readFile(path);
    fileContents.value = new Map(fileContents.value).set(path, text);
    const existing = openTabs.value.findIndex((t) => t.path === path);
    if (existing >= 0) {
      activeTabIndex.value = existing;
    } else {
      openTabs.value = [
        ...openTabs.value,
        { path, name: baseName(path), modified: false },
      ];
      activeTabIndex.value = openTabs.value.length - 1;
    }
    return { ok: true, path };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/** Create a folder `name` in directory `dir` and refresh the tree. */
export async function createFolderOp(
  dir: string,
  name: string,
): Promise<FileOpResult> {
  try {
    const path = await projectApi.createFolder(dir, name);
    await refreshSketchTree();
    return { ok: true, path };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/**
 * Rename `path` to `newName` within its directory, refresh the tree, and
 * repoint any open tab at the file.
 */
export async function renameFileOp(
  path: string,
  newName: string,
): Promise<FileOpResult> {
  try {
    const newPath = await projectApi.renamePath(path, newName);
    reconcileRenamedTab(path, newPath);
    await refreshSketchTree();
    return { ok: true, path: newPath };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/**
 * Delete `path` (to the OS recycle bin), close its tab if open, and refresh
 * the tree.
 */
export async function deleteFileOp(path: string): Promise<FileOpResult> {
  try {
    await projectApi.deletePath(path);
    reconcileDeletedTab(path);
    await refreshSketchTree();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}
