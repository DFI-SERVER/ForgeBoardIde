import "./EditorArea.css";
import { MonacoEditor } from "./MonacoEditor";
import { Breadcrumb } from "./Breadcrumb";

export function EditorArea() {
  return (
    <main class="editor-area">
      <Breadcrumb />
      <div class="editor-monaco-host">
        <MonacoEditor />
      </div>
    </main>
  );
}
