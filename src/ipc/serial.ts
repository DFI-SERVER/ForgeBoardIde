import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { appendSerialLog, serialConnected } from "../state/appState";

export interface SerialLine {
  ts: number;
  text: string;
}

/** Frontend wrapper around the serial Tauri commands. The Rust side keys the
 *  connection on the calling window's label, so each IDE window owns its own
 *  port — no parameters needed here. */
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
 *
 * Listens on THIS window's event target, not globally: the backend addresses
 * serial events to the window that owns the connection, and a global listener
 * would also pick up every other window's traffic.
 */
export async function ensureSerialListeners(): Promise<void> {
  if (listenersInstalled) return;
  listenersInstalled = true;
  const thisWindow = getCurrentWebviewWindow();

  await thisWindow.listen<SerialLine>("serial-line", (e) => {
    appendSerialLog({ ts: e.payload.ts, text: e.payload.text, kind: "rx" });
  });
  await thisWindow.listen<string>("serial-disconnected", (e) => {
    serialConnected.value = false;
    appendSerialLog({
      ts: Date.now(),
      text: `[disconnected from ${e.payload}]`,
      kind: "info",
    });
  });
  await thisWindow.listen<string>("serial-error", (e) => {
    appendSerialLog({ ts: Date.now(), text: `[error: ${e.payload}]`, kind: "info" });
  });
}
