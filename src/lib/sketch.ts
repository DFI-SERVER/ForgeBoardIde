import type { Sketch } from "../ipc/project";
import { projectApi } from "../ipc/project";
import { batch } from "@preact/signals";
import * as monaco from "monaco-editor";
import { flushSaveAsync } from "./autosave";
import {
  currentSketch,
  fileContents,
  editorGroups,
  activeGroupIndex,
  openTabs,
  activeTabIndex,
  sketchProfiles,
  activeProfile,
  type Tab,
} from "../state/appState";

/**
 * Load a sketch into the editor: set the current sketch, read every file's
 * contents, and open the files as tabs in the FIRST group. Shared by
 * bootstrap, New Sketch and Open Sketch so all three behave identically.
 *
 * Sketch loading collapses any active split back to a single group — the
 * second pane is dropped and the first pane is refilled with the new
 * sketch's files. This matches user expectations: opening a brand-new
 * sketch should not leave the split with stale tabs from the previous one.
 *
 * Also refreshes the `sketch.yaml` profile state — every entry point that
 * swaps the open sketch goes through this function, so a single call here
 * keeps the profile pill in sync without each caller remembering to do it.
 * The profile load is best-effort: a parse error simply clears the pill
 * rather than blocking the sketch from opening.
 */
export async function loadSketch(sketch: Sketch): Promise<void> {
  // Block until any in-flight or debounced save reaches disk — otherwise the
  // batch below wipes fileContents and editorGroups, destroying the only
  // copy of the user's unsaved edits. flushSaveAsync is a no-op when
  // saveState is already "saved", so the cost on the common path is nil.
  await flushSaveAsync();

  currentSketch.value = sketch;
  const contents = new Map<string, string>();
  for (const f of sketch.files) {
    contents.set(f.path, await projectApi.readFile(f.path));
  }
  const newTabs: Tab[] = sketch.files.map((f) => ({
    path: f.path,
    name: f.name,
    modified: false,
  }));
  // Dispose every Monaco model so getOrCreateModel rebuilds them lazily from
  // the freshly-loaded fileContents instead of resurrecting a leaked model
  // whose buffer holds stale text from the previous session. The editor
  // components are still mounted; their next setModel call will recreate
  // each model from the new seed contents.
  for (const m of monaco.editor.getModels()) {
    m.dispose();
  }
  // Reset to a single group with the new tabs. Drop the second pane (if
  // any) so the user starts fresh on the loaded sketch. The mirror effects
  // will pick the new active group up; do everything inside a batch so
  // the editor only re-renders once.
  batch(() => {
    fileContents.value = contents;
    editorGroups.value = [
      { id: "g0", tabs: newTabs, activeTabIndex: 0 },
    ];
    activeGroupIndex.value = 0;
    openTabs.value = newTabs;
    activeTabIndex.value = 0;
  });
  await refreshProfiles(sketch.path);
}

/**
 * Reload `sketch.yaml` profiles for a sketch path and populate the related
 * signals. Pure side effects on `sketchProfiles` + `activeProfile`.
 *
 * - No `sketch.yaml`, parse error, or empty profile list → both signals reset.
 * - Profiles present → `sketchProfiles` filled; `activeProfile` set to the
 *   declared `default_profile` if it names a known profile, otherwise null.
 */
async function refreshProfiles(sketchPath: string): Promise<void> {
  try {
    const yaml = await projectApi.readProfiles(sketchPath);
    if (!yaml || yaml.profiles.length === 0) {
      sketchProfiles.value = [];
      activeProfile.value = null;
      return;
    }
    sketchProfiles.value = yaml.profiles;
    // Honour `default_profile`, but only when it actually exists in the list
    // — otherwise leave the user on the global board selector.
    const def = yaml.default_profile;
    const exists = def && yaml.profiles.some((p) => p.name === def);
    activeProfile.value = exists ? def! : null;
  } catch {
    sketchProfiles.value = [];
    activeProfile.value = null;
  }
}
