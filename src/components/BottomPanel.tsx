import "./BottomPanel.css";
import { bottomPanelTab, bottomPanelOpen, problemsCount } from "../state/appState";

const TABS = [
  { id: "serial", label: "Serial Monitor" },
  { id: "output", label: "Output" },
  { id: "plotter", label: "Plotter" },
  { id: "problems", label: "Problems" },
] as const;

export function BottomPanel() {
  if (!bottomPanelOpen.value) {
    return (
      <div class="bp-collapsed">
        <button class="bp-expand" onClick={() => (bottomPanelOpen.value = true)}>
          ▲ Show panel (Ctrl+`)
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
          ▼
        </button>
      </div>
      <div class="bp-body">
        <div class="bp-placeholder">
          {bottomPanelTab.value === "serial" && "Serial Monitor — arrives in Phase 5."}
          {bottomPanelTab.value === "output" && "Compile output — arrives in Phase 4."}
          {bottomPanelTab.value === "plotter" && "Serial Plotter — arrives in Phase 11."}
          {bottomPanelTab.value === "problems" &&
            "Problems list — arrives with Smart Help in Phase 6."}
        </div>
      </div>
    </section>
  );
}
