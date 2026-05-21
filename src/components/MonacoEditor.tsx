import { useEffect, useRef } from "preact/hooks";
import * as monaco from "monaco-editor";
import { initMonaco } from "../lib/monaco-setup";
import {
  openTabs,
  activeTabIndex,
  fileContents,
  saveState,
  cursorPosition,
} from "../state/appState";

/**
 * Module-level reference to the live Monaco editor instance. Set while the
 * editor is mounted, null otherwise. Lets non-React modules (the Edit menu,
 * the shared actions) reach the editor without prop drilling.
 */
let activeEditor: monaco.editor.IStandaloneCodeEditor | null = null;

/** The mounted Monaco editor instance, or null when no editor is mounted. */
export function getActiveEditor(): monaco.editor.IStandaloneCodeEditor | null {
  return activeEditor;
}

export function MonacoEditor() {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  // True while we programmatically swap the model content on a tab change, so
  // the change listener does not mistake the swap for a real user edit.
  const swapping = useRef(false);

  // Mount Monaco
  useEffect(() => {
    if (!hostRef.current) return;
    initMonaco();
    const editor = monaco.editor.create(hostRef.current, {
      value: "",
      language: "arduino",
      theme: "forgeboard",
      fontFamily: "Consolas, 'Courier New', monospace",
      fontSize: 15,
      lineHeight: 24,
      fontLigatures: false,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderLineHighlight: "line",
      smoothScrolling: true,
      cursorBlinking: "smooth",
      padding: { top: 12, bottom: 12 },
      automaticLayout: true,
      tabSize: 2,
      insertSpaces: true,
    });
    editorRef.current = editor;
    activeEditor = editor;

    // On content change, mark file as modified and stage save
    const disposable = editor.onDidChangeModelContent(() => {
      if (swapping.current) return; // ignore programmatic tab-swap edits
      const tab = openTabs.value[activeTabIndex.value];
      if (!tab) return;
      const newContents = new Map(fileContents.value);
      newContents.set(tab.path, editor.getValue());
      fileContents.value = newContents;

      if (!tab.modified) {
        const newTabs = [...openTabs.value];
        newTabs[activeTabIndex.value] = { ...tab, modified: true };
        openTabs.value = newTabs;
      }
      saveState.value = "unsaved";
    });

    // Mirror the caret into appState so the status bar shows "Ln X, Col Y".
    const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
      cursorPosition.value = {
        line: e.position.lineNumber,
        column: e.position.column,
      };
    });

    return () => {
      disposable.dispose();
      cursorDisposable.dispose();
      editor.dispose();
      if (activeEditor === editor) activeEditor = null;
    };
  }, []);

  // Swap editor content when the active tab changes — keyed on the index and
  // the active tab's path only, NOT on the whole openTabs array (which churns
  // on every keystroke and would reset the cursor mid-edit).
  const activePath = openTabs.value[activeTabIndex.value]?.path;
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activePath) return;
    const content = fileContents.value.get(activePath) ?? "";
    const ext = activePath.split(".").pop() ?? "";
    const language = ext === "ino" || ext === "pde" ? "arduino" : "cpp";
    swapping.current = true;
    editor.setValue(content);
    const model = editor.getModel();
    if (model) monaco.editor.setModelLanguage(model, language);
    swapping.current = false;
    // setValue resets the caret to the start but fires no cursor event —
    // sync the status-bar signal so it does not show a stale position.
    cursorPosition.value = { line: 1, column: 1 };
  }, [activeTabIndex.value, activePath]);

  return <div ref={hostRef} style={{ height: "100%", width: "100%" }} />;
}
