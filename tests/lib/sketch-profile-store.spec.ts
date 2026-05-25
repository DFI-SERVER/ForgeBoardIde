import { describe, it, expect, beforeEach } from "vitest";
import {
  readSketchProfile,
  writeSketchProfile,
} from "../../src/lib/sketch-profile-store";

const STORAGE_KEY = "forgeboard.sketch-profiles";

beforeEach(() => {
  localStorage.clear();
});

describe("sketch-profile-store", () => {
  it("round-trips a write and a read for a sketch path", () => {
    writeSketchProfile("/s/Blink", "production");
    expect(readSketchProfile("/s/Blink")).toBe("production");
  });

  it("returns null for a sketch with no persisted pick", () => {
    expect(readSketchProfile("/s/NeverPicked")).toBeNull();
  });

  it("overwrites an existing pick when the user changes profile", () => {
    writeSketchProfile("/s/Blink", "production");
    writeSketchProfile("/s/Blink", "debug");
    expect(readSketchProfile("/s/Blink")).toBe("debug");
  });

  it("writing null deletes the entry rather than storing the literal", () => {
    writeSketchProfile("/s/Blink", "production");
    expect(readSketchProfile("/s/Blink")).toBe("production");

    writeSketchProfile("/s/Blink", null);
    expect(readSketchProfile("/s/Blink")).toBeNull();
  });

  it("keeps each sketch's pick independent — no cross-talk between sketches", () => {
    writeSketchProfile("/s/Blink", "production");
    writeSketchProfile("/s/Servo", "debug");

    expect(readSketchProfile("/s/Blink")).toBe("production");
    expect(readSketchProfile("/s/Servo")).toBe("debug");

    // Clearing one doesn't touch the other.
    writeSketchProfile("/s/Blink", null);
    expect(readSketchProfile("/s/Blink")).toBeNull();
    expect(readSketchProfile("/s/Servo")).toBe("debug");
  });

  it("returns null defensively when localStorage holds malformed JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json");
    expect(readSketchProfile("/s/anything")).toBeNull();
  });

  it("returns null when localStorage holds a non-object value", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["not", "an", "object"]));
    // Arrays are typeof "object" but writes onto them would mutate index 0
    // etc., not a string key — the loader rejects them by only copying
    // string values, but an Object.entries on an array gives numeric-string
    // keys with string values. The contract is "return null when no entry
    // exists"; a path that was never written should never be found.
    expect(readSketchProfile("/s/anything")).toBeNull();
  });

  it("a subsequent write recovers cleanly after malformed JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{garbage");
    writeSketchProfile("/s/Blink", "production");
    expect(readSketchProfile("/s/Blink")).toBe("production");
  });
});
