import "./EditorArea.css";
import { MonacoEditor } from "./MonacoEditor";
import { TabBar } from "./TabBar";
import { WelcomeScreen } from "./WelcomeScreen";
import { openTabs } from "../state/appState";

export function EditorArea() {
  const hasTabs = openTabs.value.length > 0;

  return (
    <main class="editor-area">
      {hasTabs && <TabBar />}
      <div class="editor-monaco-host">
        <MonacoEditor />
        {/* No file tabs open — show the Welcome start screen over the
            (idle) editor instead of a blank pane. */}
        {!hasTabs && <WelcomeScreen />}
      </div>
    </main>
  );
}
