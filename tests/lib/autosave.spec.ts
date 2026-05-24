import { describe, it, expect, beforeEach } from "vitest";
import {
  trimTrailingWhitespace,
  transformContentForSave,
} from "../../src/lib/autosave";
import { resetSettings, updateSettings } from "../../src/lib/settings";

/**
 * The pure save-time transforms have no shared mutable state of their own,
 * but `transformContentForSave` reads the live `settings` signal at call
 * time. Resetting settings before each test isolates one scenario from the
 * next without paying for a `vi.resetModules()` (which would re-import
 * monaco-editor 30+ times — slow enough to time the suite out).
 */
beforeEach(() => {
  resetSettings();
});

/* ---------------------------------------------- trimTrailingWhitespace --- */

describe("trimTrailingWhitespace", () => {
  it("strips trailing spaces from a single line", () => {
    expect(trimTrailingWhitespace("int x = 0;   ")).toBe("int x = 0;");
  });

  it("strips trailing tabs from a single line", () => {
    expect(trimTrailingWhitespace("int x = 0;\t\t")).toBe("int x = 0;");
  });

  it("strips mixed trailing spaces and tabs", () => {
    expect(trimTrailingWhitespace("int x = 0;  \t \t")).toBe("int x = 0;");
  });

  it("leaves a clean line alone", () => {
    expect(trimTrailingWhitespace("int x = 0;")).toBe("int x = 0;");
  });

  it("trims every line in a multi-line LF string", () => {
    expect(
      trimTrailingWhitespace("void setup() {  \n  Serial.begin(9600); \n}"),
    ).toBe("void setup() {\n  Serial.begin(9600);\n}");
  });

  it("preserves CRLF line endings while trimming each line", () => {
    expect(trimTrailingWhitespace("void setup() {  \r\n  f();\t\r\n}")).toBe(
      "void setup() {\r\n  f();\r\n}",
    );
  });

  it("trims whitespace at end-of-file with no trailing newline", () => {
    expect(trimTrailingWhitespace("int x;   ")).toBe("int x;");
  });

  it("keeps a single trailing newline intact", () => {
    expect(trimTrailingWhitespace("int x;   \n")).toBe("int x;\n");
  });

  it("does not insert anything into already-empty blank lines", () => {
    expect(trimTrailingWhitespace("a\n\nb")).toBe("a\n\nb");
  });

  it("removes whitespace from a line that contains only spaces", () => {
    expect(trimTrailingWhitespace("a\n   \nb")).toBe("a\n\nb");
  });

  it("never touches leading whitespace", () => {
    expect(trimTrailingWhitespace("    int x;")).toBe("    int x;");
  });

  it("returns the empty string unchanged", () => {
    expect(trimTrailingWhitespace("")).toBe("");
  });

  it("is idempotent — trimming twice equals trimming once", () => {
    const messy = "void setup() {  \n  f();\t  \n}  ";
    const once = trimTrailingWhitespace(messy);
    expect(trimTrailingWhitespace(once)).toBe(once);
  });
});

/* --------------------------------------------- transformContentForSave --- */

describe("transformContentForSave", () => {
  it("returns the input unchanged when both transforms are off", () => {
    updateSettings({
      formatOnSave: false,
      trimTrailingWhitespaceOnSave: false,
    });
    const input = "void setup() {  \n  f();  \n}";
    expect(transformContentForSave(input)).toBe(input);
  });

  it("trims trailing whitespace when only the trim setting is on", () => {
    updateSettings({
      formatOnSave: false,
      trimTrailingWhitespaceOnSave: true,
    });
    expect(transformContentForSave("int x = 0;   \n")).toBe("int x = 0;\n");
  });

  it("formats when formatOnSave is on, using the current tab size", () => {
    updateSettings({ formatOnSave: true, tabSize: 4 });
    expect(transformContentForSave("void setup() {\nf();\n}")).toBe(
      "void setup() {\n    f();\n}",
    );
  });

  it("formatOnSave subsumes trim — combined output is still formatted", () => {
    // With both on, formatOnSave wins (formatArduino already trims trailing
    // whitespace as part of re-indentation). The result is both re-indented
    // and trimmed in a single pass.
    updateSettings({
      formatOnSave: true,
      trimTrailingWhitespaceOnSave: true,
      tabSize: 2,
    });
    expect(transformContentForSave("void setup() {  \nf();   \n}")).toBe(
      "void setup() {\n  f();\n}",
    );
  });

  it("respects tabSize=2 when formatting on save", () => {
    updateSettings({ formatOnSave: true, tabSize: 2 });
    expect(transformContentForSave("void setup() {\nf();\n}")).toBe(
      "void setup() {\n  f();\n}",
    );
  });
});
