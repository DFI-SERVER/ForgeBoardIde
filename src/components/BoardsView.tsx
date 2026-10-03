import { useEffect } from "preact/hooks";
import { arduinoApi } from "../ipc/arduino";
import {
  installedCores,
  installedBoards,
  detectedPorts,
  coreInstallProgress,
  coreInstallRunning,
} from "../state/appState";
import { connectToPort } from "../lib/connection";
import "./BoardsView.css";

/** Curated cores offered for one-click install. `url` is the vendor's
 *  board-manager index — REQUIRED for anything outside Arduino's default
 *  package index, or arduino-cli can't resolve the platform at all.
 *  `arduino:avr` ships in the default index, so it carries no URL. */
const CURATED_CATALOG: { id: string; name: string; platform: string; url?: string }[] = [
  {
    id: "esp32:esp32",
    name: "ESP32 (incl. ForgeBoard, S3, WROOM)",
    platform: "Espressif",
    url: "https://espressif.github.io/arduino-esp32/package_esp32_index.json",
  },
  {
    id: "esp8266:esp8266",
    name: "ESP8266 (NodeMCU, Wemos D1)",
    platform: "Espressif",
    url: "https://arduino.esp8266.com/stable/package_esp8266com_index.json",
  },
  { id: "arduino:avr", name: "Arduino AVR (Uno, Nano, Mega)", platform: "Arduino" },
  {
    id: "rp2040:rp2040",
    name: "Raspberry Pi Pico (RP2040)",
    platform: "earlephilhower",
    url: "https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json",
  },
  {
    id: "STMicroelectronics:stm32",
    name: "STM32 (Nucleo, Black Pill)",
    platform: "STMicroelectronics",
    url: "https://github.com/stm32duino/BoardManagerFiles/raw/main/package_stmicroelectronics_index.json",
  },
  {
    id: "teensy:avr",
    name: "Teensy 2.0 / 3.x / 4.x / LC",
    platform: "PJRC",
    url: "https://www.pjrc.com/teensy/package_teensy_index.json",
  },
  {
    id: "Seeeduino:xiao_samd",
    name: "Seeed XIAO SAMD21 / M0",
    platform: "Seeed",
    url: "https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json",
  },
];

export function BoardsView() {
  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    try {
      installedCores.value = await arduinoApi.listCores();
      installedBoards.value = await arduinoApi.listBoards();
      detectedPorts.value = await arduinoApi.detectPorts();
    } catch (e) {
      console.error("BoardsView refresh failed:", e);
    }
  }

  async function install(coreId: string) {
    if (coreInstallRunning.value) return;
    coreInstallRunning.value = coreId;
    coreInstallProgress.value = [`Installing ${coreId}...`];
    // The listener subscription must live INSIDE the try so a failing
    // onCoreInstallOutput (e.g. Tauri IPC error during event registration)
    // still releases the install lock through `finally`. Without this, the
    // attach reject escapes early and coreInstallRunning stays pinned to
    // the coreId, disabling every Install button permanently.
    let unlisten: () => void = () => {};
    try {
      unlisten = await arduinoApi.onCoreInstallOutput((line) => {
        coreInstallProgress.value = [...coreInstallProgress.value, line];
      });
      const entry = CURATED_CATALOG.find((c) => c.id === coreId);
      const code = await arduinoApi.installCore(coreId, entry?.url ?? null);
      coreInstallProgress.value = [
        ...coreInstallProgress.value,
        code === 0 ? `✓ Installed ${coreId}` : `✗ Install failed (exit ${code})`,
      ];
      await refresh();
    } catch (e) {
      coreInstallProgress.value = [...coreInstallProgress.value, `✗ Error: ${String(e)}`];
    } finally {
      unlisten();
      coreInstallRunning.value = null;
    }
  }

  const installedIds = new Set(installedCores.value.map((c) => c.id));
  const available = CURATED_CATALOG.filter((c) => !installedIds.has(c.id));

  return (
    <div class="bv">
      <div class="bv-header">
        <span class="bv-title">Boards</span>
        <span class="bv-stats">
          connected {detectedPorts.value.length} · installed {installedCores.value.length}
        </span>
      </div>

      <div class="bv-body">
        <div class="bv-section-label">CONNECTED</div>
        {detectedPorts.value.length === 0 ? (
          <div class="bv-empty">No boards plugged in.</div>
        ) : (
          detectedPorts.value.map((p) => (
            <div key={p.port} class="bv-row bv-row-connected">
              <span class="bv-dot connected" />
              <div class="bv-row-main">
                <div class="bv-row-name">{p.name ?? p.fqbn ?? "Unknown board"}</div>
                <div class="bv-row-meta">
                  {p.port}
                  {p.fqbn ? " · " + p.fqbn : ""}
                </div>
              </div>
              <button
                class="bv-row-action"
                onClick={() => void connectToPort(p.port)}
              >
                select
              </button>
            </div>
          ))
        )}

        <div class="bv-section-label">INSTALLED CORES · {installedCores.value.length}</div>
        {installedCores.value.length === 0 ? (
          <div class="bv-empty">No cores installed.</div>
        ) : (
          installedCores.value.map((c) => (
            <div key={c.id} class="bv-row">
              <span class="bv-dot idle" />
              <div class="bv-row-main">
                <div class="bv-row-name">{c.name}</div>
                <div class="bv-row-meta">
                  {c.id} · {c.version ?? "?"}
                </div>
              </div>
              <span class="bv-row-status">installed</span>
            </div>
          ))
        )}

        <div class="bv-section-label">AVAILABLE · installs on demand</div>
        {available.map((c) => (
          <div key={c.id} class="bv-row">
            <span class="bv-dot dim" />
            <div class="bv-row-main">
              <div class="bv-row-name">{c.name}</div>
              <div class="bv-row-meta">
                {c.platform} · {c.id}
              </div>
            </div>
            <button
              class="bv-row-install"
              disabled={!!coreInstallRunning.value}
              onClick={() => install(c.id)}
            >
              {coreInstallRunning.value === c.id ? "installing…" : "install core →"}
            </button>
          </div>
        ))}

        {coreInstallProgress.value.length > 0 && (
          <div class="bv-install-log">
            <div class="bv-section-label">INSTALL LOG</div>
            {coreInstallProgress.value.slice(-14).map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
