import { describe, it, expect } from "vitest";
import {
  CURATED_EXAMPLES,
  STARTER_GROUP_LABEL,
  type CuratedExample,
} from "../../src/lib/example-catalog";

describe("curated example catalog", () => {
  it("bundles at least seven starter examples", () => {
    // The spec calls for ~7 beginner examples shipped with the app.
    expect(CURATED_EXAMPLES.length).toBeGreaterThanOrEqual(7);
  });

  it("gives every example the required fields", () => {
    for (const ex of CURATED_EXAMPLES) {
      expect(typeof ex.name).toBe("string");
      expect(ex.name.trim().length).toBeGreaterThan(0);

      expect(typeof ex.description).toBe("string");
      expect(ex.description.trim().length).toBeGreaterThan(0);

      expect(typeof ex.category).toBe("string");
      expect(ex.category.trim().length).toBeGreaterThan(0);

      expect(typeof ex.source).toBe("string");
      expect(ex.source.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps the one-line description genuinely one line", () => {
    for (const ex of CURATED_EXAMPLES) {
      expect(ex.description).not.toContain("\n");
    }
  });

  it("gives every example a unique name", () => {
    const names = CURATED_EXAMPLES.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("covers the expected beginner topics", () => {
    const names = CURATED_EXAMPLES.map((e) => e.name);
    for (const expected of [
      "Blink",
      "Button",
      "Analog Read",
      "Fade",
      "Serial Print",
      "Serial Echo",
      "WiFi Scan",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("every example source is a compilable Arduino sketch shape", () => {
    // An Arduino sketch must define both setup() and loop().
    for (const ex of CURATED_EXAMPLES) {
      expect(ex.source).toMatch(/void\s+setup\s*\(\s*\)/);
      expect(ex.source).toMatch(/void\s+loop\s*\(\s*\)/);
    }
  });

  it("uses LED_BUILTIN rather than a hardcoded LED pin number", () => {
    // Examples that drive the on-board LED must stay board-portable.
    const ledExamples = ["Blink", "Button", "Fade"];
    for (const name of ledExamples) {
      const ex = CURATED_EXAMPLES.find((e) => e.name === name)!;
      expect(ex.source).toContain("LED_BUILTIN");
    }
  });

  it("the WiFi Scan example includes the core WiFi header", () => {
    const wifi = CURATED_EXAMPLES.find((e) => e.name === "WiFi Scan")!;
    expect(wifi.source).toContain("#include <WiFi.h>");
  });

  it("serial examples open the serial link before using it", () => {
    for (const name of ["Serial Print", "Serial Echo", "Analog Read"]) {
      const ex = CURATED_EXAMPLES.find((e) => e.name === name)!;
      expect(ex.source).toMatch(/Serial\.begin\(/);
    }
  });

  it("balances braces in every example source", () => {
    // A cheap structural sanity check — every '{' has a matching '}'.
    for (const ex of CURATED_EXAMPLES) {
      const opens = (ex.source.match(/{/g) ?? []).length;
      const closes = (ex.source.match(/}/g) ?? []).length;
      expect(opens).toBe(closes);
    }
  });

  it("exports a starter-group label for the Examples view", () => {
    expect(typeof STARTER_GROUP_LABEL).toBe("string");
    expect(STARTER_GROUP_LABEL.length).toBeGreaterThan(0);
  });

  it("is typed as a readonly catalog", () => {
    // Compile-time intent check: the array type is readonly.
    const catalog: readonly CuratedExample[] = CURATED_EXAMPLES;
    expect(catalog).toBe(CURATED_EXAMPLES);
  });
});
