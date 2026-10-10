import { useEffect, useState } from "preact/hooks";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Modal } from "@/shared/components/Modal";
import { toast } from "@/app/state";
import { correctionsApi, type CorrectionInfo } from "@/ipc/corrections";
import "./HelpDialogs.css";

/** App version — kept here so the About box and any future "check for updates"
 *  surface read the same source. */
export const APP_VERSION = "0.2.2";

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

      <ActiveCorrections />
    </Modal>
  );
}

/**
 * Disclosure block listing platform corrections currently applied. Shown
 * inside the About dialog so users can always see what overlay files
 * ForgeBoard wrote into their arduino-cli platform directories. Only the
 * `active` corrections show — pending / not-applicable ones live in
 * Settings, which is the place to triage them.
 */
function ActiveCorrections() {
  const [list, setList] = useState<CorrectionInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    correctionsApi
      .list()
      .then((next) => {
        if (!cancelled) setList(next.filter((c) => c.active));
      })
      .catch(() => {
        if (!cancelled) setList([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (list.length === 0) return null;
  return (
    <div class="about-corrections">
      <div class="about-corrections-title">
        Platform corrections applied ({list.length})
      </div>
      {list.map((c) => (
        <div key={c.id} class="about-corrections-line">
          <span class="about-corrections-id">{c.id}</span>
          <span class="about-corrections-target"> · {c.target}</span>
        </div>
      ))}
    </div>
  );
}
