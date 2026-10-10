import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  pushRecentFilePath,
  recentFilePaths,
  MAX_RECENT_FILE_PATHS,
} from "@/features/editor/state";

beforeEach(() => {
  recentFilePaths.value = [];
});

describe("pushRecentFilePath", () => {
  it("pushes a new path to the front", () => {
    pushRecentFilePath("/s/a.ino");
    pushRecentFilePath("/s/b.h");
    expect(recentFilePaths.value).toEqual(["/s/b.h", "/s/a.ino"]);
  });

  it("dedups — pushing an existing path moves it to the front without growing", () => {
    pushRecentFilePath("/s/a.ino");
    pushRecentFilePath("/s/b.h");
    pushRecentFilePath("/s/a.ino");
    expect(recentFilePaths.value).toEqual(["/s/a.ino", "/s/b.h"]);
  });

  it("trims to the documented cap", () => {
    for (let i = 0; i < MAX_RECENT_FILE_PATHS + 4; i++) {
      pushRecentFilePath(`/s/f${i}.ino`);
    }
    expect(recentFilePaths.value.length).toBe(MAX_RECENT_FILE_PATHS);
    expect(recentFilePaths.value[0]).toBe(`/s/f${MAX_RECENT_FILE_PATHS + 3}.ino`);
  });

  it("ignores an empty path", () => {
    pushRecentFilePath("");
    expect(recentFilePaths.value).toEqual([]);
  });
});

describe("loadPersisted + startRecentFilesTracking", () => {
  // The recent-files module owns this localStorage key. Hardcoded in the test
  // so a typo in the source key fails the test rather than passing silently.
  const STORAGE_KEY = "forgeboard.recent-files";

  /**
   * Reset the module registry and re-import recent-files + appState together,
   * so the tracking module reads from the same fresh appState signals it
   * mutates. Mirrors the pattern in tests/lib/settings.spec.ts.
   */
  async function freshImport() {
    vi.resetModules();
    return {
      recent: await import("@/features/editor/recent-files"),
      state: await import("@/features/editor/state"),
    };
  }

  beforeEach(() => {
    // Module-level beforeEach only resets the in-process signal value; the
    // tests in this block also need a clean storage slot before each run.
    localStorage.removeItem(STORAGE_KEY);
  });

  it("hydrates the signal from a valid stored array", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["a", "b", "c"]));
    const { recent, state } = await freshImport();
    recent.startRecentFilesTracking();
    expect(state.recentFilePaths.value).toEqual(["a", "b", "c"]);
  });

  it("falls back to [] when the stored JSON is malformed", async () => {
    localStorage.setItem(STORAGE_KEY, "{not valid");
    const { recent, state } = await freshImport();
    recent.startRecentFilesTracking();
    expect(state.recentFilePaths.value).toEqual([]);
  });

  it("falls back to [] when the stored root is not an array", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify("a string"));
    const { recent, state } = await freshImport();
    recent.startRecentFilesTracking();
    expect(state.recentFilePaths.value).toEqual([]);
  });

  it("filters out non-string and empty-string entries", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([null, "", "good", 42, "good2"]),
    );
    const { recent, state } = await freshImport();
    recent.startRecentFilesTracking();
    expect(state.recentFilePaths.value).toEqual(["good", "good2"]);
  });

  it("trims an oversize stored array to MAX_RECENT_FILE_PATHS", async () => {
    const stored = Array.from({ length: 20 }, (_, i) => `/s/f${i}.ino`);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const { recent, state } = await freshImport();
    recent.startRecentFilesTracking();
    expect(state.recentFilePaths.value.length).toBe(
      state.MAX_RECENT_FILE_PATHS,
    );
    expect(state.recentFilePaths.value.length).toBe(16);
    // The trim must keep the head of the array (newest first), not the tail.
    expect(state.recentFilePaths.value[0]).toBe("/s/f0.ino");
  });

  it("effect pushes the active tab's path when openTabs / activeTabIndex change", async () => {
    const { recent, state } = await freshImport();

    // Boot order matches main.tsx: tracking is wired up while openTabs is
    // still empty. The first effect run sees `tabs[i] === undefined` and
    // bails out without touching recents, so initial subscribe is safe.
    recent.startRecentFilesTracking();
    expect(state.recentFilePaths.value).toEqual([]);

    // After boot, the user opens two tabs. The push effect runs once and
    // calls pushRecentFilePath inside untracked(), so it does not re-subscribe
    // to its own write to recentFilePaths.
    state.openTabs.value = [
      { path: "/s/a.ino", name: "a.ino", modified: false },
      { path: "/s/b.h", name: "b.h", modified: false },
    ];
    expect(state.recentFilePaths.value[0]).toBe("/s/a.ino");

    // Switching the active tab pushes the newly active path to the front.
    state.activeTabIndex.value = 1;
    expect(state.recentFilePaths.value[0]).toBe("/s/b.h");
    expect(state.recentFilePaths.value).toEqual(["/s/b.h", "/s/a.ino"]);
  });

  it("writes through to localStorage when recentFilePaths changes", async () => {
    const { recent, state } = await freshImport();
    recent.startRecentFilesTracking();

    // pushRecentFilePath replaces the signal value, triggering the write-
    // through effect synchronously.
    state.pushRecentFilePath("/s/written.ino");

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored).toContain("/s/written.ino");
    expect(stored).toEqual(state.recentFilePaths.value);
  });
});
