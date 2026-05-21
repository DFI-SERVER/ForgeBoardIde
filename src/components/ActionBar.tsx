import "./ActionBar.css";
import {
  connectedPort,
  currentSketch,
  buildPhase,
  buildOutput,
  selectedFqbn,
  bottomPanelOpen,
  bottomPanelTab,
} from "../state/appState";
import { arduinoApi } from "../ipc/arduino";
import { BoardSelector } from "./BoardSelector";
import { ConnectionPill } from "./ConnectionPill";

let listenersReady = false;
async function ensureListeners() {
  if (listenersReady) return;
  listenersReady = true;
  const append = (line: string) => {
    buildOutput.value = [...buildOutput.value, line];
  };
  await arduinoApi.onCompileOutput(append);
  await arduinoApi.onUploadOutput(append);
}

function reportPrecheck(message: string) {
  buildOutput.value = [message];
  buildPhase.value = "idle";
  bottomPanelOpen.value = true;
  bottomPanelTab.value = "output";
}

function beginBuild() {
  buildOutput.value = [];
  bottomPanelOpen.value = true;
  bottomPanelTab.value = "output";
}

async function doCheck() {
  const sketch = currentSketch.value;
  if (!sketch) {
    reportPrecheck("No sketch open — open or create a sketch first.");
    return;
  }
  await ensureListeners();
  beginBuild();
  buildPhase.value = "compiling";
  try {
    const result = await arduinoApi.compile(sketch.path, selectedFqbn.value);
    buildPhase.value = result.success ? "success" : "error";
    if (!result.success && result.stderr.trim()) {
      buildOutput.value = [...buildOutput.value, "", result.stderr.trimEnd()];
    }
  } catch (err) {
    buildPhase.value = "error";
    buildOutput.value = [...buildOutput.value, `Error: ${String(err)}`];
  }
}

async function doUpload() {
  const sketch = currentSketch.value;
  if (!sketch) {
    reportPrecheck("No sketch open — open or create a sketch first.");
    return;
  }
  const port = connectedPort.value;
  if (!port) {
    reportPrecheck("No port selected — connect a board first.");
    return;
  }
  await ensureListeners();
  beginBuild();
  buildPhase.value = "uploading";
  try {
    const result = await arduinoApi.upload(sketch.path, selectedFqbn.value, port);
    buildPhase.value = result.success ? "success" : "error";
    if (!result.success && result.stderr.trim()) {
      buildOutput.value = [...buildOutput.value, "", result.stderr.trimEnd()];
    }
  } catch (err) {
    buildPhase.value = "error";
    buildOutput.value = [...buildOutput.value, `Error: ${String(err)}`];
  }
}

export function ActionBar() {
  const phase = buildPhase.value;
  const busy = phase === "compiling" || phase === "uploading";
  return (
    <div class="actionbar">
      <button
        class="btn btn-ghost"
        title="Compile the sketch and check for errors"
        onClick={doCheck}
        disabled={busy}
      >
        <span class="btn-icon check">✓</span>
        <span>{phase === "compiling" ? "Checking…" : "Check code"}</span>
      </button>

      <button
        class="btn btn-primary"
        title="Compile and upload to the board"
        onClick={doUpload}
        disabled={busy}
      >
        <span>{phase === "uploading" ? "Uploading…" : "Upload"}</span>
        <span>→</span>
      </button>

      <div class="actionbar-spacer" />

      <BoardSelector />
      <ConnectionPill />

      {busy && <div class="actionbar-progress" />}
    </div>
  );
}
