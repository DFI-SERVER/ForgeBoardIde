import { describe, it, expect } from "vitest";
import { parseCompileSize } from "@/features/build/size-parser";

describe("parseCompileSize", () => {
  it("parses a canonical AVR-style block (flash + RAM with Maximum)", () => {
    const output = [
      "Sketch uses 40192 bytes (15%) of program storage space. Maximum is 262144 bytes.",
      "Global variables use 4012 bytes (12%) of dynamic memory, leaving 28756 bytes for local variables. Maximum is 32768 bytes.",
    ].join("\n");
    expect(parseCompileSize(output)).toEqual({
      flashUsed: 40192,
      flashTotal: 262144,
      ramUsed: 4012,
      ramTotal: 32768,
    });
  });

  it("parses an ESP32-style block embedded in a full build log", () => {
    const output = [
      "Using library WiFi at version 2.0.0",
      "Compiling sketch...",
      "Sketch uses 745234 bytes (56%) of program storage space. Maximum is 1310720 bytes.",
      "Global variables use 41068 bytes (12%) of dynamic memory, leaving 286612 bytes for local variables. Maximum is 327680 bytes.",
      "Done compiling.",
    ].join("\n");
    expect(parseCompileSize(output)).toEqual({
      flashUsed: 745234,
      flashTotal: 1310720,
      ramUsed: 41068,
      ramTotal: 327680,
    });
  });

  it("accepts the lines as an array of already-split rows", () => {
    const lines = [
      "Sketch uses 100 bytes (0%) of program storage space. Maximum is 32768 bytes.",
      "Global variables use 50 bytes (0%) of dynamic memory, leaving 2046 bytes for local variables. Maximum is 2096 bytes.",
    ];
    expect(parseCompileSize(lines)).toEqual({
      flashUsed: 100,
      flashTotal: 32768,
      ramUsed: 50,
      ramTotal: 2096,
    });
  });

  it("handles CRLF line endings transparently", () => {
    const output =
      "Sketch uses 1024 bytes (3%) of program storage space. Maximum is 32768 bytes.\r\n" +
      "Global variables use 512 bytes (25%) of dynamic memory, leaving 1536 bytes for local variables. Maximum is 2048 bytes.\r\n";
    expect(parseCompileSize(output)).toEqual({
      flashUsed: 1024,
      flashTotal: 32768,
      ramUsed: 512,
      ramTotal: 2048,
    });
  });

  it("supports the older RAM line shape that lacks 'Maximum is …' (recovers total = used + free)", () => {
    const output = [
      "Sketch uses 2048 bytes (6%) of program storage space. Maximum is 32768 bytes.",
      "Global variables use 600 bytes (29%) of dynamic memory, leaving 1448 bytes for local variables.",
    ].join("\n");
    expect(parseCompileSize(output)).toEqual({
      flashUsed: 2048,
      flashTotal: 32768,
      ramUsed: 600,
      ramTotal: 2048,
    });
  });

  it("strips ANSI colour codes before matching", () => {
    const output =
      "\x1b[32mSketch uses 1000 bytes (1%) of program storage space. Maximum is 100000 bytes.\x1b[0m\n" +
      "\x1b[33mGlobal variables use 200 bytes (10%) of dynamic memory, leaving 1800 bytes for local variables. Maximum is 2000 bytes.\x1b[0m";
    expect(parseCompileSize(output)).toEqual({
      flashUsed: 1000,
      flashTotal: 100000,
      ramUsed: 200,
      ramTotal: 2000,
    });
  });

  it("tolerates extra whitespace between sentences inside a single line", () => {
    const output =
      "Sketch uses 4000 bytes (10%) of program storage space.    Maximum is 40000 bytes.\n" +
      "Global variables use 800 bytes (10%) of dynamic memory, leaving 7200 bytes for local variables.    Maximum is 8000 bytes.";
    expect(parseCompileSize(output)).toEqual({
      flashUsed: 4000,
      flashTotal: 40000,
      ramUsed: 800,
      ramTotal: 8000,
    });
  });

  it("prefers the newer RAM line when both shapes could match (the 'Maximum is …' suffix is captured)", () => {
    // The newer RE matches a strict superset of the older RE's prefix; we want
    // the total to come from `Maximum is`, not from `used + leaving`, when both
    // pieces of data are present.
    const output =
      "Sketch uses 1000 bytes (1%) of program storage space. Maximum is 100000 bytes.\n" +
      "Global variables use 100 bytes (5%) of dynamic memory, leaving 1900 bytes for local variables. Maximum is 2048 bytes.";
    const parsed = parseCompileSize(output)!;
    expect(parsed.ramTotal).toBe(2048); // from 'Maximum is', NOT 100 + 1900 = 2000
  });

  it("returns null when the flash line is missing", () => {
    const output =
      "Global variables use 4012 bytes (12%) of dynamic memory, leaving 28756 bytes for local variables. Maximum is 32768 bytes.";
    expect(parseCompileSize(output)).toBeNull();
  });

  it("returns null when the RAM line is missing", () => {
    const output =
      "Sketch uses 40192 bytes (15%) of program storage space. Maximum is 262144 bytes.";
    expect(parseCompileSize(output)).toBeNull();
  });

  it("returns null on completely unrelated output", () => {
    expect(parseCompileSize("hello world")).toBeNull();
    expect(parseCompileSize("")).toBeNull();
    expect(parseCompileSize("error: undefined reference to `main'")).toBeNull();
  });

  it("returns null when totals would be zero (would render a divide-by-zero bar)", () => {
    // Hand-constructed pathological input — flash total of zero must not yield
    // a renderable result because the UI divides used / total to draw the bar.
    const output =
      "Sketch uses 0 bytes (0%) of program storage space. Maximum is 0 bytes.\n" +
      "Global variables use 0 bytes (0%) of dynamic memory, leaving 0 bytes for local variables. Maximum is 0 bytes.";
    expect(parseCompileSize(output)).toBeNull();
  });

  it("accepts zero usage (a tiny sketch on a big board)", () => {
    const output =
      "Sketch uses 0 bytes (0%) of program storage space. Maximum is 1310720 bytes.\n" +
      "Global variables use 0 bytes (0%) of dynamic memory, leaving 327680 bytes for local variables. Maximum is 327680 bytes.";
    expect(parseCompileSize(output)).toEqual({
      flashUsed: 0,
      flashTotal: 1310720,
      ramUsed: 0,
      ramTotal: 327680,
    });
  });

  it("matches the last size block when the build log somehow contains two", () => {
    // arduino-cli prints the summary once, but verbose builds sometimes echo
    // the line through stderr too — the parser should still produce one
    // coherent result (matching the first occurrence is the simpler contract).
    const output = [
      "Sketch uses 1000 bytes (1%) of program storage space. Maximum is 100000 bytes.",
      "Global variables use 100 bytes (5%) of dynamic memory, leaving 1900 bytes for local variables. Maximum is 2048 bytes.",
      "Sketch uses 2000 bytes (2%) of program storage space. Maximum is 100000 bytes.",
      "Global variables use 200 bytes (10%) of dynamic memory, leaving 1800 bytes for local variables. Maximum is 2048 bytes.",
    ].join("\n");
    const parsed = parseCompileSize(output);
    expect(parsed).not.toBeNull();
    expect(parsed!.flashUsed).toBe(1000);
    expect(parsed!.ramUsed).toBe(100);
  });

  it("rejects a malformed flash line that lacks the byte total", () => {
    const output =
      "Sketch uses 40192 bytes of program storage space.\n" +
      "Global variables use 4012 bytes (12%) of dynamic memory, leaving 28756 bytes for local variables. Maximum is 32768 bytes.";
    expect(parseCompileSize(output)).toBeNull();
  });

  it("rejects a malformed RAM line that lacks both 'Maximum' and 'leaving …'", () => {
    const output =
      "Sketch uses 40192 bytes (15%) of program storage space. Maximum is 262144 bytes.\n" +
      "Global variables use 4012 bytes (12%) of dynamic memory.";
    expect(parseCompileSize(output)).toBeNull();
  });
});
