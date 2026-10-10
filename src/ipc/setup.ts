import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

/**
 * Frontend wrapper for the setup check ("preflight"): what this machine
 * needs before ForgeBoard can build and flash. All platform knowledge is on
 * the Rust side; this file only types the payload.
 */

export type CheckStatus = "ok" | "warn" | "fail" | "info";

export interface SetupFix {
  /** `auto`: the app can run it. `command`: copy into a terminal.
   *  `install-core`: jump to the Boards view. `url`: a vendor page. */
  kind: "auto" | "command" | "install-core" | "url";
  label: string;
  command: string | null;
  url: string | null;
}

export interface SetupCheck {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  fix: SetupFix | null;
}

export const setupApi = {
  check: () => invoke<SetupCheck[]>("setup_check"),
  /** Run an `auto` fix by check id. Resolves to the exit code. */
  fix: (id: string) => invoke<number>("setup_fix", { id }),
  /** Subscribe to the fix's streamed output on this window. */
  onFixOutput: (cb: (line: string) => void) =>
    getCurrentWebviewWindow().listen<string>("setup-fix-output", (e) => cb(e.payload)),
};
