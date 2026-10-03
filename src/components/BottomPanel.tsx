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
  Lightbulb,
  Download,
} from "lucide-preact";
import { SerialMonitor } from "./SerialMonitor";
import { SerialPlotter } from "./SerialPlotter";
import { MemoryBar } from "./MemoryBar";
import {
  bottomPanelTab,
  bottomPanelOpen,
  problemsCount,
  buildOutput,
  buildPhase,
  diagnostics,
  lastCompileSize,
  activeRail,
  librarySearchQuery,
  libraryFilterMode,
} from "../state/appState";
import { openFileAtLine } from "../lib/actions";
import { groupDiagnostics } from "../lib/diagnostics";
import { humanizeDiagnostic, type HintAction } from "../lib/humanize-errors";
import { ResizeHandle } from "./ResizeHandle";
import { BOTTOM_PANEL } from "../lib/layout";
import { keybindings } from "../lib/keybindings";

const TABS = [
  { id: "serial", label: "Serial" },
  { id: "output", label: "Output" },
  { id: "plotter", label: "Plotter" },
  { id: "problems", label: "Problems" },
] as const;

/** Tabs whose content fills the panel edge-to-edge (terminal-like surfaces);
 *  the panel's default padding doesn't apply so the log can span the full
 *  width. Output and Problems keep the prose padding. */
const FLUSH_TABS = new Set<(typeof TABS)[number]["id"]>(["serial", "plotter"]);

function OutputView() {
  const lines = buildOutput.value;
  const phase = buildPhase.value;
  // Subscribe to lastCompileSize here so the parent scroll container also
  // re-runs when a size summary becomes available — that re-triggers the
  // scroll-to-bottom effect once the memory bar renders. MemoryBar itself
  // reads the signal independently.
  const hasSize = lastCompileSize.value !== null;
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines.length, phase, hasSize]);

  if (lines.length === 0 && phase === "idle") {
    return (
      <div class="bp-output-empty">
        No output yet. Click "Check code" to compile, or "Upload" to flash a connected board.
      </div>
    );
  }

  return (
    <pre ref={logRef} class="bp-output">
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
      <MemoryBar />
    </pre>
  );
}

/** Last path segment of a Windows- or POSIX-style absolute path. */
function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/**
 * Run a humanised-hint action. Dispatched from the Problems-panel hint button.
 * Today this is just `search-library` — it jumps to the Libraries rail with
 * the header name pre-filled so the user sees matching registry entries
 * immediately and can install with one click from there.
 */
function runHintAction(action: HintAction): void {
  switch (action.kind) {
    case "search-library":
      // Force the "All" scope: the user is here because the library is NOT
      // installed, so the default Installed tab would always be empty for
      // this query and the user would think the search broke.
      libraryFilterMode.value = "all";
      librarySearchQuery.value = action.query;
      activeRail.value = "libraries";
      return;
  }
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
          {group.diagnostics.map((d, i) => {
            const hint = humanizeDiagnostic(d);
            return (
              <button
                class="bp-prob-row"
                key={`${group.file}:${i}`}
                title={`${d.file}:${d.line}:${d.column}`}
                onClick={() => openFileAtLine(group.file, d.line, d.column)}
              >
                <div class="bp-prob-line">
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
                </div>
                {hint && (
                  <div class="bp-prob-hint">
                    <Lightbulb
                      size={12}
                      strokeWidth={1.5}
                      class="bp-prob-hint-icon"
                    />
                    <div class="bp-prob-hint-text">
                      <span class="bp-prob-hint-explanation">
                        {hint.explanation}
                      </span>
                      <span class="bp-prob-hint-fix">{hint.fix}</span>
                      {hint.action && (
                        <span
                          role="button"
                          tabIndex={0}
                          class="bp-prob-hint-action"
                          onClick={(e) => {
                            // Stop the parent <button> from also firing
                            // (which would jump to the source line) — the
                            // user clicked the action, not the row.
                            e.stopPropagation();
                            runHintAction(hint.action!);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              runHintAction(hint.action!);
                            }
                          }}
                        >
                          <Download size={11} strokeWidth={1.8} />
                          {hint.action.label}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function BottomPanel() {
  if (!bottomPanelOpen.value) {
    // Derive the hint from the keybindings registry so a rebind to e.g.
    // Ctrl+J updates the prompt without anyone editing this string.
    const toggleBinding = keybindings.find(
      (k) => k.id === "view.toggleBottomPanel",
    );
    const hint = toggleBinding
      ? `Show panel (${toggleBinding.combo})`
      : "Show panel";
    return (
      <div class="bp-collapsed">
        <button class="bp-expand" onClick={() => (bottomPanelOpen.value = true)}>
          <ChevronUp size={14} strokeWidth={1.5} />
          {hint}
        </button>
      </div>
    );
  }
  return (
    <section class="bp">
      <ResizeHandle
        spec={BOTTOM_PANEL}
        axis="y"
        direction={-1}
        variant="resize-handle-bottom"
        label="Resize the bottom panel"
      />
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
      <div
        class={`bp-body ${
          FLUSH_TABS.has(bottomPanelTab.value) ? "bp-body-flush" : ""
        }`}
      >
        {bottomPanelTab.value === "output" && <OutputView />}
        {bottomPanelTab.value === "serial" && <SerialMonitor />}
        {bottomPanelTab.value === "plotter" && <SerialPlotter />}
        {bottomPanelTab.value === "problems" && <ProblemsView />}
      </div>
    </section>
  );
}
