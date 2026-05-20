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
};
