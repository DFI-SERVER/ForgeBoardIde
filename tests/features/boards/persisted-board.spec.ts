import { describe, it, expect, beforeEach, vi } from "vitest";

const FQBN_KEY = "forgeboard.selected-fqbn";
const BAUD_KEY = "forgeboard.serial-baud";
const LINE_ENDING_KEY = "forgeboard.serial-line-ending";

/**
 * Reset the module registry and re-import persisted-board + appState
 * together. The persistence module reads from localStorage at import time
 * (well, at startPersistedBoardTracking() time), so each test that wants a
 * specific storage state must re-import after seeding storage. Mirrors the
 * pattern used by tests/lib/recent-files.spec.ts.
 */
async function freshImport() {
  vi.resetModules();
  return {
    persist: await import("@/features/boards/persisted-board"),
    state: {
      ...(await import("@/features/boards/state")),
      ...(await import("@/features/serial/state")),
    },
  };
}

beforeEach(() => {
  localStorage.removeItem(FQBN_KEY);
  localStorage.removeItem(BAUD_KEY);
  localStorage.removeItem(LINE_ENDING_KEY);
});

describe("startPersistedBoardTracking — hydration", () => {
  it("hydrates selectedFqbn from a valid stored string", async () => {
    localStorage.setItem(FQBN_KEY, JSON.stringify("esp32:esp32:esp32"));
    const { persist, state } = await freshImport();
    persist.startPersistedBoardTracking();
    expect(state.selectedFqbn.value).toBe("esp32:esp32:esp32");
  });

  it("ignores a malformed stored FQBN", async () => {
    localStorage.setItem(FQBN_KEY, "{not valid json");
    const { persist, state } = await freshImport();
    const before = state.selectedFqbn.value;
    persist.startPersistedBoardTracking();
    expect(state.selectedFqbn.value).toBe(before);
  });

  it("ignores a non-string FQBN", async () => {
    localStorage.setItem(FQBN_KEY, JSON.stringify(42));
    const { persist, state } = await freshImport();
    const before = state.selectedFqbn.value;
    persist.startPersistedBoardTracking();
    expect(state.selectedFqbn.value).toBe(before);
  });

  it("ignores an empty-string FQBN (would silently break compile/upload)", async () => {
    localStorage.setItem(FQBN_KEY, JSON.stringify(""));
    const { persist, state } = await freshImport();
    const before = state.selectedFqbn.value;
    persist.startPersistedBoardTracking();
    expect(state.selectedFqbn.value).toBe(before);
  });

  it("hydrates serialBaud from a valid stored positive integer", async () => {
    localStorage.setItem(BAUD_KEY, JSON.stringify(9600));
    const { persist, state } = await freshImport();
    persist.startPersistedBoardTracking();
    expect(state.serialBaud.value).toBe(9600);
  });

  it("rejects a negative or zero baud", async () => {
    localStorage.setItem(BAUD_KEY, JSON.stringify(0));
    const { persist, state } = await freshImport();
    const before = state.serialBaud.value;
    persist.startPersistedBoardTracking();
    expect(state.serialBaud.value).toBe(before);
  });

  it("rejects a non-integer baud", async () => {
    localStorage.setItem(BAUD_KEY, JSON.stringify(96.5));
    const { persist, state } = await freshImport();
    const before = state.serialBaud.value;
    persist.startPersistedBoardTracking();
    expect(state.serialBaud.value).toBe(before);
  });

  it("hydrates serialLineEnding from a value in the allowed set", async () => {
    localStorage.setItem(LINE_ENDING_KEY, JSON.stringify("\r\n"));
    const { persist, state } = await freshImport();
    persist.startPersistedBoardTracking();
    expect(state.serialLineEnding.value).toBe("\r\n");
  });

  it("rejects a stored line-ending outside the allowed set", async () => {
    localStorage.setItem(LINE_ENDING_KEY, JSON.stringify("\t"));
    const { persist, state } = await freshImport();
    const before = state.serialLineEnding.value;
    persist.startPersistedBoardTracking();
    expect(state.serialLineEnding.value).toBe(before);
  });
});

describe("startPersistedBoardTracking — write-through", () => {
  it("writes selectedFqbn changes to localStorage", async () => {
    const { persist, state } = await freshImport();
    persist.startPersistedBoardTracking();
    state.selectedFqbn.value = "arduino:avr:uno";
    expect(JSON.parse(localStorage.getItem(FQBN_KEY)!)).toBe("arduino:avr:uno");
  });

  it("writes serialBaud changes to localStorage", async () => {
    const { persist, state } = await freshImport();
    persist.startPersistedBoardTracking();
    state.serialBaud.value = 230400;
    expect(JSON.parse(localStorage.getItem(BAUD_KEY)!)).toBe(230400);
  });

  it("writes serialLineEnding changes to localStorage", async () => {
    const { persist, state } = await freshImport();
    persist.startPersistedBoardTracking();
    state.serialLineEnding.value = "";
    expect(JSON.parse(localStorage.getItem(LINE_ENDING_KEY)!)).toBe("");
  });
});
