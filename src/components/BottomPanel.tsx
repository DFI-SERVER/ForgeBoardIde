import "./BottomPanel.css";
import { useEffect, useRef } from "preact/hooks";
import {
  ChevronUp,
  ChevronDown,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  FileCode2,
} from "lucide-preact";
import { SerialMonitor } from "./SerialMonitor";
import { SerialPlotter } from "./SerialPlotter";
import {
  bottomPanelTab,
  bottomPanelOpen,
  problemsCount,
  buildOutput,
  buildPhase,
  diagnostics,
} from "../state/appState";
import { openFileAtLine } from "../lib/actions";
import { groupDiagnostics } from "../lib/diagnostics";

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

/** Last path segment of a Windows- or POSIX-style absolute path. */
function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** The Problems tab — compiler diagnostics grouped by file. */
function ProblemsView() {
  const list = diagnostics.value;

  if (list.length === 0) {
    return <div class="bp-problems-empty">No problems detected.</div>;
  }

  const groups = groupDiagnostics(list);

  return (
    <div class="bp-problems">
      {groups.map((group) => (
        <div class="bp-prob-group" key={group.file}>
          <div class="bp-prob-file">
            <FileCode2 size={13} strokeWidth={1.5} class="bp-prob-file-icon" />
            <span class="bp-prob-file-name">{baseName(group.file)}</span>
            <span class="bp-prob-file-count">{group.diagnostics.length}</span>
          </div>
          {group.diagnostics.map((d, i) => (
            <button
              class="bp-prob-row"
              key={`${group.file}:${i}`}
              title={`${d.file}:${d.line}:${d.column}`}
              onClick={() => openFileAtLine(group.file, d.line)}
            >
              {d.severity === "error" ? (
                <AlertCircle
                  size={13}
                  strokeWidth={1.5}
                  class="bp-prob-icon bp-prob-icon-error"
                />
              ) : (
                <AlertTriangle
                  size={13}
                  strokeWidth={1.5}
                  class="bp-prob-icon bp-prob-icon-warning"
                />
              )}
              <span class="bp-prob-msg">{d.message}</span>
              <span class="bp-prob-loc">
                {d.line}:{d.column}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
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
        {bottomPanelTab.value === "plotter" && <SerialPlotter />}
        {bottomPanelTab.value === "problems" && <ProblemsView />}
      </div>
    </section>
  );
}
