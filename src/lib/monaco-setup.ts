import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { ARDUINO_MONACO_LANGUAGE } from "./arduino-grammar";
import type { Theme, FontFamily } from "./settings";

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

  defineForgeBoardDark();
  defineSolarizedDark();
  defineSolarizedLight();
}

/** The cool-slate industrial dark theme — matches tokens.css [data-theme="dark"]. */
function defineForgeBoardDark() {
  monaco.editor.defineTheme("forgeboard-dark", {
    base: "vs-dark",
    inherit: false,
    rules: [
      { token: "comment", foreground: "5e6478", fontStyle: "italic" },
      { token: "keyword", foreground: "ab9fe0" },
      { token: "keyword.arduino", foreground: "ab9fe0", fontStyle: "bold" },
      { token: "keyword.directive", foreground: "ab9fe0" },
      { token: "constant.arduino", foreground: "bcb0ea" },
      { token: "support.function.arduino", foreground: "86a9e0" },
      { token: "support.class.arduino", foreground: "66bccb" },
      { token: "type", foreground: "66bccb" },
      { token: "number", foreground: "7fbdbf" },
      { token: "number.hex", foreground: "7fbdbf" },
      { token: "number.binary", foreground: "7fbdbf" },
      { token: "number.float", foreground: "7fbdbf" },
      { token: "string", foreground: "9ec293" },
      { token: "string.escape", foreground: "9ec293", fontStyle: "bold" },
      { token: "identifier", foreground: "c9ccd6" },
      { token: "operator", foreground: "8b90a0" },
      { token: "delimiter", foreground: "8b90a0" },
    ],
    colors: {
      "editor.background": "#181a23",
      "editor.foreground": "#c9ccd6",
      "editor.lineHighlightBackground": "#ffffff0c",
      "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": "#4f5466",
      "editorLineNumber.activeForeground": "#9398a8",
      "editor.selectionBackground": "#ffffff26",
      "editor.inactiveSelectionBackground": "#ffffff14",
      "editor.selectionHighlightBackground": "#ffffff10",
      "editor.findMatchBackground": "#ffffff33",
      "editor.findMatchHighlightBackground": "#ffffff1a",
      "editorCursor.foreground": "#e9eaef",
      "editorIndentGuide.background": "#23262f",
      "editorIndentGuide.activeBackground": "#343843",
      "editorWhitespace.foreground": "#2c2f3a",
      "editorError.foreground": "#f0625e",
      "editorWarning.foreground": "#e8b24a",
      "scrollbarSlider.background": "#ffffff12",
      "scrollbarSlider.hoverBackground": "#ffffff1f",
      "scrollbarSlider.activeBackground": "#ffffff2b",
    },
  });
}

/** Ethan Schoonover Solarized Dark — canonical palette. */
function defineSolarizedDark() {
  monaco.editor.defineTheme("forgeboard-solarized-dark", {
    base: "vs-dark",
    inherit: false,
    rules: [
      { token: "comment", foreground: "586e75", fontStyle: "italic" },
      { token: "keyword", foreground: "859900" },
      { token: "keyword.arduino", foreground: "859900", fontStyle: "bold" },
      { token: "keyword.directive", foreground: "cb4b16" },
      { token: "constant.arduino", foreground: "d33682" },
      { token: "support.function.arduino", foreground: "268bd2" },
      { token: "support.class.arduino", foreground: "b58900" },
      { token: "type", foreground: "b58900" },
      { token: "number", foreground: "d33682" },
      { token: "number.hex", foreground: "d33682" },
      { token: "number.binary", foreground: "d33682" },
      { token: "number.float", foreground: "d33682" },
      { token: "string", foreground: "2aa198" },
      { token: "string.escape", foreground: "2aa198", fontStyle: "bold" },
      { token: "identifier", foreground: "839496" },
      { token: "operator", foreground: "93a1a1" },
      { token: "delimiter", foreground: "93a1a1" },
    ],
    colors: {
      "editor.background": "#002b36",
      "editor.foreground": "#839496",
      "editor.lineHighlightBackground": "#073642",
      "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": "#475d66",
      "editorLineNumber.activeForeground": "#93a1a1",
      "editor.selectionBackground": "#268bd233",
      "editor.inactiveSelectionBackground": "#268bd21f",
      "editor.selectionHighlightBackground": "#268bd214",
      "editor.findMatchBackground": "#b5890044",
      "editor.findMatchHighlightBackground": "#b5890022",
      "editorCursor.foreground": "#fdf6e3",
      "editorIndentGuide.background": "#0a3a47",
      "editorIndentGuide.activeBackground": "#1c5260",
      "editorWhitespace.foreground": "#0c4451",
      "editorError.foreground": "#dc322f",
      "editorWarning.foreground": "#b58900",
      "scrollbarSlider.background": "#83949622",
      "scrollbarSlider.hoverBackground": "#83949633",
      "scrollbarSlider.activeBackground": "#83949644",
    },
  });
}

/** Ethan Schoonover Solarized Light — canonical palette, warm cream. */
function defineSolarizedLight() {
  monaco.editor.defineTheme("forgeboard-solarized-light", {
    base: "vs",
    inherit: false,
    rules: [
      { token: "comment", foreground: "93a1a1", fontStyle: "italic" },
      { token: "keyword", foreground: "859900" },
      { token: "keyword.arduino", foreground: "859900", fontStyle: "bold" },
      { token: "keyword.directive", foreground: "cb4b16" },
      { token: "constant.arduino", foreground: "d33682" },
      { token: "support.function.arduino", foreground: "268bd2" },
      { token: "support.class.arduino", foreground: "b58900" },
      { token: "type", foreground: "b58900" },
      { token: "number", foreground: "d33682" },
      { token: "number.hex", foreground: "d33682" },
      { token: "number.binary", foreground: "d33682" },
      { token: "number.float", foreground: "d33682" },
      { token: "string", foreground: "2aa198" },
      { token: "string.escape", foreground: "2aa198", fontStyle: "bold" },
      { token: "identifier", foreground: "657b83" },
      { token: "operator", foreground: "586e75" },
      { token: "delimiter", foreground: "586e75" },
    ],
    colors: {
      "editor.background": "#fdf6e3",
      "editor.foreground": "#657b83",
      "editor.lineHighlightBackground": "#eee8d5",
      "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": "#b2ad97",
      "editorLineNumber.activeForeground": "#586e75",
      "editor.selectionBackground": "#268bd226",
      "editor.inactiveSelectionBackground": "#268bd214",
      "editor.selectionHighlightBackground": "#268bd20f",
      "editor.findMatchBackground": "#b5890033",
      "editor.findMatchHighlightBackground": "#b5890019",
      "editorCursor.foreground": "#586e75",
      "editorIndentGuide.background": "#e6dfc7",
      "editorIndentGuide.activeBackground": "#c9c1a3",
      "editorWhitespace.foreground": "#e6dfc7",
      "editorError.foreground": "#dc322f",
      "editorWarning.foreground": "#b58900",
      "scrollbarSlider.background": "#657b8322",
      "scrollbarSlider.hoverBackground": "#657b8333",
      "scrollbarSlider.activeBackground": "#657b8344",
    },
  });
}

/** Map a Theme setting value to the registered Monaco theme name. */
export function monacoThemeFor(theme: Theme): string {
  switch (theme) {
    case "dark": return "forgeboard-dark";
    case "solarized-dark": return "forgeboard-solarized-dark";
    case "solarized-light": return "forgeboard-solarized-light";
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
