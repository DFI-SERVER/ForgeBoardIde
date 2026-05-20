import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface Board {
  fqbn: string;
  name: string;
  platform: string;
}
export interface DetectedBoard {
  port: string;
  fqbn?: string;
  name?: string;
}
export interface CompileResult {
  success: boolean;
  exit_code: number;
  stderr: string;
}
export interface UploadResult {
  success: boolean;
  exit_code: number;
  stderr: string;
}
export interface Core {
  id: string;
  name: string;
  version?: string;
  maintainer?: string;
  installed: boolean;
}
export interface BoardId {
  fqbn: string;
  name: string;
  source: string;
}

/** Frontend wrapper around the arduino-cli Tauri commands and streaming events. */
export const arduinoApi = {
  listBoards: () => invoke<Board[]>("arduino_list_boards"),
  detectPorts: () => invoke<DetectedBoard[]>("arduino_detect_ports"),
  compile: (sketch: string, fqbn: string) =>
    invoke<CompileResult>("arduino_compile", { sketch, fqbn }),
  upload: (sketch: string, fqbn: string, port: string) =>
    invoke<UploadResult>("arduino_upload", { sketch, fqbn, port }),
  onCompileOutput: (cb: (line: string) => void) =>
    listen<string>("compile-output", (e) => cb(e.payload)),
  onUploadOutput: (cb: (line: string) => void) =>
    listen<string>("upload-output", (e) => cb(e.payload)),
  listCores: () => invoke<Core[]>("arduino_list_cores"),
  searchCores: (query: string) => invoke<Core[]>("arduino_search_cores", { query }),
  installCore: (coreId: string) => invoke<number>("arduino_install_core", { coreId }),
  updateIndex: () => invoke<void>("arduino_update_index"),
  identifyBoard: (port: string) => invoke<BoardId>("arduino_identify_board", { port }),
  onCoreInstallOutput: (cb: (line: string) => void) =>
    listen<string>("core-install-output", (e) => cb(e.payload)),
};
