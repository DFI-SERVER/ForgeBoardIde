import { describe, it, expect } from "vitest";
import { SNIPPETS } from "../../src/lib/snippets";

describe("Arduino snippet pack", () => {
  it("ships at least 10 snippets", () => {
    expect(SNIPPETS.length).toBeGreaterThanOrEqual(10);
  });

  it("has unique prefixes", () => {
    const prefixes = SNIPPETS.map((s) => s.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("every snippet has a non-empty prefix, description, and body", () => {
    for (const s of SNIPPETS) {
      expect(s.prefix.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
  });

  it("blink snippet references millis() (non-blocking pattern)", () => {
    const blink = SNIPPETS.find((s) => s.prefix === "blink");
    expect(blink).toBeDefined();
    expect(blink!.body.join("\n")).toMatch(/millis\(\)/);
  });

  it("wifi_connect includes WiFi.h include", () => {
    const wifi = SNIPPETS.find((s) => s.prefix === "wifi_connect");
    expect(wifi!.body.join("\n")).toMatch(/#include <WiFi\.h>/);
  });

  it("interrupt snippet uses IRAM_ATTR for the ISR", () => {
    const intr = SNIPPETS.find((s) => s.prefix === "interrupt");
    expect(intr!.body.join("\n")).toMatch(/IRAM_ATTR/);
  });
});
