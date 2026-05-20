import { effect } from "@preact/signals";
import { saveState, fileContents, openTabs } from "../state/appState";

const AUTOSAVE_MS = 2000;
let pendingSave: number | null = null;

export function startAutoSaveLoop() {
  effect(() => {
    // Access signals to subscribe
    fileContents.value;
    openTabs.value;
    if (saveState.value !== "unsaved") return;
    if (pendingSave) clearTimeout(pendingSave);
    pendingSave = window.setTimeout(saveNow, AUTOSAVE_MS);
  });
}

/** Cancel the pending debounce and save immediately (used by Ctrl+S). */
export function flushSave() {
  if (pendingSave) {
    clearTimeout(pendingSave);
    pendingSave = null;
  }
  if (saveState.value === "unsaved") saveNow();
}

async function saveNow() {
  saveState.value = "saving";
  // Phase 2: save is a no-op (in-memory only). Phase 3 wires to disk.
  await new Promise((r) => setTimeout(r, 100));
  const newTabs = openTabs.value.map((t) => ({ ...t, modified: false }));
  openTabs.value = newTabs;
  saveState.value = "saved";
  pendingSave = null;
}
