import "./LeftRail.css";
import { activeRail, type RailIcon } from "../state/appState";

interface RailItem {
  id: RailIcon;
  icon: string;
  label: string;
}

const MAIN_ITEMS: RailItem[] = [
  { id: "home", icon: "⌂", label: "Home" },
  { id: "files", icon: "⎘", label: "Files" },
  { id: "examples", icon: "☰", label: "Examples" },
  { id: "search", icon: "⌕", label: "Search" },
  { id: "libraries", icon: "⬡", label: "Libraries" },
  { id: "boards", icon: "◆", label: "Boards" },
];

const HELP_ITEMS: RailItem[] = [
  { id: "walkthrough", icon: "?", label: "Walkthrough" },
  { id: "settings", icon: "⚙", label: "Settings" },
];

export function LeftRail() {
  return (
    <nav class="rail" aria-label="primary navigation">
      <div class="rail-section">
        {MAIN_ITEMS.map((item) => (
          <button
            class={`rail-item ${activeRail.value === item.id ? "active" : ""}`}
            onClick={() => (activeRail.value = item.id)}
            title={item.label}
          >
            <span class="rail-icon">{item.icon}</span>
            <span class="rail-label">{item.label}</span>
          </button>
        ))}
      </div>
      <div class="rail-section rail-section-footer">
        <div class="rail-divider">HELP</div>
        {HELP_ITEMS.map((item) => (
          <button
            class={`rail-item ${activeRail.value === item.id ? "active" : ""}`}
            onClick={() => (activeRail.value = item.id)}
          >
            <span class="rail-icon">{item.icon}</span>
            <span class="rail-label">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
