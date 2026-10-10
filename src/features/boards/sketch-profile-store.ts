/**
 * Per-sketch persisted profile choice. The user's explicit ProfilePill pick
 * survives sketch swaps so re-opening a sketch restores the last-active
 * profile rather than always reverting to `default_profile`. Falls back to
 * `default_profile` when no pick is stored OR when the stored pick names a
 * profile that no longer exists.
 */
const STORAGE_KEY = "forgeboard.sketch-profiles";

type Store = Record<string, string>; // sketchPath -> profileName

function read(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Store = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota or unavailable — preferences just won't survive a restart.
  }
}

/** Read the user's last-picked profile for `sketchPath`, or null. */
export function readSketchProfile(sketchPath: string): string | null {
  return read()[sketchPath] ?? null;
}

/** Persist the user's profile pick for `sketchPath`. Pass null to clear. */
export function writeSketchProfile(
  sketchPath: string,
  profile: string | null,
): void {
  const store = read();
  if (profile === null) {
    delete store[sketchPath];
  } else {
    store[sketchPath] = profile;
  }
  write(store);
}
