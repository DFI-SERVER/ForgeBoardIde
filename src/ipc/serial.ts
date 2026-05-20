import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { serialLog, serialConnected } from "../state/appState";

export interface SerialLine {
  ts: number;
  text: string;
}

/** Frontend wrapper around the serial Tauri commands. */
export const serialApi = {
  open: (port: string, baud: number) => invoke<void>("serial_open", { port, baud }),
  close: () => invoke<void>("serial_close"),
  write: (bytes: number[]) => invoke<void>("serial_write", { bytes }),
  isOpen: () => invoke<boolean>("serial_is_open"),
};

let listenersInstalled = false;

/**
 * Install the serial event listeners once, app-wide. Done outside the
 * SerialMonitor component so incoming lines are never lost while the
 * Serial Monitor tab is not mounted.
 */
export async function ensureSerialListeners(): Promise<void> {
  if (listenersInstalled) return;
  listenersInstalled = true;

  await listen<SerialLine>("serial-line", (e) => {
    serialLog.value = [
      ...serialLog.value,
      { ts: e.payload.ts, text: e.payload.text, kind: "rx" },
    ];
  });
  await listen<string>("serial-disconnected", (e) => {
    serialConnected.value = false;
    serialLog.value = [
      ...serialLog.value,
      { ts: Date.now(), text: `[disconnected from ${e.payload}]`, kind: "info" },
    ];
  });
  await listen<string>("serial-error", (e) => {
    serialLog.value = [
      ...serialLog.value,
      { ts: Date.now(), text: `[error: ${e.payload}]`, kind: "info" },
    ];
  });
}
