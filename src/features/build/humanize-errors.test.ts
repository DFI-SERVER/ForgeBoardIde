import { describe, it, expect } from "vitest";
import { humanizeDiagnostic } from "./humanize-errors";
import type { Diagnostic } from "./diagnostics";

/** Build a minimal Diagnostic carrying just the message under test. */
function diag(
  message: string,
  severity: Diagnostic["severity"] = "error",
): Diagnostic {
  return { file: "C:\\sketch\\sketch.ino", line: 10, column: 1, severity, message };
}

describe("humanizeDiagnostic", () => {
  it("returns null for an unrecognised message", () => {
    expect(humanizeDiagnostic(diag("some unknown internal compiler error"))).toBeNull();
    expect(humanizeDiagnostic(diag("ld returned 1 exit status"))).toBeNull();
    expect(
      humanizeDiagnostic(diag("unused variable 'x' [-Wunused-variable]", "warning")),
    ).toBeNull();
  });

  // Each covered category: a real sample message must produce a non-null hint
  // with a non-empty explanation and fix.
  describe("recognises every covered error category", () => {
    const samples: Record<string, string> = {
      "missing semicolon": "expected ';' before '}' token",
      "expected closing brace": "expected '}' at end of input",
      "expected opening brace": "expected '{' before 'digitalWrite'",
      "missing header": "WiFi.h: No such file or directory",
      "undeclared name": "'digtalWrite' was not declared in this scope",
      "unknown type": "'Srvo' does not name a type",
      "has no member named": "'class Servo' has no member named 'wrte'",
      redefinition: "redefinition of 'int ledPin'",
      "esp32 connect failure": "Failed to connect to ESP32: Timed out waiting for packet header",
      "could not open port": "could not open port 'COM5': Access is denied.",
      "port not found": "no upload port provided",
    };

    for (const [label, message] of Object.entries(samples)) {
      it(`${label} → produces a hint`, () => {
        const hint = humanizeDiagnostic(diag(message));
        expect(hint).not.toBeNull();
        expect(hint!.explanation.trim().length).toBeGreaterThan(0);
        expect(hint!.fix.trim().length).toBeGreaterThan(0);
      });
    }
  });

  it("quotes the missing header and exposes a search-library action", () => {
    const hint = humanizeDiagnostic(
      diag("Adafruit_NeoPixel.h: No such file or directory"),
    );
    expect(hint).not.toBeNull();
    expect(hint!.explanation).toContain("Adafruit_NeoPixel.h");
    expect(hint!.fix).toMatch(/librar/i);
    // Underscores in the header become spaces so arduino-cli's substring
    // match against full registry names ("Adafruit NeoPixel") finds the entry.
    expect(hint!.action).toEqual({
      kind: "search-library",
      query: "Adafruit NeoPixel",
      label: expect.stringContaining("Adafruit NeoPixel"),
    });
  });

  it("quotes the undeclared identifier in the hint", () => {
    const hint = humanizeDiagnostic(
      diag("'digtalWrite' was not declared in this scope"),
    );
    expect(hint).not.toBeNull();
    expect(hint!.explanation).toContain("digtalWrite");
  });

  it("matches a fatal-error header (severity already collapsed to error)", () => {
    // diagnostics.ts strips the `fatal ` prefix; the message keeps the header.
    const hint = humanizeDiagnostic(diag("DHT.h: No such file or directory"));
    expect(hint).not.toBeNull();
  });

  it("recognises ESP8266 connect failures, not just ESP32", () => {
    expect(
      humanizeDiagnostic(diag("Failed to connect to ESP8266: No serial data received.")),
    ).not.toBeNull();
  });

  it("the BOOT-button advice appears in the ESP32 upload hint", () => {
    const hint = humanizeDiagnostic(diag("Failed to connect to ESP32"));
    expect(hint!.fix).toMatch(/BOOT/);
  });

  it("suggests a data-capable cable when no port is found", () => {
    const hint = humanizeDiagnostic(diag("no device found on COM3"));
    expect(hint).not.toBeNull();
    expect(hint!.fix).toMatch(/cable/i);
  });

  it("picks the first matching rule when patterns could overlap", () => {
    // A semicolon error mentioning a brace must still be the semicolon rule.
    const hint = humanizeDiagnostic(diag("expected ';' before '}' token"));
    expect(hint!.explanation).toMatch(/semicolon/i);
  });
});
