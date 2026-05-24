import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as monaco from "monaco-editor";
import {
  trimTrailingWhitespace,
  transformContentForSave,
  findModelForPath,
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

/* --------------------------------------------------- findModelForPath --- */

describe("findModelForPath", () => {
  // Each test creates its own models and tears them down afterwards so the
  // global monaco.editor model registry stays clean across the suite.
  afterEach(() => {
    for (const m of monaco.editor.getModels()) m.dispose();
  });

  it("returns null when no Monaco model exists for the path", () => {
    expect(findModelForPath("/never/opened.ino")).toBeNull();
  });

  it("finds a model created with the same URI scheme MonacoEditor uses", () => {
    // Replicate the URI normalization from getOrCreateModel in MonacoEditor.tsx
    // so the test exercises the contract: a model created by the editor must
    // be discoverable via findModelForPath.
    const path = "/s/a.ino";
    const uri = monaco.Uri.parse(`file://${path}`);
    const model = monaco.editor.createModel("contents", "arduino", uri);
    expect(findModelForPath(path)).toBe(model);
  });

  it("lowercases a Windows drive letter and converts backslashes to match", () => {
    // The editor stores models under a normalized URI; the lookup must apply
    // the same normalization so the original raw on-disk path still hits.
    const normalizedUri = monaco.Uri.parse("file:///c:/Users/Av/a.ino");
    const model = monaco.editor.createModel("c", "arduino", normalizedUri);
    expect(findModelForPath("C:\\Users\\Av\\a.ino")).toBe(model);
  });
});

/* ----------------------------- applySaveTransforms — split-pane safety --- */

describe("applySaveTransforms — split-pane safety", () => {
  // Heavy imports must happen INSIDE the describe so vi.mock applied at
  // module top has already been registered if/when other suites add one.
  afterEach(() => {
    for (const m of monaco.editor.getModels()) m.dispose();
  });

  it("rewrites the model of a file modified in the inactive pane", async () => {
    const { saveState, fileContents, editorGroups, activeGroupIndex, openTabs, activeTabIndex } =
      await import("../../src/state/appState");
    const { flushSaveAsync } = await import("../../src/lib/autosave");
    const { projectApi } = await import("../../src/ipc/project");

    // Enable the trim transform (the simpler of the two — applies to any
    // path, no formatter language requirement).
    updateSettings({ formatOnSave: false, trimTrailingWhitespaceOnSave: true });

    // Mock the saveFile IPC so the unit test doesn't try to write to disk.
    vi.spyOn(projectApi, "saveFile").mockResolvedValue(undefined);

    const pathB = "/s/b.ino";
    const originalB = "void loop() {  \n}\n"; // trailing whitespace to trim

    // Two groups: g0 active with a.ino, g1 inactive with b.ino. b.ino is the
    // only modified tab.
    editorGroups.value = [
      { id: "g0", tabs: [{ path: "/s/a.ino", name: "a.ino", modified: false }], activeTabIndex: 0 },
      { id: "g1", tabs: [{ path: pathB, name: "b.ino", modified: true }], activeTabIndex: 0 },
    ];
    activeGroupIndex.value = 0;
    openTabs.value = editorGroups.value[0].tabs;
    activeTabIndex.value = 0;

    fileContents.value = new Map([
      ["/s/a.ino", "void setup() {}"],
      [pathB, originalB],
    ]);

    // Pre-create the Monaco model for the inactive pane's file at the URI
    // MonacoEditor would use — this is what the regression fix must rewrite.
    const uriB = monaco.Uri.parse(`file://${pathB}`);
    const modelB = monaco.editor.createModel(originalB, "arduino", uriB);

    saveState.value = "unsaved";
    await flushSaveAsync();

    // The transform stripped the trailing whitespace — both fileContents and
    // the model now hold the rewritten text. Before the fix, the model would
    // still hold `originalB`.
    const trimmed = "void loop() {\n}\n";
    expect(fileContents.value.get(pathB)).toBe(trimmed);
    expect(modelB.getValue()).toBe(trimmed);
  });
});
