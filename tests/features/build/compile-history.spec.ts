import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  pushCompileSize,
  MAX_HISTORY_ENTRIES,
} from "@/features/build/compile-history";
import { compileSizeHistory } from "@/features/build/state";

beforeEach(() => {
  compileSizeHistory.value = new Map();
});

describe("pushCompileSize", () => {
  it("appends the first entry for a brand new FQBN", () => {
    pushCompileSize("avr:avr:uno", 25);
    expect(compileSizeHistory.value.get("avr:avr:uno")).toEqual([25]);
  });

  it("appends in chronological (oldest-first) order", () => {
    pushCompileSize("avr:avr:uno", 10);
    pushCompileSize("avr:avr:uno", 20);
    pushCompileSize("avr:avr:uno", 30);
    expect(compileSizeHistory.value.get("avr:avr:uno")).toEqual([10, 20, 30]);
  });

  it("isolates history per FQBN", () => {
    pushCompileSize("avr:avr:uno", 10);
    pushCompileSize("esp32:esp32:esp32s3", 80);
    pushCompileSize("avr:avr:uno", 11);
    expect(compileSizeHistory.value.get("avr:avr:uno")).toEqual([10, 11]);
    expect(compileSizeHistory.value.get("esp32:esp32:esp32s3")).toEqual([80]);
  });

  it("caps at MAX_HISTORY_ENTRIES, dropping the oldest sample first", () => {
    for (let i = 0; i < MAX_HISTORY_ENTRIES + 4; i++) {
      pushCompileSize("avr:avr:uno", i);
    }
    const arr = compileSizeHistory.value.get("avr:avr:uno")!;
    expect(arr.length).toBe(MAX_HISTORY_ENTRIES);
    // The first MAX_HISTORY_ENTRIES samples should now be 4..13 (10 entries).
    expect(arr[0]).toBe(4);
    expect(arr[arr.length - 1]).toBe(MAX_HISTORY_ENTRIES + 3);
  });

  it("clamps an out-of-range percentage to [0, 100]", () => {
    pushCompileSize("avr:avr:uno", -5);
    pushCompileSize("avr:avr:uno", 250);
    expect(compileSizeHistory.value.get("avr:avr:uno")).toEqual([0, 100]);
  });

  it("ignores an empty FQBN", () => {
    pushCompileSize("", 50);
    expect(compileSizeHistory.value.size).toBe(0);
  });

  it("ignores a non-finite percentage", () => {
    pushCompileSize("avr:avr:uno", NaN);
    pushCompileSize("avr:avr:uno", Infinity);
    expect(compileSizeHistory.value.get("avr:avr:uno")).toBeUndefined();
  });

  it("publishes a new Map reference so signal subscribers re-run", () => {
    const before = compileSizeHistory.value;
    pushCompileSize("avr:avr:uno", 50);
    expect(compileSizeHistory.value).not.toBe(before);
  });
});

describe("startCompileHistoryTracking", () => {
  // The compile-history module owns this localStorage key. Hardcoded so a typo
  // in the source key fails this test rather than silently passing.
  const STORAGE_KEY = "forgeboard.compile-history";

  /**
   * Reset the module registry and re-import compile-history + appState
   * together. Mirrors the freshImport pattern in tests/lib/recent-files.spec.ts.
   */
  async function freshImport() {
    vi.resetModules();
    return {
      history: await import("@/features/build/compile-history"),
      state: await import("@/features/build/state"),
    };
  }

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("hydrates the signal from a valid stored object map", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ "avr:avr:uno": [10, 20, 30] }),
    );
    const { history, state } = await freshImport();
    history.startCompileHistoryTracking();
    expect(state.compileSizeHistory.value.get("avr:avr:uno")).toEqual([
      10, 20, 30,
    ]);
  });

  it("falls back to an empty map when stored JSON is malformed", async () => {
    localStorage.setItem(STORAGE_KEY, "not json");
    const { history, state } = await freshImport();
    history.startCompileHistoryTracking();
    expect(state.compileSizeHistory.value.size).toBe(0);
  });

  it("falls back to an empty map when the stored root is not an object", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["not an object"]));
    const { history, state } = await freshImport();
    history.startCompileHistoryTracking();
    expect(state.compileSizeHistory.value.size).toBe(0);
  });

  it("drops non-array values from the persisted object", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "avr:avr:uno": [10, 20],
        "esp32:esp32:esp32s3": "not an array",
      }),
    );
    const { history, state } = await freshImport();
    history.startCompileHistoryTracking();
    expect(state.compileSizeHistory.value.get("avr:avr:uno")).toEqual([10, 20]);
    expect(state.compileSizeHistory.value.has("esp32:esp32:esp32s3")).toBe(false);
  });

  it("filters and clamps numeric entries inside each stored array", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        "avr:avr:uno": [10, "twenty", -5, 250, NaN, 30],
      }),
    );
    const { history, state } = await freshImport();
    history.startCompileHistoryTracking();
    expect(state.compileSizeHistory.value.get("avr:avr:uno")).toEqual([
      10, 0, 100, 30,
    ]);
  });

  it("trims an oversize stored array down to MAX_HISTORY_ENTRIES", async () => {
    const stored = Array.from({ length: 25 }, (_, i) => i);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ "avr:avr:uno": stored }),
    );
    const { history, state } = await freshImport();
    history.startCompileHistoryTracking();
    const arr = state.compileSizeHistory.value.get("avr:avr:uno")!;
    expect(arr.length).toBe(history.MAX_HISTORY_ENTRIES);
    // Trim keeps the newest entries (the tail) — older history is what
    // falls off when a board's array overflows.
    expect(arr[arr.length - 1]).toBe(24);
  });

  it("writes through to localStorage when compileSizeHistory changes", async () => {
    const { history, state } = await freshImport();
    history.startCompileHistoryTracking();
    history.pushCompileSize("avr:avr:uno", 42);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed["avr:avr:uno"]).toEqual([42]);
    expect(state.compileSizeHistory.value.get("avr:avr:uno")).toEqual([42]);
  });
});
