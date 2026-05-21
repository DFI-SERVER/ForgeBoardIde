import { describe, it, expect } from "vitest";
import {
  parseDiagnosticLine,
  parseDiagnostics,
  countDiagnostics,
  groupDiagnostics,
} from "./diagnostics";

describe("parseDiagnosticLine", () => {
  it("parses a plain error", () => {
    const d = parseDiagnosticLine(
      "/home/user/blink/blink.ino:14:3: error: expected ';' before '}' token",
    );
    expect(d).toEqual({
      file: "/home/user/blink/blink.ino",
      line: 14,
      column: 3,
      severity: "error",
      message: "expected ';' before '}' token",
    });
  });

  it("parses a warning", () => {
    const d = parseDiagnosticLine(
      "/home/user/blink/blink.ino:8:11: warning: unused variable 'x' [-Wunused-variable]",
    );
    expect(d).toEqual({
      file: "/home/user/blink/blink.ino",
      line: 8,
      column: 11,
      severity: "warning",
      message: "unused variable 'x' [-Wunused-variable]",
    });
  });

  it("parses a Windows drive-letter path without mistaking the drive colon for the location", () => {
    const d = parseDiagnosticLine(
      "C:\\Users\\av\\Documents\\Arduino\\blink\\blink.ino:22:5: error: 'digtalWrite' was not declared in this scope",
    );
    expect(d).toEqual({
      file: "C:\\Users\\av\\Documents\\Arduino\\blink\\blink.ino",
      line: 22,
      column: 5,
      severity: "error",
      message: "'digtalWrite' was not declared in this scope",
    });
  });

  it("defaults the column to 1 when the compiler omits it", () => {
    const d = parseDiagnosticLine(
      "C:\\sketch\\sketch.ino:40: error: ld returned 1 exit status",
    );
    expect(d).toEqual({
      file: "C:\\sketch\\sketch.ino",
      line: 40,
      column: 1,
      severity: "error",
      message: "ld returned 1 exit status",
    });
  });

  it("treats a fatal error as an error", () => {
    const d = parseDiagnosticLine(
      "C:\\sketch\\sketch.ino:1:10: fatal error: WiFi.h: No such file or directory",
    );
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe("WiFi.h: No such file or directory");
  });

  it("surfaces a gcc note as a warning rather than dropping it", () => {
    const d = parseDiagnosticLine(
      "C:\\sketch\\sketch.ino:12:1: note: in expansion of macro 'PIN'",
    );
    expect(d?.severity).toBe("warning");
  });

  it("returns null for non-diagnostic output lines", () => {
    expect(parseDiagnosticLine("Sketch uses 274564 bytes (20%) of program storage space.")).toBeNull();
    expect(parseDiagnosticLine("Compiling sketch...")).toBeNull();
    expect(parseDiagnosticLine("Used library    Version Path")).toBeNull();
    expect(parseDiagnosticLine("")).toBeNull();
    expect(parseDiagnosticLine("   ")).toBeNull();
    // A path + line but no severity keyword must not match.
    expect(parseDiagnosticLine("C:\\sketch\\sketch.ino:14:3: hello there")).toBeNull();
  });
});

describe("parseDiagnostics", () => {
  it("returns an empty array for empty input", () => {
    expect(parseDiagnostics("")).toEqual([]);
    expect(parseDiagnostics([])).toEqual([]);
  });

  it("extracts multiple diagnostics and ignores interleaved non-diagnostic lines", () => {
    const output = [
      "Compiling sketch...",
      "C:\\Users\\av\\blink\\blink.ino:14:3: error: expected ';' before '}' token",
      "   for (int i = 0; i < 10; i++) { }",
      "                                  ^",
      "C:\\Users\\av\\blink\\blink.ino:8:7: warning: unused variable 'led' [-Wunused-variable]",
      "/usr/lib/helper.cpp:5:1: error: stray token",
      "Error during build: exit status 1",
    ].join("\n");

    const result = parseDiagnostics(output);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ line: 14, severity: "error" });
    expect(result[1]).toMatchObject({ line: 8, severity: "warning", file: "C:\\Users\\av\\blink\\blink.ino" });
    expect(result[2]).toMatchObject({ file: "/usr/lib/helper.cpp", severity: "error" });
  });

  it("accepts an already-split array of lines and handles CRLF strings", () => {
    const lines = [
      "C:\\s\\s.ino:1:1: error: a",
      "C:\\s\\s.ino:2:2: warning: b",
    ];
    expect(parseDiagnostics(lines)).toHaveLength(2);
    expect(parseDiagnostics(lines.join("\r\n"))).toHaveLength(2);
  });
});

describe("countDiagnostics", () => {
  it("tallies errors and warnings", () => {
    const diagnostics = parseDiagnostics([
      "C:\\s\\s.ino:1:1: error: a",
      "C:\\s\\s.ino:2:2: error: b",
      "C:\\s\\s.ino:3:3: warning: c",
    ]);
    expect(countDiagnostics(diagnostics)).toEqual({ errors: 2, warnings: 1 });
  });

  it("is zero for no diagnostics", () => {
    expect(countDiagnostics([])).toEqual({ errors: 0, warnings: 0 });
  });
});

describe("groupDiagnostics", () => {
  it("groups by file, preserving first-seen order", () => {
    const diagnostics = parseDiagnostics([
      "C:\\proj\\a.ino:1:1: error: one",
      "C:\\proj\\b.cpp:2:1: warning: two",
      "C:\\proj\\a.ino:9:4: warning: three",
    ]);
    const groups = groupDiagnostics(diagnostics);
    expect(groups).toHaveLength(2);
    expect(groups[0].file).toBe("C:\\proj\\a.ino");
    expect(groups[0].diagnostics).toHaveLength(2);
    expect(groups[1].file).toBe("C:\\proj\\b.cpp");
    expect(groups[1].diagnostics).toHaveLength(1);
  });

  it("returns an empty array for no diagnostics", () => {
    expect(groupDiagnostics([])).toEqual([]);
  });
});
