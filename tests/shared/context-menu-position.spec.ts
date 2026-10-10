import { describe, it, expect } from "vitest";
import { clampMenuPosition } from "@/shared/context-menu-position";

const viewport = { width: 1000, height: 800 };
const menu = { width: 200, height: 300 };

describe("clampMenuPosition", () => {
  it("opens at the cursor when there is room", () => {
    const p = clampMenuPosition({ x: 100, y: 100 }, menu, viewport);
    expect(p).toEqual({ x: 100, y: 100 });
  });

  it("flips leftward when the menu would overflow the right edge", () => {
    // Cursor near the right edge: 950 + 200 > 1000, so flip to 950 - 200.
    const p = clampMenuPosition({ x: 950, y: 100 }, menu, viewport);
    expect(p.x).toBe(750);
  });

  it("flips upward when the menu would overflow the bottom edge", () => {
    // 700 + 300 > 800, so flip to 700 - 300.
    const p = clampMenuPosition({ x: 100, y: 700 }, menu, viewport);
    expect(p.y).toBe(400);
  });

  it("flips on both axes at once in a corner", () => {
    const p = clampMenuPosition({ x: 980, y: 780 }, menu, viewport);
    expect(p.x).toBe(780);
    expect(p.y).toBe(480);
  });

  it("keeps an 8px margin from the edges by default", () => {
    // Cursor at the very top-left — stays put, already inside the margin.
    const p = clampMenuPosition({ x: 2, y: 2 }, menu, viewport);
    expect(p.x).toBe(8);
    expect(p.y).toBe(8);
  });

  it("pins to the top-left margin when the menu is larger than the viewport", () => {
    const huge = { width: 2000, height: 2000 };
    const p = clampMenuPosition({ x: 500, y: 500 }, huge, viewport);
    expect(p).toEqual({ x: 8, y: 8 });
  });

  it("never lets the flipped menu run off the opposite (left/top) edge", () => {
    // Tall menu, cursor low: a naive flip (y - height) would go negative.
    const tall = { width: 200, height: 790 };
    const p = clampMenuPosition({ x: 100, y: 770 }, tall, viewport);
    expect(p.y).toBeGreaterThanOrEqual(8);
    expect(p.y + tall.height).toBeLessThanOrEqual(viewport.height);
  });

  it("honours a custom margin", () => {
    const p = clampMenuPosition({ x: 0, y: 0 }, menu, viewport, 20);
    expect(p).toEqual({ x: 20, y: 20 });
  });
});
