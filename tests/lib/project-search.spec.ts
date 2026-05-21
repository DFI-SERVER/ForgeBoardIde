import { describe, it, expect } from "vitest";
import {
  searchFiles,
  segmentLine,
  type SearchableFile,
} from "../../src/lib/project-search";

/** A small two-file sketch used across the cases below. */
const FILES: SearchableFile[] = [
  {
    name: "blink.ino",
    path: "C:/sketches/blink/blink.ino",
    content: [
      "void setup() {",
      "  pinMode(LED_BUILTIN, OUTPUT);",
      "}",
      "",
      "void loop() {",
      "  digitalWrite(LED_BUILTIN, HIGH);",
      "  delay(500);",
      "  digitalWrite(LED_BUILTIN, LOW);",
      "  delay(500);",
      "}",
    ].join("\n"),
  },
  {
    name: "helpers.h",
    path: "C:/sketches/blink/helpers.h",
    content: ["#pragma once", "// delay helper", "void wait();"].join("\n"),
  },
];

describe("searchFiles", () => {
  it("returns an empty result for an empty query", () => {
    const r = searchFiles(FILES, "");
    expect(r.total).toBe(0);
    expect(r.matches).toEqual([]);
    expect(r.groups).toEqual([]);
  });

  it("returns an empty result for a query that matches nothing", () => {
    // The query "zzz" appears nowhere in the fixture.
    const r = searchFiles(FILES, "zzz");
    expect(r.total).toBe(0);
    expect(r.groups).toEqual([]);
  });

  it("finds a single match and reports file, line, text and column", () => {
    const r = searchFiles(FILES, "pinMode");
    expect(r.total).toBe(1);
    const m = r.matches[0];
    expect(m.fileName).toBe("blink.ino");
    expect(m.filePath).toBe("C:/sketches/blink/blink.ino");
    expect(m.line).toBe(2); // 1-based
    expect(m.lineText).toBe("  pinMode(LED_BUILTIN, OUTPUT);");
    expect(m.matchStart).toBe(2); // after two leading spaces
    expect(m.matchLength).toBe("pinMode".length);
  });

  it("is case-insensitive by default", () => {
    const r = searchFiles(FILES, "PINMODE");
    expect(r.total).toBe(1);
    expect(r.matches[0].line).toBe(2);
    // The reported line text is verbatim from the file, not the query casing.
    expect(r.matches[0].lineText).toContain("pinMode");
  });

  it("honours caseSensitive: true", () => {
    expect(searchFiles(FILES, "PINMODE", { caseSensitive: true }).total).toBe(0);
    expect(searchFiles(FILES, "pinMode", { caseSensitive: true }).total).toBe(1);
  });

  it("finds multiple matches on the same line", () => {
    const files: SearchableFile[] = [
      { name: "a.ino", path: "/a.ino", content: "led led led" },
    ];
    const r = searchFiles(files, "led");
    expect(r.total).toBe(3);
    expect(r.matches.map((m) => m.matchStart)).toEqual([0, 4, 8]);
    // All on line 1.
    expect(r.matches.every((m) => m.line === 1)).toBe(true);
  });

  it("does not produce overlapping matches", () => {
    const files: SearchableFile[] = [
      { name: "a.ino", path: "/a.ino", content: "aaaa" },
    ];
    // "aa" in "aaaa" yields two non-overlapping hits at columns 0 and 2.
    const r = searchFiles(files, "aa");
    expect(r.total).toBe(2);
    expect(r.matches.map((m) => m.matchStart)).toEqual([0, 2]);
  });

  it("finds matches across multiple lines within one file", () => {
    const r = searchFiles(FILES, "delay");
    // blink.ino: two delay(500) calls. helpers.h: "// delay helper".
    expect(r.total).toBe(3);
    const blink = r.groups.find((g) => g.fileName === "blink.ino");
    const helpers = r.groups.find((g) => g.fileName === "helpers.h");
    expect(blink?.matches.map((m) => m.line)).toEqual([7, 9]);
    expect(helpers?.matches.map((m) => m.line)).toEqual([2]);
  });

  it("groups results per file and omits files with no match", () => {
    const r = searchFiles(FILES, "LED_BUILTIN");
    // Three uses, all in blink.ino; helpers.h has none.
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].fileName).toBe("blink.ino");
    expect(r.groups[0].matches).toHaveLength(3);
  });

  it("keeps groups in file order and matches in line order", () => {
    const r = searchFiles(FILES, "void");
    // blink.ino has 'void setup' and 'void loop'; helpers.h has 'void wait'.
    expect(r.groups.map((g) => g.fileName)).toEqual(["blink.ino", "helpers.h"]);
    expect(r.groups[0].matches.map((m) => m.line)).toEqual([1, 5]);
  });

  it("handles CRLF and CR line endings for correct line numbers", () => {
    const files: SearchableFile[] = [
      { name: "crlf.ino", path: "/crlf.ino", content: "one\r\ntwo\r\nhit" },
      { name: "cr.ino", path: "/cr.ino", content: "one\rtwo\rhit" },
    ];
    const r = searchFiles(files, "hit");
    expect(r.total).toBe(2);
    expect(r.matches.every((m) => m.line === 3)).toBe(true);
  });

  it("returns an empty result when given no files", () => {
    expect(searchFiles([], "anything").total).toBe(0);
  });
});

describe("segmentLine", () => {
  it("returns the whole line as a single plain segment when there are no matches", () => {
    expect(segmentLine("hello world", [])).toEqual([
      { text: "hello world", highlight: false },
    ]);
  });

  it("splits a line into plain and highlighted runs around one match", () => {
    const segs = segmentLine("  pinMode(x);", [{ matchStart: 2, matchLength: 7 }]);
    expect(segs).toEqual([
      { text: "  ", highlight: false },
      { text: "pinMode", highlight: true },
      { text: "(x);", highlight: false },
    ]);
  });

  it("highlights multiple matches on the same line", () => {
    const segs = segmentLine("led led", [
      { matchStart: 0, matchLength: 3 },
      { matchStart: 4, matchLength: 3 },
    ]);
    expect(segs).toEqual([
      { text: "led", highlight: true },
      { text: " ", highlight: false },
      { text: "led", highlight: true },
    ]);
  });

  it("handles a match spanning the whole line", () => {
    expect(segmentLine("abc", [{ matchStart: 0, matchLength: 3 }])).toEqual([
      { text: "abc", highlight: true },
    ]);
  });

  it("reconstructs the original line when segments are concatenated", () => {
    const line = "  digitalWrite(LED, HIGH);";
    const segs = segmentLine(line, [
      { matchStart: 2, matchLength: 12 },
      { matchStart: 20, matchLength: 4 },
    ]);
    expect(segs.map((s) => s.text).join("")).toBe(line);
  });
});
