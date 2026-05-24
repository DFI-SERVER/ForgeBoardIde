import { openUrl } from "@tauri-apps/plugin-opener";
import { Modal } from "./Modal";
import { toast } from "../state/appState";
import "./HelpDialogs.css";

/** App version — kept here so the About box and any future "check for updates"
 *  surface read the same source. */
export const APP_VERSION = "0.1.0";

/** About ForgeBoard — app name + version + open-source credits. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="About ForgeBoard IDE" onClose={onClose}>
      <div class="about-name">ForgeBoard IDE</div>
      <div class="about-version">Version {APP_VERSION}</div>
      <div class="about-line">
        An Arduino-compatible IDE for ESP32 development boards.
      </div>
      <div class="about-line about-line-dim">Defence Forge Industries</div>

      <div class="about-credits">
        <div class="about-credits-title">Open-source components</div>
        <div class="about-credits-line">
          ForgeBoard IDE bundles the unmodified{" "}
          <a
            class="about-credits-link"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              openUrl("https://github.com/arduino/arduino-cli").catch(() => {
                toast.value = {
                  text: "Couldn't open the link. The URL is github.com/arduino/arduino-cli.",
                  kind: "warn",
                };
              });
            }}
          >
            Arduino CLI
          </a>{" "}
          by Arduino SA, licensed under the GNU General Public License v3.0.
          The full license is shipped alongside the binary.
        </div>
        <div class="about-credits-line about-credits-line-dim">
          ForgeBoard is not affiliated with or endorsed by Arduino SA.
        </div>
      </div>
    </Modal>
  );
}
