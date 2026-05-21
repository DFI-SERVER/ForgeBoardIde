import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { ARDUINO_MONACO_LANGUAGE } from "./arduino-grammar";

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

  // Register theme -- a cool, restrained palette matching the
  // monochrome design system (see styles/tokens.css). Syntax stays
  // in the cool half of the wheel so it blends with the slate UI.
  monaco.editor.defineTheme("forgeboard", {
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
