import "./BottomPanel.css";
import { useEffect, useRef } from "preact/hooks";
import { ChevronUp, ChevronDown, Loader2, CheckCircle2, XCircle } from "lucide-preact";
import { SerialMonitor } from "./SerialMonitor";
import {
  bottomPanelTab,
  bottomPanelOpen,
  problemsCount,
  buildOutput,
  buildPhase,
} from "../state/appState";

const TABS = [
  { id: "serial", label: "Serial Monitor" },
  { id: "output", label: "Output" },
  { id: "plotter", label: "Plotter" },
  { id: "problems", label: "Problems" },
] as const;

function OutputView() {
  const lines = buildOutput.value;
  const phase = buildPhase.value;
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines.length, phase]);

  if (lines.length === 0 && phase === "idle") {
    return (
      <div class="bp-output-empty">
        No output yet. Click "Check code" to compile, or "Upload" to flash a connected board.
      </div>
    );
  }

  return (
    <pre ref={ref} class="bp-output">
      {lines.map((line, i) => (
        <div key={i} class="bp-output-line">
          {line || " "}
        </div>
      ))}
      {phase === "compiling" && (
        <div class="bp-output-status">
          <Loader2 class="bp-spin" size={14} strokeWidth={1.5} />
          Compiling…
        </div>
      )}
      {phase === "uploading" && (
        <div class="bp-output-status">
          <Loader2 class="bp-spin" size={14} strokeWidth={1.5} />
          Compiling and uploading…
        </div>
      )}
      {phase === "success" && (
        <div class="bp-output-ok">
          <CheckCircle2 size={14} strokeWidth={1.5} />
          Done
        </div>
      )}
      {phase === "error" && (
        <div class="bp-output-err">
          <XCircle size={14} strokeWidth={1.5} />
          Failed
        </div>
      )}
    </pre>
  );
}

export function BottomPanel() {
  if (!bottomPanelOpen.value) {
    return (
      <div class="bp-collapsed">
        <button class="bp-expand" onClick={() => (bottomPanelOpen.value = true)}>
          <ChevronUp size={14} strokeWidth={1.5} />
          Show panel (Ctrl+`)
        </button>
      </div>
    );
  }
  return (
    <section class="bp">
      <div class="bp-tabs">
        {TABS.map((tab) => (
          <button
            class={`bp-tab ${bottomPanelTab.value === tab.id ? "active" : ""}`}
            onClick={() => (bottomPanelTab.value = tab.id)}
          >
            {tab.label}
            {tab.id === "problems" && (
              <span class="bp-tab-badge">· {problemsCount.value}</span>
            )}
          </button>
        ))}
        <div class="bp-spacer" />
        <button
          class="bp-action"
          title="Collapse panel"
          onClick={() => (bottomPanelOpen.value = false)}
        >
          <ChevronDown size={14} strokeWidth={1.5} />
        </button>
      </div>
      <div class="bp-body">
        {bottomPanelTab.value === "output" && <OutputView />}
        {bottomPanelTab.value === "serial" && <SerialMonitor />}
        {bottomPanelTab.value === "plotter" && (
          <div class="bp-placeholder">Serial Plotter — arrives in Phase 11.</div>
        )}
        {bottomPanelTab.value === "problems" && (
          <div class="bp-placeholder">Problems list — arrives with Smart Help in Phase 6.</div>
        )}
      </div>
    </section>
  );
}
