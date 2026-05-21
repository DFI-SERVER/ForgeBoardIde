import "./StatusBar.css";
import { Check, CircleSlash, AlertCircle, AlertTriangle } from "lucide-preact";
import {
  connectionState,
  connectedBoard,
  connectedPort,
  saveState,
  cursorPosition,
  diagnosticCounts,
  toast,
} from "../state/appState";
import { getActiveEditor } from "./MonacoEditor";
import { showProblems } from "../lib/actions";
import { ping } from "../ipc/ping";

async function handlePing() {
  try {
    const r = await ping();
    toast.value = { text: `${r.pong} (v${r.version})`, kind: "info" };
  } catch (e) {
    toast.value = { text: `Ping failed: ${e}`, kind: "warn" };
  }
}

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
      return `${connectedBoard.value} · ${connectedPort.value}`;
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
      <span class="sb-item">Spaces: 2</span>
      <button class="sb-item sb-button" onClick={handlePing}>
        ping
      </button>
      <span class="sb-item">UTF-8</span>
      <span class="sb-item">LF</span>
      <span class="sb-item">C++</span>
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
