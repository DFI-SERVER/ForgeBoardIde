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
