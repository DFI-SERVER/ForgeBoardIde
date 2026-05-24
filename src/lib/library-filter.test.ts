import { describe, it, expect } from "vitest";
import { filterLibraries, computeWindow } from "./library-filter";
import type { Library } from "../ipc/arduino";

/** Build a registry-shaped Library with sensible defaults. */
function lib(over: Partial<Library> & { name: string }): Library {
  return {
    author: undefined,
    sentence: undefined,
    paragraph: undefined,
    website: undefined,
    category: undefined,
    installed_version: undefined,
    latest_version: undefined,
    update_available: false,
    ...over,
  };
}

const REGISTRY: Library[] = [
  lib({
    name: "Adafruit NeoPixel",
    author: "Adafruit",
    // "LED" here is load-bearing: the AND-filter test queries "led
    // controlling" and expects this library to match on both terms.
    sentence: "Arduino library for controlling single-wire-based LED pixels.",
  }),
  lib({
    name: "FastLED",
    author: "Daniel Garcia",
    sentence: "Multi-platform library for controlling addressable LEDs.",
  }),
  lib({
    name: "Servo",
    author: "Arduino",
    sentence: "Allows Arduino boards to control servo motors.",
  }),
  lib({
    name: "DHT sensor library",
    author: "Adafruit",
    paragraph: "Reads temperature and humidity from DHT11/DHT22 sensors.",
  }),
];

describe("filterLibraries", () => {
  it("returns the input unchanged (same reference) for an empty query", () => {
    expect(filterLibraries(REGISTRY, "")).toBe(REGISTRY);
  });

  it("returns the input unchanged for a whitespace-only query", () => {
    expect(filterLibraries(REGISTRY, "   ")).toBe(REGISTRY);
  });

  it("matches on the library name, case-insensitively", () => {
    const r = filterLibraries(REGISTRY, "neopixel");
    expect(r.map((l) => l.name)).toEqual(["Adafruit NeoPixel"]);
  });

  it("matches on the author", () => {
    const r = filterLibraries(REGISTRY, "adafruit");
    // "Adafruit NeoPixel" matches by name+author; "DHT sensor library" by author.
    expect(r.map((l) => l.name).sort()).toEqual([
      "Adafruit NeoPixel",
      "DHT sensor library",
    ]);
  });

  it("matches on the one-line sentence", () => {
    const r = filterLibraries(REGISTRY, "servo motors");
    expect(r.map((l) => l.name)).toEqual(["Servo"]);
  });

  it("falls back to the paragraph when there is no sentence", () => {
    const r = filterLibraries(REGISTRY, "humidity");
    expect(r.map((l) => l.name)).toEqual(["DHT sensor library"]);
  });

  it("requires every whitespace-separated term to match (AND), order independent", () => {
    expect(filterLibraries(REGISTRY, "led controlling").map((l) => l.name).sort()).toEqual([
      "Adafruit NeoPixel",
      "FastLED",
    ]);
    // Same two terms, reversed — same result.
    expect(filterLibraries(REGISTRY, "controlling led").map((l) => l.name).sort()).toEqual([
      "Adafruit NeoPixel",
      "FastLED",
    ]);
  });

  it("returns an empty array when a term matches nothing", () => {
    expect(filterLibraries(REGISTRY, "bluetooth")).toEqual([]);
  });

  it("returns an empty array when one of several terms fails to match", () => {
    // "neopixel" matches one library, "servo" matches a different one — no
    // single library satisfies both, so the AND yields nothing.
    expect(filterLibraries(REGISTRY, "neopixel servo")).toEqual([]);
  });

  it("preserves input order and never sorts", () => {
    const r = filterLibraries(REGISTRY, "a"); // a broad letter — matches all four
    expect(r.map((l) => l.name)).toEqual([
      "Adafruit NeoPixel",
      "FastLED",
      "Servo",
      "DHT sensor library",
    ]);
  });
});

describe("computeWindow", () => {
  // 1000 rows, 40px tall, a 400px viewport unless noted.
  const TOTAL = 1000;
  const ROW = 40;
  const VIEWPORT = 400;

  it("returns an empty window for an empty list", () => {
    expect(computeWindow(0, ROW, 0, VIEWPORT)).toEqual({
      startIndex: 0,
      endIndex: 0,
      topPad: 0,
      bottomPad: 0,
    });
  });

  it("returns an empty window for a zero row height", () => {
    expect(computeWindow(TOTAL, 0, 0, VIEWPORT)).toEqual({
      startIndex: 0,
      endIndex: 0,
      topPad: 0,
      bottomPad: 0,
    });
  });

  it("at the top of the list starts at index 0 with no top spacer", () => {
    const w = computeWindow(TOTAL, ROW, 0, VIEWPORT, 0);
    expect(w.startIndex).toBe(0);
    expect(w.topPad).toBe(0);
    // 400 / 40 = 10 rows + 1 partial row = 11.
    expect(w.endIndex).toBe(11);
    expect(w.bottomPad).toBe((TOTAL - 11) * ROW);
  });

  it("applies the overscan margin on both sides when scrolled mid-list", () => {
    // Scrolled to 4000px -> first visible row is index 100.
    const w = computeWindow(TOTAL, ROW, 4000, VIEWPORT, 6);
    expect(w.startIndex).toBe(100 - 6); // 94
    // firstVisible(100) + rowsInView(11) + overscan(6) = 117
    expect(w.endIndex).toBe(117);
    expect(w.topPad).toBe(94 * ROW);
    expect(w.bottomPad).toBe((TOTAL - 117) * ROW);
  });

  it("clamps startIndex to 0 when the overscan would reach above the list", () => {
    // Scrolled only 80px -> first visible row index 2; overscan 6 would give -4.
    const w = computeWindow(TOTAL, ROW, 80, VIEWPORT, 6);
    expect(w.startIndex).toBe(0);
    expect(w.topPad).toBe(0);
  });

  it("clamps endIndex to totalCount at the bottom of the list", () => {
    // Scroll all the way down: 1000*40 - 400 = 39600px.
    const w = computeWindow(TOTAL, ROW, 39600, VIEWPORT, 6);
    expect(w.endIndex).toBe(TOTAL);
    expect(w.bottomPad).toBe(0);
  });

  it("treats a negative scroll offset (overscroll) as the top", () => {
    const w = computeWindow(TOTAL, ROW, -200, VIEWPORT, 0);
    expect(w.startIndex).toBe(0);
    expect(w.endIndex).toBe(11);
    expect(w.topPad).toBe(0);
  });

  it("keeps topPad + rendered-rows height + bottomPad equal to the full scroll height", () => {
    const w = computeWindow(TOTAL, ROW, 4000, VIEWPORT, 6);
    const renderedHeight = (w.endIndex - w.startIndex) * ROW;
    expect(w.topPad + renderedHeight + w.bottomPad).toBe(TOTAL * ROW);
  });

  it("renders the whole list when it is shorter than the viewport", () => {
    const w = computeWindow(5, ROW, 0, VIEWPORT, 6);
    expect(w.startIndex).toBe(0);
    expect(w.endIndex).toBe(5);
    expect(w.topPad).toBe(0);
    expect(w.bottomPad).toBe(0);
  });

  it("handles a zero-height viewport (collapsed panel) without error", () => {
    const w = computeWindow(TOTAL, ROW, 0, 0, 0);
    expect(w.startIndex).toBe(0);
    // ceil(0/40) + 1 = 1 row still mounted.
    expect(w.endIndex).toBe(1);
    expect(w.bottomPad).toBe((TOTAL - 1) * ROW);
  });
});
