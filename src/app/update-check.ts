/**
 * Self-update — the student side of the release pipeline.
 *
 * On every launch (a few seconds after the Setup check) the app asks the
 * updater whether a newer signed release exists. If so, a dialog shows the
 * version and notes and waits for consent; nothing downloads or installs
 * until "Update now". "Later" hides it for this session only, so the offer
 * returns next launch. Help → "Check for updates…" runs the same check by
 * hand and also reports "up to date" and errors, which the silent startup
 * check swallows.
 */
import { signal } from "@preact/signals";
import { toast } from "@/app/state";
import { updaterApi, type AvailableUpdate } from "@/ipc/updater";

export const availableUpdate = signal<AvailableUpdate | null>(null);
export const updateDialogOpen = signal<boolean>(false);
export const updateChecking = signal<boolean>(false);
/** Download progress while installing, or null. */
export const updateProgress = signal<{ downloaded: number; total: number | null } | null>(null);
export const updateInstalling = signal<boolean>(false);

/** Versions the user clicked "Later" on this session. */
const skippedThisSession = new Set<string>();

/** Delay before the silent startup check, so it never competes with the
 *  first-launch tool download or the Setup check for attention. */
export const STARTUP_CHECK_DELAY_MS = 6000;

/** Numeric dotted-version compare: 0.2.0 > 0.1.1, 0.10.0 > 0.9.9. */
export function isNewer(candidate: string, current: string): boolean {
  const seg = (v: string) => v.replace(/^v/, "").split(/[.-]/).map((p) => parseInt(p, 10) || 0);
  const a = seg(candidate);
  const b = seg(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Run one check. `manual` is true from the Help menu: then "up to date" and
 * errors are reported; at startup they stay silent. Returns the update, if any.
 */
export async function runUpdateCheck(manual = false): Promise<AvailableUpdate | null> {
  if (updateChecking.value || updateInstalling.value) return null;
  updateChecking.value = true;
  try {
    const update = await updaterApi.check();
    if (!update || !isNewer(update.version, update.currentVersion)) {
      if (manual) toast.value = { text: "Flow State is up to date.", kind: "info" };
      return null;
    }
    availableUpdate.value = update;
    if (manual || !skippedThisSession.has(update.version)) updateDialogOpen.value = true;
    return update;
  } catch (e) {
    if (manual) toast.value = { text: `Couldn't check for updates: ${String(e)}`, kind: "warn" };
    return null;
  } finally {
    updateChecking.value = false;
  }
}

/** "Later": close for this session; the offer comes back next launch. */
export function skipUpdateForNow(): void {
  const v = availableUpdate.value?.version;
  if (v) skippedThisSession.add(v);
  updateDialogOpen.value = false;
}

/** "Update now": download, verify, install, relaunch. Never throws; a
 *  failure is shown and the dialog stays open for a retry. */
export async function installAvailableUpdate(): Promise<void> {
  const update = availableUpdate.value;
  if (!update || updateInstalling.value) return;
  updateInstalling.value = true;
  updateProgress.value = { downloaded: 0, total: null };
  try {
    await update.install((downloaded, total) => {
      updateProgress.value = { downloaded, total };
    });
    toast.value = { text: `Installed Flow State ${update.version}. Restarting…`, kind: "success" };
    await updaterApi.relaunch();
  } catch (e) {
    toast.value = { text: `Update failed: ${String(e)}. Nothing was changed.`, kind: "warn" };
    updateProgress.value = null;
    updateInstalling.value = false;
  }
}

/** Startup entry: wait, then check quietly. */
export function runUpdateCheckAtStartup(delayMs = STARTUP_CHECK_DELAY_MS): void {
  setTimeout(() => void runUpdateCheck(false), delayMs);
}

/** For tests. */
export function _resetUpdateState(): void {
  skippedThisSession.clear();
  availableUpdate.value = null;
  updateDialogOpen.value = false;
  updateChecking.value = false;
  updateProgress.value = null;
  updateInstalling.value = false;
}
