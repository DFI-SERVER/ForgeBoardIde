import type { Sketch } from "../ipc/project";
import { projectApi } from "../ipc/project";
import {
  currentSketch,
  fileContents,
  openTabs,
  activeTabIndex,
} from "../state/appState";

/**
 * Load a sketch into the editor: set the current sketch, read every file's
 * contents, and open the files as tabs. Shared by bootstrap, New Sketch and
 * Open Sketch so all three behave identically.
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
}
