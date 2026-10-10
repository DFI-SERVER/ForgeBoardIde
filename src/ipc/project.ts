import { invoke } from "@tauri-apps/api/core";

export interface SketchFile {
  name: string;
  path: string;
  is_main: boolean;
}
export interface Sketch {
  name: string;
  path: string;
  files: SketchFile[];
}
export interface RecentProject {
  name: string;
  path: string;
  last_opened: number;
}
export interface SketchbookInfo {
  /** The user's explicit folder choice, or null when using the default. */
  custom: string | null;
  /** Where new sketches and opened examples actually go right now. */
  effective: string;
}

/** One reproducible-build profile, as advertised by a sketch's `sketch.yaml`. */
export interface ProfileInfo {
  name: string;
  fqbn: string;
  /** Optional free-form note from the YAML. */
  notes?: string;
}

/** Full parsed view of a sketch's `sketch.yaml`. Null result = file absent. */
export interface SketchProfiles {
  profiles: ProfileInfo[];
  /** The `default_profile` key from the YAML, if set. */
  default_profile?: string;
}

export const projectApi = {
  sketchesRoot: () => invoke<string>("project_sketches_root"),
  open: (path: string) => invoke<Sketch>("project_open", { path }),
  create: (name: string, location?: string | null) =>
    invoke<Sketch>("project_create", { name, location: location ?? null }),
  readFile: (path: string) => invoke<string>("project_read_file", { path }),
  saveFile: (path: string, contents: string) =>
    invoke<void>("project_save_file", { path, contents }),
  listRecent: () => invoke<RecentProject[]>("project_list_recent"),
  /** Move a file or folder to the OS recycle bin (recoverable). */
  deletePath: (path: string) => invoke<void>("project_delete_path", { path }),
  /** Rename a file/folder in place; resolves to the new absolute path. */
  renamePath: (path: string, newName: string) =>
    invoke<string>("project_rename_path", { path, newName }),
  /** Create a new empty file in `dir`; resolves to its absolute path. */
  createFile: (dir: string, name: string) =>
    invoke<string>("project_create_file", { dir, name }),
  /** Create a new folder in `dir`; resolves to its absolute path. */
  createFolder: (dir: string, name: string) =>
    invoke<string>("project_create_folder", { dir, name }),
  /** The sketchbook location — the user's choice (if any) and the effective root. */
  sketchbookGet: () => invoke<SketchbookInfo>("project_sketchbook_get"),
  /** Set the sketchbook folder, or pass null to restore the default;
   *  resolves to the new effective root. */
  sketchbookSet: (path: string | null) =>
    invoke<string>("project_sketchbook_set", { path }),
  /** Zip a sketch folder to `dest` (a .zip path the user picked). */
  archiveSketch: (sketchDir: string, dest: string) =>
    invoke<void>("project_archive_sketch", { sketchDir, dest }),
  /** Read reproducible-build profiles from a sketch's `sketch.yaml`.
   *  Resolves to `null` when the sketch has no `sketch.yaml`. */
  readProfiles: (sketchPath: string) =>
    invoke<SketchProfiles | null>("project_read_profiles", { sketchPath }),
};
