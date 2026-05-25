import { describe, it, expect } from "vitest";
import { FileCode2, FileText } from "lucide-preact";
import { iconForName, languageLabelForName } from "../../src/lib/file-icons";

describe("iconForName", () => {
  it("returns FileCode2 for Arduino sketch extensions", () => {
    expect(iconForName("sketch.ino")).toBe(FileCode2);
    expect(iconForName("old.pde")).toBe(FileCode2);
  });

  it("returns FileCode2 for C/C++ extensions", () => {
    expect(iconForName("util.cpp")).toBe(FileCode2);
    expect(iconForName("driver.cxx")).toBe(FileCode2);
    expect(iconForName("legacy.cc")).toBe(FileCode2);
    expect(iconForName("plain.c")).toBe(FileCode2);
  });

  it("returns FileCode2 for header extensions", () => {
    expect(iconForName("pins.h")).toBe(FileCode2);
    expect(iconForName("config.hpp")).toBe(FileCode2);
    expect(iconForName("alt.hxx")).toBe(FileCode2);
  });

  it("is case-insensitive on the extension", () => {
    expect(iconForName("README.MD")).toBe(FileText);
    expect(iconForName("Sketch.INO")).toBe(FileCode2);
  });

  it("returns FileText for non-C-like files", () => {
    expect(iconForName("README.md")).toBe(FileText);
    expect(iconForName("library.properties")).toBe(FileText);
    expect(iconForName("keywords.txt")).toBe(FileText);
    expect(iconForName("data.json")).toBe(FileText);
    expect(iconForName("noext")).toBe(FileText);
  });

  it("works on full paths, not just basenames", () => {
    expect(iconForName("C:/sketches/blink/blink.ino")).toBe(FileCode2);
    expect(iconForName("/home/u/blink/README.md")).toBe(FileText);
  });
});

describe("languageLabelForName", () => {
  it("labels .ino and .pde as Arduino", () => {
    expect(languageLabelForName("blink.ino")).toBe("Arduino");
    expect(languageLabelForName("legacy.pde")).toBe("Arduino");
  });

  it("labels the C-family extensions as C++", () => {
    expect(languageLabelForName("driver.cpp")).toBe("C++");
    expect(languageLabelForName("util.cxx")).toBe("C++");
    expect(languageLabelForName("legacy.cc")).toBe("C++");
    expect(languageLabelForName("plain.c")).toBe("C++");
    expect(languageLabelForName("pins.h")).toBe("C++");
    expect(languageLabelForName("config.hpp")).toBe("C++");
    expect(languageLabelForName("alt.hxx")).toBe("C++");
  });

  it("labels structured text formats by name", () => {
    expect(languageLabelForName("settings.json")).toBe("JSON");
    expect(languageLabelForName("README.md")).toBe("Markdown");
    expect(languageLabelForName("notes.txt")).toBe("Plain");
  });

  it("returns Plain for anything else", () => {
    expect(languageLabelForName("library.properties")).toBe("Plain");
    expect(languageLabelForName("keywords.txt")).toBe("Plain");
    expect(languageLabelForName("noext")).toBe("Plain");
    expect(languageLabelForName("data.yaml")).toBe("Plain");
  });

  it("is case-insensitive on the extension", () => {
    expect(languageLabelForName("Sketch.INO")).toBe("Arduino");
    expect(languageLabelForName("Pins.H")).toBe("C++");
  });

  it("works on full paths, not just basenames", () => {
    expect(languageLabelForName("C:/sketches/blink/blink.ino")).toBe("Arduino");
    expect(languageLabelForName("/home/u/blink/README.md")).toBe("Markdown");
  });
});
