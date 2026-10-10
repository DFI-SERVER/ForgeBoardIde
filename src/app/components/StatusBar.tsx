import "./StatusBar.css";
import { Check, CircleSlash, AlertCircle, AlertTriangle } from "lucide-preact";
import { connectionState, connectedBoard, connectedPort, selectedFqbn } from "@/features/boards/state";
import { displayBoardName } from "@/features/boards/forge-boards";
import { saveState, cursorPosition, openTabs, activeTabIndex } from "@/features/editor/state";
import { diagnosticCounts } from "@/features/build/state";
import { settings } from "@/features/settings/settings";
import { languageLabelForName } from "@/shared/file-icons";
import { getActiveEditor } from "@/features/editor/components/MonacoEditor";
import { showProblems } from "@/app/actions";

/** Open Monaco's Go to Line widget — the clickable cursor segment. */
function gotoLine() {
  const editor = getActiveEditor();
  if (!editor) return;
  editor.focus();
  editor.getAction("editor.action.gotoLine")?.run();
}

/** The board-connection summary — mirrors the toolbar ConnectionPill. */
function connectionLabel(): string {
  switch (connectionState.value) {
    case "connected":
      return `${displayBoardName(selectedFqbn.value, connectedBoard.value)} · ${connectedPort.value}`;
    case "detecting":
      return `Detecting on ${connectedPort.value}…`;
    case "unidentified":
      return `Unknown board · ${connectedPort.value}`;
    default:
      return "No board";
  }
}

/** The "N errors, M warnings" problems segment — opens the Problems panel. */
function ProblemsSummary() {
  const { errors, warnings } = diagnosticCounts.value;
  const clean = errors === 0 && warnings === 0;
  return (
    <button
      class="sb-item sb-problems"
      title="Show Problems panel"
      onClick={showProblems}
    >
      {clean ? (
        <>
          <CircleSlash size={12} strokeWidth={1.5} />
          No problems
        </>
      ) : (
        <>
          <span class={`sb-prob ${errors > 0 ? "has" : ""}`}>
            <AlertCircle size={12} strokeWidth={1.5} />
            {errors}
          </span>
          <span class={`sb-prob ${warnings > 0 ? "has" : ""}`}>
            <AlertTriangle size={12} strokeWidth={1.5} />
            {warnings}
          </span>
        </>
      )}
    </button>
  );
}

export function StatusBar() {
  const state = connectionState.value;
  const pos = cursorPosition.value;
  // The language label tracks the active tab's extension. Without a tab open
  // the label falls back to "Plain" — same handling the helper gives any
  // unrecognised file. The tab-size segment reads the live setting so a
  // user changing tab size from Settings sees the bar update without restart.
  const activeTab = openTabs.value[activeTabIndex.value];
  const langLabel = activeTab ? languageLabelForName(activeTab.name) : "Plain";
  return (
    <footer class="statusbar">
      <span class={`sb-item sb-conn sb-conn-${state}`} title="Board connection">
        <span class={`sb-dot sb-dot-${state}`} />
        {connectionLabel()}
      </span>
      <ProblemsSummary />
      <span class="sb-spacer" />
      <button
        class="sb-item sb-button"
        title="Go to line"
        onClick={gotoLine}
      >
        Ln {pos.line}, Col {pos.column}
      </button>
      <span class="sb-item">Spaces: {settings.value.tabSize}</span>
      <span class="sb-item">UTF-8</span>
      <span class="sb-item">LF</span>
      <span class="sb-item">{langLabel}</span>
      <span class={`sb-item save-state ${saveState.value}`}>
        {saveState.value === "saved" && (
          <>
            <Check size={12} strokeWidth={1.5} />
            Saved
          </>
        )}
        {saveState.value === "saving" && "Saving…"}
        {saveState.value === "unsaved" && (
          <>
            <span class="sb-save-dot" />
            Unsaved
          </>
        )}
      </span>
    </footer>
  );
}
