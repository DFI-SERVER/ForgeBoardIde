import { describe, it, expect } from "vitest";
import { parsePlotterLine, hasPlottableData } from "./plotter-parse";

describe("parsePlotterLine", () => {
  it("parses a single bare number as Series 1", () => {
    expect(parsePlotterLine("42")).toEqual([{ label: "Series 1", value: 42 }]);
  });

  it("parses several space-separated numbers as positional series", () => {
    expect(parsePlotterLine("12 34 56")).toEqual([
      { label: "Series 1", value: 12 },
      { label: "Series 2", value: 34 },
      { label: "Series 3", value: 56 },
    ]);
  });

  it("parses comma-separated numbers", () => {
    expect(parsePlotterLine("12,34,56")).toEqual([
      { label: "Series 1", value: 12 },
      { label: "Series 2", value: 34 },
      { label: "Series 3", value: 56 },
    ]);
  });

  it("parses tab-separated numbers", () => {
    expect(parsePlotterLine("12\t34\t56")).toEqual([
      { label: "Series 1", value: 12 },
      { label: "Series 2", value: 34 },
      { label: "Series 3", value: 56 },
    ]);
  });

  it("treats a comma+space run as one separator", () => {
    expect(parsePlotterLine("12, 34, 56")).toEqual([
      { label: "Series 1", value: 12 },
      { label: "Series 2", value: 34 },
      { label: "Series 3", value: 56 },
    ]);
  });

  it("parses a single label:value pair, the label naming the series", () => {
    expect(parsePlotterLine("temp:23.5")).toEqual([
      { label: "temp", value: 23.5 },
    ]);
  });

  it("parses multiple label:value pairs", () => {
    expect(parsePlotterLine("temp:23.5 humidity:60")).toEqual([
      { label: "temp", value: 23.5 },
      { label: "humidity", value: 60 },
    ]);
  });

  it("parses a mix of labelled and bare numbers, keeping positional indices stable", () => {
    // Slot 1 is labelled, slot 2 is bare -> bare value keeps index 2.
    expect(parsePlotterLine("temp:23.5 60 onboard:1")).toEqual([
      { label: "temp", value: 23.5 },
      { label: "Series 2", value: 60 },
      { label: "onboard", value: 1 },
    ]);
  });

  it("parses negative numbers, decimals, leading-dot decimals and exponents", () => {
    expect(parsePlotterLine("-5 3.14 .5 1e3 -2.5e-2")).toEqual([
      { label: "Series 1", value: -5 },
      { label: "Series 2", value: 3.14 },
      { label: "Series 3", value: 0.5 },
      { label: "Series 4", value: 1000 },
      { label: "Series 5", value: -0.025 },
    ]);
  });

  it("ignores non-numeric tokens but keeps numeric ones, with stable indices", () => {
    // "hello" occupies slot 2; the trailing 99 is slot 3.
    expect(parsePlotterLine("12 hello 99")).toEqual([
      { label: "Series 1", value: 12 },
      { label: "Series 3", value: 99 },
    ]);
  });

  it("ignores a label:value pair whose value is not numeric", () => {
    expect(parsePlotterLine("state:ON temp:21")).toEqual([
      { label: "temp", value: 21 },
    ]);
  });

  it("returns an empty array for a line with no parseable numbers", () => {
    expect(parsePlotterLine("Booting up...")).toEqual([]);
    expect(parsePlotterLine("WiFi connected!")).toEqual([]);
    expect(parsePlotterLine("")).toEqual([]);
    expect(parsePlotterLine("   ")).toEqual([]);
  });

  it("rejects malformed numeric-looking tokens", () => {
    // Units attached, multiple dots, and a stray sign are not numbers.
    expect(parsePlotterLine("12v 1.2.3 +")).toEqual([]);
  });

  it("tolerates a trailing carriage return from a CRLF line", () => {
    expect(parsePlotterLine("12 34\r")).toEqual([
      { label: "Series 1", value: 12 },
      { label: "Series 2", value: 34 },
    ]);
  });

  it("splits on spaces before pairing, so a colon with spaces around it is not a pair", () => {
    // Matches the Arduino plotter: `label:value` is one token; spaces around
    // the colon make three tokens, only the bare number of which is plotted.
    expect(parsePlotterLine("temp : 23.5")).toEqual([
      { label: "Series 3", value: 23.5 },
    ]);
  });
});

describe("hasPlottableData", () => {
  it("is true when the line yields at least one number", () => {
    expect(hasPlottableData("12 34")).toBe(true);
    expect(hasPlottableData("temp:21")).toBe(true);
  });

  it("is false for lines with no numbers", () => {
    expect(hasPlottableData("Booting up...")).toBe(false);
    expect(hasPlottableData("")).toBe(false);
  });
});
