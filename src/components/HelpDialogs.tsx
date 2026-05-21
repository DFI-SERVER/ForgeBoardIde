import { Modal } from "./Modal";
import "./HelpDialogs.css";

/** App version — kept here so the About box and any future "check for updates"
 *  surface read the same source. */
export const APP_VERSION = "0.1.0";

/** About ForgeBoard — app name + version. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="About ForgeBoard IDE" onClose={onClose}>
      <div class="about-name">ForgeBoard IDE</div>
      <div class="about-version">Version {APP_VERSION}</div>
      <div class="about-line">
        An Arduino-compatible IDE for ESP32 development boards.
      </div>
      <div class="about-line about-line-dim">
        Defence Forge Industries
      </div>
    </Modal>
  );
}

/** The currently-wired keyboard shortcuts. */
const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "Ctrl+N", label: "New sketch" },
  { keys: "Ctrl+O", label: "Open sketch" },
  { keys: "Ctrl+S", label: "Save" },
  { keys: "Ctrl+W", label: "Close tab" },
  { keys: "Ctrl+Tab", label: "Next tab" },
  { keys: "Ctrl+R", label: "Verify / Compile" },
  { keys: "Ctrl+U", label: "Upload" },
  { keys: "Ctrl+Z", label: "Undo" },
  { keys: "Ctrl+Y", label: "Redo" },
  { keys: "Ctrl+F", label: "Find" },
  { keys: "Ctrl+H", label: "Replace" },
];

/** Keyboard Shortcuts — a reference list of every wired shortcut. */
export function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div class="shortcuts-list">
        {SHORTCUTS.map((s) => (
          <div class="shortcuts-row" key={s.keys}>
            <span class="shortcuts-label">{s.label}</span>
            <kbd class="shortcuts-keys">{s.keys}</kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}
