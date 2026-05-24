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
export interface Library {
  name: string;
  author?: string;
  /** One-line description. */
  sentence?: string;
  /** Longer description. */
  paragraph?: string;
  website?: string;
  category?: string;
  /** Version installed locally — absent for registry-only search results. */
  installed_version?: string;
  /** Newest version available. */
  latest_version?: string;
  /** True when a newer version than installed_version is available. */
  update_available: boolean;
}

/** An example sketch discovered inside an installed library's `examples/` folder. */
export interface LibraryExample {
  /** The example's folder name, e.g. "Blink". */
  name: string;
  /** The library the example belongs to, e.g. "Adafruit NeoPixel". */
  library: string;
  /** Absolute path to the example's main `.ino` file. */
  ino_path: string;
  /** Absolute path to the example's folder. */
  folder_path: string;
}

/** Frontend wrapper around the arduino-cli Tauri commands and streaming events. */
export const arduinoApi = {
  listBoards: () => invoke<Board[]>("arduino_list_boards"),
  detectPorts: () => invoke<DetectedBoard[]>("arduino_detect_ports"),
  /** Compile a sketch. `verbose` runs arduino-cli with `-v` for a full build log.
   *  `profile`, when set, runs the build under a named `sketch.yaml` profile
   *  via `--profile <name>` — the profile owns the FQBN in that mode. */
  compile: (
    sketch: string,
    fqbn: string,
    verbose: boolean,
    profile?: string | null,
  ) =>
    invoke<CompileResult>("arduino_compile", {
      sketch,
      fqbn,
      verbose,
      profile: profile ?? null,
    }),
  /** Compile and flash to `port`. `verbose` runs arduino-cli with `-v`.
   *  `profile`, when set, runs the build under a named `sketch.yaml` profile
   *  via `--profile <name>` — the profile owns the FQBN in that mode. */
  upload: (
    sketch: string,
    fqbn: string,
    port: string,
    verbose: boolean,
    profile?: string | null,
  ) =>
    invoke<UploadResult>("arduino_upload", {
      sketch,
      fqbn,
      port,
      verbose,
      profile: profile ?? null,
    }),
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

  /** Search the Arduino library registry (capped result set). */
  libSearch: (query: string) => invoke<Library[]>("arduino_lib_search", { query }),
  /** Fetch the entire Arduino library registry — uncapped, ~9000+ entries. */
  libListAll: () => invoke<Library[]>("arduino_lib_list_all"),
  /** List libraries installed locally, with update info merged in. */
  libListInstalled: () => invoke<Library[]>("arduino_lib_list_installed"),
  /** Install (or, with an `@version` suffix, upgrade) a registry library. */
  libInstall: (name: string) => invoke<number>("arduino_lib_install", { name }),
  /** Uninstall an installed library by name. */
  libUninstall: (name: string) => invoke<number>("arduino_lib_uninstall", { name }),
  /** Install a library from a local .zip archive. */
  libInstallZip: (zipPath: string) => invoke<number>("arduino_lib_install_zip", { zipPath }),
  /** Subscribe to streamed lib install/uninstall progress lines. */
  onLibInstallOutput: (cb: (line: string) => void) =>
    listen<string>("lib-install-output", (e) => cb(e.payload)),

  /** List example sketches found in installed libraries' `examples/` folders. */
  listLibraryExamples: () =>
    invoke<LibraryExample[]>("arduino_list_library_examples"),
};
