/**
 * Recent-files tracking — persists the global recent file paths list across
 * app restarts and pushes the active tab's path to the front whenever it
 * changes. Wired from main.tsx alongside the other lifecycle bootstraps.
 */
import { effect, untracked } from "@preact/signals";
import {
  recentFilePaths,
  pushRecentFilePath,
  openTabs,
  activeTabIndex,
  MAX_RECENT_FILE_PATHS,
} from "../state/appState";

const STORAGE_KEY = "forgeboard.recent-files";

/** Read the persisted list, defensively. Bad data falls back to []. */
function loadPersisted(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => typeof p === "string" && p.length > 0)
      .slice(0, MAX_RECENT_FILE_PATHS);
  } catch {
    return [];
  }
}

/** Hydrate the signal from localStorage and start the tracking effect. */
export function startRecentFilesTracking(): void {
  const persisted = loadPersisted();
  if (persisted.length > 0) recentFilePaths.value = persisted;

  effect(() => {
    const tabs = openTabs.value;
    const i = activeTabIndex.value;
    const active = tabs[i];
    // pushRecentFilePath reads recentFilePaths.value to dedup-and-prepend;
    // wrapping the call in untracked() keeps this effect from re-subscribing
    // to its own write target, which would otherwise be a cycle.
    if (active) untracked(() => pushRecentFilePath(active.path));
  });

  // Write-through to localStorage on every change.
  effect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recentFilePaths.value));
    } catch {
      // Quota / unavailable — recents simply won't survive a restart.
    }
  });
}
