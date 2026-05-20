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

export const projectApi = {
  sketchesRoot: () => invoke<string>("project_sketches_root"),
  open: (path: string) => invoke<Sketch>("project_open", { path }),
  create: (name: string) => invoke<Sketch>("project_create", { name }),
  readFile: (path: string) => invoke<string>("project_read_file", { path }),
  saveFile: (path: string, contents: string) =>
    invoke<void>("project_save_file", { path, contents }),
  listRecent: () => invoke<RecentProject[]>("project_list_recent"),
};
