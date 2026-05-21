import "./LeftRail.css";
import { activeRail, type RailIcon } from "../state/appState";
import {
  House,
  Files,
  GraduationCap,
  Search,
  Library,
  CircuitBoard,
  Compass,
  Settings,
} from "lucide-preact";

type LucideIcon = typeof House;

interface RailItem {
  id: RailIcon;
  Icon: LucideIcon;
  label: string;
}

const MAIN_ITEMS: RailItem[] = [
  { id: "home", Icon: House, label: "Home" },
  { id: "files", Icon: Files, label: "Files" },
  { id: "examples", Icon: GraduationCap, label: "Examples" },
  { id: "search", Icon: Search, label: "Search" },
  { id: "libraries", Icon: Library, label: "Libraries" },
  { id: "boards", Icon: CircuitBoard, label: "Boards" },
];

const HELP_ITEMS: RailItem[] = [
  { id: "walkthrough", Icon: Compass, label: "Walkthrough" },
  { id: "settings", Icon: Settings, label: "Settings" },
];

function RailButton({ item }: { item: RailItem }) {
  const { Icon } = item;
  return (
    <button
      class={`rail-item ${activeRail.value === item.id ? "active" : ""}`}
      onClick={() => (activeRail.value = item.id)}
      title={item.label}
    >
      <Icon size={20} strokeWidth={1.5} />
    </button>
  );
}

export function LeftRail() {
  return (
    <nav class="rail" aria-label="primary navigation">
      <div class="rail-section">
        {MAIN_ITEMS.map((item) => (
          <RailButton item={item} />
        ))}
      </div>
      <div class="rail-section rail-section-footer">
        {HELP_ITEMS.map((item) => (
          <RailButton item={item} />
        ))}
      </div>
    </nav>
  );
}
