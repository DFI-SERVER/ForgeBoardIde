import "./EditorArea.css";
import { MonacoEditor } from "./MonacoEditor";
import { TabBar } from "./TabBar";
import { openTabs } from "../state/appState";

export function EditorArea() {
  const hasTabs = openTabs.value.length > 0;

  return (
    <main class="editor-area">
      {hasTabs && <TabBar />}
      <div class="editor-monaco-host">
        <MonacoEditor />
        {!hasTabs && (
          <div class="editor-empty">
            <div class="editor-empty-title">No sketch open</div>
            <div class="editor-empty-sub">
              Open a sketch from the Files panel, or create a new one.
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
