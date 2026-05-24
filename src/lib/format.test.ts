import { describe, it, expect } from "vitest";
import { formatArduino } from "./format";

/** Two-space indent unit used throughout these tests. */
const I = "  ";

describe("formatArduino", () => {
  it("re-indents a flat function body", () => {
    const input = "void setup() {\nSerial.begin(115200);\n}";
    expect(formatArduino(input, I)).toBe(
      "void setup() {\n  Serial.begin(115200);\n}",
    );
  });

  it("indents nested blocks by depth", () => {
    const input = "void loop() {\nif (x) {\ndoThing();\n}\n}";
    expect(formatArduino(input, I)).toBe(
      "void loop() {\n  if (x) {\n    doThing();\n  }\n}",
    );
  });

  it("keeps a closing brace at the enclosing level", () => {
    const input = "if (a) {\nf();\n} else {\ng();\n}";
    expect(formatArduino(input, I)).toBe("if (a) {\n  f();\n} else {\n  g();\n}");
  });

  it("corrects over-indented input rather than compounding it", () => {
    const input = "void setup() {\n            Serial.begin(9600);\n}";
    expect(formatArduino(input, I)).toBe(
      "void setup() {\n  Serial.begin(9600);\n}",
    );
  });

  it("ignores braces inside string literals", () => {
    const input = 'void setup() {\nSerial.print("}{}{");\n}';
    expect(formatArduino(input, I)).toBe(
      'void setup() {\n  Serial.print("}{}{");\n}',
    );
  });

  it("ignores braces inside a character literal", () => {
    const input = "void setup() {\nchar c = '}';\nint y = 1;\n}";
    expect(formatArduino(input, I)).toBe(
      "void setup() {\n  char c = '}';\n  int y = 1;\n}",
    );
  });

  it("ignores braces inside a line comment", () => {
    const input =
      "void setup() {\nint x = 0; // a { brace } here\nint y = 1;\n}";
    expect(formatArduino(input, I)).toBe(
      "void setup() {\n  int x = 0; // a { brace } here\n  int y = 1;\n}",
    );
  });

  it("ignores braces in a block comment and preserves its body verbatim", () => {
    const input =
      "void setup() {\n/* a comment\n   with } a brace\n*/\nint x = 0;\n}";
    expect(formatArduino(input, I)).toBe(
      "void setup() {\n  /* a comment\n   with } a brace\n*/\n  int x = 0;\n}",
    );
  });

  it("puts preprocessor directives at column 0", () => {
    const input = "void setup() {\n  #define LED 13\n}";
    expect(formatArduino(input, I)).toBe("void setup() {\n#define LED 13\n}");
  });

  it("trims trailing whitespace and keeps blank lines blank", () => {
    const input = "void setup() {  \n\n  f();   \n}";
    expect(formatArduino(input, I)).toBe("void setup() {\n\n  f();\n}");
  });

  it("preserves a trailing newline, or its absence", () => {
    expect(formatArduino("int x;\n", I)).toBe("int x;\n");
    expect(formatArduino("int x;", I)).toBe("int x;");
  });

  it("respects the supplied indent unit", () => {
    const input = "void setup() {\nf();\n}";
    expect(formatArduino(input, "    ")).toBe("void setup() {\n    f();\n}");
  });

  it("is idempotent — formatting twice equals formatting once", () => {
    const messy =
      "void loop() {\nif (ready) {\n   send();\n}\n   else {\nwait();\n}\n}";
    const once = formatArduino(messy, I);
    expect(formatArduino(once, I)).toBe(once);
  });

  it("normalises CRLF input but keeps CRLF line endings", () => {
    const input = "void setup() {\r\nf();\r\n}";
    expect(formatArduino(input, I)).toBe("void setup() {\r\n  f();\r\n}");
  });

  it("never drops below column zero on unbalanced braces", () => {
    const input = "}\n}\nint x;";
    expect(formatArduino(input, I)).toBe("}\n}\nint x;");
  });
});
