import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { ARDUINO_MONACO_LANGUAGE } from "./arduino-grammar";
import { registerArduinoSnippets } from "./snippets";
import type { Theme, FontFamily } from "@/features/settings/settings";

// Monaco needs a web worker for its editor services. Without this it logs
// "Could not create web worker" errors. A custom Monarch-tokenized language
// only needs the base editor worker. Module scope guarantees this runs before
// any monaco.editor.create() call.
(self as typeof self & { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

let initialized = false;

export function initMonaco() {
  if (initialized) return;
  initialized = true;

  // Register Arduino language
  monaco.languages.register({ id: "arduino", extensions: [".ino", ".pde"], aliases: ["Arduino"] });
  monaco.languages.setMonarchTokensProvider("arduino", ARDUINO_MONACO_LANGUAGE as any);

  // Editor behaviours for the Arduino language — without this Monaco doesn't
  // know how to comment a line (so Ctrl+/ is silently a no-op), close
  // brackets/quotes for the user, surround a selection with quotes, or pick
  // up an extra indent after `{`. The shape here mirrors Monaco's bundled
  // configuration for `cpp`, which is the dialect Arduino sketches descend
  // from.
  monaco.languages.setLanguageConfiguration("arduino", {
    comments: {
      lineComment: "//",
      blockComment: ["/*", "*/"],
    },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"', notIn: ["string"] },
      { open: "'", close: "'", notIn: ["string", "comment"] },
      { open: "/**", close: " */", notIn: ["string"] },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    indentationRules: {
      increaseIndentPattern: /^.*\{[^}"']*$/,
      decreaseIndentPattern: /^\s*\}/,
    },
  });

  defineForgeBoardDark();
  defineForgeBoardLight();

  registerArduinoSnippets();
}

/** The cool-slate monochrome dark theme — matches tokens.css [data-theme="dark"]. */
function defineForgeBoardDark() {
  monaco.editor.defineTheme("forgeboard-dark", {
    base: "vs-dark",
    inherit: false,
    rules: [
      /* True neutral grayscale syntax. Emphasis via weight and italic. */
      { token: "comment", foreground: "5e5e5e", fontStyle: "italic" },
      { token: "keyword", foreground: "f0f0f0", fontStyle: "bold" },
      { token: "keyword.arduino", foreground: "f0f0f0", fontStyle: "bold" },
      { token: "keyword.directive", foreground: "f0f0f0", fontStyle: "bold" },
      { token: "constant.arduino", foreground: "f0f0f0", fontStyle: "bold" },
      { token: "support.function.arduino", foreground: "f0f0f0" },
      { token: "support.class.arduino", foreground: "909090", fontStyle: "italic" },
      { token: "type", foreground: "909090", fontStyle: "italic" },
      { token: "number", foreground: "909090" },
      { token: "number.hex", foreground: "909090" },
      { token: "number.binary", foreground: "909090" },
      { token: "number.float", foreground: "909090" },
      { token: "string", foreground: "b0b0b0" },
      { token: "string.escape", foreground: "b0b0b0", fontStyle: "bold" },
      { token: "identifier", foreground: "cccccc" },
      { token: "operator", foreground: "909090" },
      { token: "delimiter", foreground: "909090" },
    ],
    colors: {
      "editor.background": "#181818",
      "editor.foreground": "#cccccc",
      "editor.lineHighlightBackground": "#ffffff0c",
      "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": "#484848",
      "editorLineNumber.activeForeground": "#909090",
      "editor.selectionBackground": "#ffffff26",
      "editor.inactiveSelectionBackground": "#ffffff14",
      "editor.selectionHighlightBackground": "#ffffff10",
      "editor.findMatchBackground": "#ffffff33",
      "editor.findMatchHighlightBackground": "#ffffff1a",
      "editorCursor.foreground": "#f0f0f0",
      "editorIndentGuide.background": "#252525",
      "editorIndentGuide.activeBackground": "#383838",
      "editorWhitespace.foreground": "#2a2a2a",
      "editorError.foreground": "#f0625e",
      "editorWarning.foreground": "#e8b24a",
      "scrollbarSlider.background": "#ffffff12",
      "scrollbarSlider.hoverBackground": "#ffffff1f",
      "scrollbarSlider.activeBackground": "#ffffff2b",
    },
  });
}

/** The paper-white monochrome light theme — matches tokens.css [data-theme="light"].
 *  Syntax tokens are deeper-saturation versions of the dark theme so contrast
 *  against the paper background reads cleanly without losing the semantic
 *  hue mapping (purple = keyword, blue = function, green = string, etc.). */
function defineForgeBoardLight() {
  monaco.editor.defineTheme("forgeboard-light", {
    base: "vs",
    inherit: false,
    rules: [
      /* Fully grayscale light theme. Same emphasis rules as dark. */
      { token: "comment", foreground: "8a8d96", fontStyle: "italic" },
      { token: "keyword", foreground: "0d0e12", fontStyle: "bold" },
      { token: "keyword.arduino", foreground: "0d0e12", fontStyle: "bold" },
      { token: "keyword.directive", foreground: "0d0e12", fontStyle: "bold" },
      { token: "constant.arduino", foreground: "0d0e12", fontStyle: "bold" },
      { token: "support.function.arduino", foreground: "0d0e12" },
      { token: "support.class.arduino", foreground: "5a5d68", fontStyle: "italic" },
      { token: "type", foreground: "5a5d68", fontStyle: "italic" },
      { token: "number", foreground: "5a5d68" },
      { token: "number.hex", foreground: "5a5d68" },
      { token: "number.binary", foreground: "5a5d68" },
      { token: "number.float", foreground: "5a5d68" },
      { token: "string", foreground: "5a5d68" },
      { token: "string.escape", foreground: "5a5d68", fontStyle: "bold" },
      { token: "identifier", foreground: "2a2c33" },
      { token: "operator", foreground: "5a5d68" },
      { token: "delimiter", foreground: "5a5d68" },
    ],
    colors: {
      "editor.background": "#fafafa",
      "editor.foreground": "#2a2c33",
      "editor.lineHighlightBackground": "#00000008",
      "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": "#b4b7c0",
      "editorLineNumber.activeForeground": "#5a5d68",
      "editor.selectionBackground": "#0000001f",
      "editor.inactiveSelectionBackground": "#00000010",
      "editor.selectionHighlightBackground": "#0000000c",
      "editor.findMatchBackground": "#00000026",
      "editor.findMatchHighlightBackground": "#00000014",
      "editorCursor.foreground": "#1a1a1f",
      "editorIndentGuide.background": "#e7e8eb",
      "editorIndentGuide.activeBackground": "#c2c4ca",
      "editorWhitespace.foreground": "#dcdde1",
      "editorError.foreground": "#b53636",
      "editorWarning.foreground": "#a8730d",
      "scrollbarSlider.background": "#00000014",
      "scrollbarSlider.hoverBackground": "#00000022",
      "scrollbarSlider.activeBackground": "#00000033",
    },
  });
}

/** Map a Theme setting value to the registered Monaco theme name. */
export function monacoThemeFor(theme: Theme): string {
  switch (theme) {
    case "dark": return "forgeboard-dark";
    case "light": return "forgeboard-light";
  }
}

/** Map a FontFamily setting to a complete CSS font-family stack. The stack
 *  ends with monospaced fallbacks so the editor degrades gracefully when
 *  the preferred face isn't installed. */
export function fontFamilyFor(font: FontFamily): string {
  switch (font) {
    case "consolas":
      return "Consolas, 'Courier New', monospace";
    case "cascadia-code":
      return "'Cascadia Code', 'Cascadia Mono', Consolas, monospace";
    case "fira-code":
      return "'Fira Code', 'Cascadia Code', Consolas, monospace";
    case "jetbrains-mono":
      return "'JetBrains Mono', 'Cascadia Code', Consolas, monospace";
  }
}

/** Apply the theme to the app shell by writing data-theme on <html>. The
 *  CSS variables in tokens.css are scoped to [data-theme="..."] blocks so
 *  every component re-tints in one frame. Safe to call before mount. */
export function applyAppTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}
