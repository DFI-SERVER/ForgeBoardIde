/**
 * Setup check — runs the platform preflight (Rosetta, internet, disk, tools,
 * board core, drivers, permissions) and decides whether to open the dialog
 * on its own at startup.
 *
 * Pure decisions live here and are unit-tested; the dialog only renders.
 */
import { signal } from "@preact/signals";
import { setupApi, type SetupCheck } from "@/ipc/setup";

export const setupChecks = signal<SetupCheck[]>([]);
export const setupCheckOpen = signal<boolean>(false);
export const setupCheckRunning = signal<boolean>(false);

const DISMISSED_KEY = "fb-setup-dismissed";

/** Warn-level check ids the user chose not to be reminded about. */
export function readDismissed(storage: Pick<Storage, "getItem"> = localStorage): string[] {
  try {
    const raw = storage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeDismissed(ids: string[], storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(DISMISSED_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable — the dialog simply shows again next launch */
  }
}

/**
 * Open automatically when something blocks the build (`fail`), or when a
 * `warn` item is present that the user has not dismissed before. `ok` and
 * `info` never open the dialog by themselves.
 */
export function shouldAutoOpen(checks: SetupCheck[], dismissed: string[]): boolean {
  return checks.some(
    (c) => c.status === "fail" || (c.status === "warn" && !dismissed.includes(c.id)),
  );
}

/** Ids worth remembering as dismissed: the warn items currently shown. */
export function warnIds(checks: SetupCheck[]): string[] {
  return checks.filter((c) => c.status === "warn").map((c) => c.id);
}

/** Run the checks; never throws (a failed check run must not block startup). */
export async function runSetupCheck(): Promise<SetupCheck[]> {
  setupCheckRunning.value = true;
  try {
    const checks = await setupApi.check();
    setupChecks.value = checks;
    return checks;
  } catch (e) {
    console.error("setup check failed:", e);
    return setupChecks.value;
  } finally {
    setupCheckRunning.value = false;
  }
}

/** Startup entry: run, then open the dialog only if it has something to say. */
export async function runSetupCheckAtStartup(): Promise<void> {
  const checks = await runSetupCheck();
  if (shouldAutoOpen(checks, readDismissed())) {
    setupCheckOpen.value = true;
  }
}
