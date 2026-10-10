import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

/**
 * Frontend wrapper around the Tauri updater: one GET to the endpoint baked
 * into tauri.conf.json (`latest.json` on the public release repo), a
 * signature-verified download, install, relaunch. Wrapped so the app logic
 * and its tests never touch the plugin directly.
 */

export interface AvailableUpdate {
  version: string;
  currentVersion: string;
  /** Release notes, as written in the GitHub release. */
  notes: string;
  date: string | null;
  /** Download, verify the signature and install. `onProgress` receives
   *  bytes downloaded and total (null when the server sends no length). */
  install: (onProgress: (downloaded: number, total: number | null) => void) => Promise<void>;
}

export const updaterApi = {
  currentVersion: () => getVersion(),

  /** Resolves to the update when a newer signed release exists, else null. */
  check: async (): Promise<AvailableUpdate | null> => {
    const update = await check();
    if (!update) return null;
    return {
      version: update.version,
      currentVersion: update.currentVersion,
      notes: update.body ?? "",
      date: update.date ?? null,
      install: async (onProgress) => {
        let downloaded = 0;
        let total: number | null = null;
        await update.downloadAndInstall((event) => {
          if (event.event === "Started") {
            total = event.data.contentLength ?? null;
            onProgress(0, total);
          } else if (event.event === "Progress") {
            downloaded += event.data.chunkLength;
            onProgress(downloaded, total);
          } else if (event.event === "Finished") {
            onProgress(total ?? downloaded, total);
          }
        });
      },
    };
  },

  relaunch: () => relaunch(),
};
