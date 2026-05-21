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

const CURATED_CATALOG: { id: string; name: string; platform: string }[] = [
  { id: "esp32:esp32", name: "ESP32 (incl. ForgeBoard, S3, WROOM)", platform: "Espressif" },
  { id: "esp8266:esp8266", name: "ESP8266 (NodeMCU, Wemos D1)", platform: "Espressif" },
  { id: "arduino:avr", name: "Arduino AVR (Uno, Nano, Mega)", platform: "Arduino" },
  { id: "rp2040:rp2040", name: "Raspberry Pi Pico (RP2040)", platform: "earlephilhower" },
  { id: "STMicroelectronics:stm32", name: "STM32 (Nucleo, Blue Pill)", platform: "STMicroelectronics" },
  { id: "teensy:avr", name: "Teensy 2.0 / 3.x / 4.x / LC", platform: "PJRC" },
  { id: "Seeeduino:xiao_samd", name: "Seeed XIAO SAMD21 / M0", platform: "Seeed" },
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
    const unlisten = await arduinoApi.onCoreInstallOutput((line) => {
      coreInstallProgress.value = [...coreInstallProgress.value, line];
    });
    try {
      const code = await arduinoApi.installCore(coreId);
      coreInstallProgress.value = [
        ...coreInstallProgress.value,
        code === 0 ? `✓ Installed ${coreId}` : `✗ Install failed (exit ${code})`,
      ];
      await refresh();
    } catch (e) {
      coreInstallProgress.value = [...coreInstallProgress.value, `✗ Error: ${String(e)}`];
    } finally {
      coreInstallRunning.value = null;
      unlisten();
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
