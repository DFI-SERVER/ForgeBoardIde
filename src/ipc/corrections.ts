import { invoke } from "@tauri-apps/api/core";

/**
 * Frontend wrappers for the `corrections_*` Tauri commands.
 *
 * "Corrections" are small overlay files (boards.local.txt / platform.local.txt)
 * that ForgeBoard drops into installed arduino-cli platform directories to
 * patch known upstream bugs (today: ESP32-S3 native-USB upload). The IDE
 * applies them automatically on launch when the "Apply platform corrections"
 * setting is enabled, and removes them if the user turns the setting off.
 */

/** A bundled correction + its current runtime status. */
export interface CorrectionInfo {
  /** Stable identifier — e.g. `esp32-esp32-usb-reset`. */
  id: string;
  /** Short human-readable title for the Settings / About listings. */
  title: string;
  /** Plain-English explanation of the upstream bug being patched. */
  reason: string;
  /** `vendor:arch` of the targeted platform — e.g. `esp32:esp32`. */
  target: string;
  /** Version glob this correction applies to (e.g. `3.3.*`). */
  versionPattern: string;
  /** Optional URL to the upstream tracker — surfaced in About so users can
   *  follow along upstream. */
  upstreamIssue: string | null;
  /** `true` when an installed platform version matches the target pattern. */
  matchesInstalled: boolean;
  /** `true` when the overlay files are currently written to disk. Drives the
   *  "Active" badge in the UI. */
  active: boolean;
  /** Absolute path to the matched platform directory, or null when no
   *  installed version matches. */
  platformDir: string | null;
}

/**
 * Snake_case → camelCase translation for the Tauri payload. Rust serialises
 * with serde's default naming (snake_case-ish) and we surface camelCase here
 * to stay consistent with the rest of the TS side.
 */
interface CorrectionInfoWire {
  id: string;
  title: string;
  reason: string;
  target: string;
  version_pattern: string;
  upstream_issue: string | null;
  matches_installed: boolean;
  active: boolean;
  platform_dir: string | null;
}

function toCorrectionInfo(w: CorrectionInfoWire): CorrectionInfo {
  return {
    id: w.id,
    title: w.title,
    reason: w.reason,
    target: w.target,
    versionPattern: w.version_pattern,
    upstreamIssue: w.upstream_issue,
    matchesInstalled: w.matches_installed,
    active: w.active,
    platformDir: w.platform_dir,
  };
}

export const correctionsApi = {
  /** Read-only snapshot of every bundled correction + its current status. */
  list: async (): Promise<CorrectionInfo[]> => {
    const raw = await invoke<CorrectionInfoWire[]>("corrections_list");
    return raw.map(toCorrectionInfo);
  },

  /** Write the overlay files for every correction whose target matches an
   *  installed platform. Resolves to the IDs of corrections that were newly
   *  written (existing identical files are skipped — idempotent). */
  apply: () => invoke<string[]>("corrections_apply"),

  /** Delete every overlay file ForgeBoard would otherwise apply, restoring
   *  the vendor's shipped behaviour. Idempotent — repeated calls are no-ops. */
  remove: () => invoke<string[]>("corrections_remove"),
};
