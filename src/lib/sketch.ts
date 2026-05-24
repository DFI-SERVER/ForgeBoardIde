import type { Sketch } from "../ipc/project";
import { projectApi } from "../ipc/project";
import {
  currentSketch,
  fileContents,
  openTabs,
  activeTabIndex,
  sketchProfiles,
  activeProfile,
} from "../state/appState";

/**
 * Load a sketch into the editor: set the current sketch, read every file's
 * contents, and open the files as tabs. Shared by bootstrap, New Sketch and
 * Open Sketch so all three behave identically.
 *
 * Also refreshes the `sketch.yaml` profile state — every entry point that
 * swaps the open sketch goes through this function, so a single call here
 * keeps the profile pill in sync without each caller remembering to do it.
 * The profile load is best-effort: a parse error simply clears the pill
 * rather than blocking the sketch from opening.
 */
export async function loadSketch(sketch: Sketch): Promise<void> {
  currentSketch.value = sketch;
  const contents = new Map<string, string>();
  for (const f of sketch.files) {
    contents.set(f.path, await projectApi.readFile(f.path));
  }
  fileContents.value = contents;
  openTabs.value = sketch.files.map((f) => ({
    path: f.path,
    name: f.name,
    modified: false,
  }));
  activeTabIndex.value = 0;
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
