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

  // Register theme
  monaco.editor.defineTheme("forgeboard", {
    base: "vs-dark",
    inherit: false,
    rules: [
      { token: "comment", foreground: "5a5650", fontStyle: "italic" },
      { token: "keyword", foreground: "c9922f" },
      { token: "keyword.arduino", foreground: "c9922f", fontStyle: "bold" },
      { token: "keyword.directive", foreground: "c9922f" },
      { token: "constant.arduino", foreground: "7fb2a1" },
      { token: "support.function.arduino", foreground: "e8c585" },
      { token: "support.class.arduino", foreground: "7fb2a1" },
      { token: "type", foreground: "7fb2a1" },
      { token: "number", foreground: "d19a66" },
      { token: "number.hex", foreground: "d19a66" },
      { token: "number.binary", foreground: "d19a66" },
      { token: "number.float", foreground: "d19a66" },
      { token: "string", foreground: "a8c479" },
      { token: "string.escape", foreground: "a8c479", fontStyle: "bold" },
      { token: "identifier", foreground: "e8e6e1" },
      { token: "operator", foreground: "8a8680" },
    ],
    colors: {
      "editor.background": "#141311",
      "editor.foreground": "#e8e6e1",
      "editor.lineHighlightBackground": "#1a191680",
      "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": "#3a3834",
      "editorLineNumber.activeForeground": "#c9922f",
      "editor.selectionBackground": "#c9922f40",
      "editor.inactiveSelectionBackground": "#c9922f20",
      "editorCursor.foreground": "#c9922f",
      "editorIndentGuide.background": "#1f1e1a",
      "editorIndentGuide.activeBackground": "#2a2822",
      "editorWhitespace.foreground": "#2a2822",
      "scrollbarSlider.background": "#2a282280",
      "scrollbarSlider.hoverBackground": "#3a3834",
      "scrollbarSlider.activeBackground": "#c9922f",
    },
  });
}
