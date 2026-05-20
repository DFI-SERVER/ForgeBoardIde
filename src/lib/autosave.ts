import { effect } from "@preact/signals";
import { saveState, fileContents, openTabs } from "../state/appState";
import { projectApi } from "../ipc/project";

const AUTOSAVE_MS = 2000;
let pendingSave: number | null = null;

export function startAutoSaveLoop() {
  effect(() => {
    // Access signals to subscribe
    fileContents.value;
    openTabs.value;
    if (saveState.value !== "unsaved") return;
    if (pendingSave) clearTimeout(pendingSave);
    pendingSave = window.setTimeout(saveAllModified, AUTOSAVE_MS);
  });
}

/** Cancel the pending debounce and save immediately (used by Ctrl+S). */
export function flushSave() {
  if (pendingSave) {
    clearTimeout(pendingSave);
    pendingSave = null;
  }
  if (saveState.value === "unsaved") saveAllModified();
}

async function saveAllModified() {
  saveState.value = "saving";
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
