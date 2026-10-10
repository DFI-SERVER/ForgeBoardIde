/**
 * Per-FQBN compile-size history — persists the last N flash-usage percentages
 * each board has produced, so the MemoryBar sparkline survives an app restart.
 *
 * Stored as a flat object `{ [fqbn]: number[] }` under one localStorage key.
 * Each entry is the flash usage percentage rounded to one decimal (0-100); a
 * board's array is capped at MAX_HISTORY_ENTRIES. The structure is hydrated
 * on boot and the signal is mirrored back to storage on every change.
 */
import { effect } from "@preact/signals";
import { compileSizeHistory } from "./state";

/** Maximum compile-size entries retained per FQBN. The spec calls for 10. */
export const MAX_HISTORY_ENTRIES = 10;

/** localStorage key under which the per-FQBN history map is persisted. */
const STORAGE_KEY = "forgeboard.compile-history";

/** Read the persisted map, defensively. Bad data falls back to an empty map. */
function loadPersisted(): Map<string, number[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return new Map();
    }
    const out = new Map<string, number[]>();
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key !== "string" || key.length === 0) continue;
      if (!Array.isArray(value)) continue;
      const cleaned = value
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
        .map((n) => Math.max(0, Math.min(100, n)))
        .slice(-MAX_HISTORY_ENTRIES);
      if (cleaned.length > 0) out.set(key, cleaned);
    }
    return out;
  } catch {
    return new Map();
  }
}

/**
 * Push the latest flash-usage percentage for `fqbn` into the history map,
 * trimming to MAX_HISTORY_ENTRIES. Replaces the signal value with a fresh
 * Map so signal subscribers re-run. Percentages outside 0-100 are clamped.
 */
export function pushCompileSize(fqbn: string, flashPercent: number): void {
  if (!fqbn) return;
  if (!Number.isFinite(flashPercent)) return;
  const clamped = Math.max(0, Math.min(100, flashPercent));
  const next = new Map(compileSizeHistory.value);
  const existing = next.get(fqbn) ?? [];
  const updated = [...existing, clamped];
  if (updated.length > MAX_HISTORY_ENTRIES) {
    updated.splice(0, updated.length - MAX_HISTORY_ENTRIES);
  }
  next.set(fqbn, updated);
  compileSizeHistory.value = next;
}

/** Hydrate the signal from localStorage and start the write-through effect. */
export function startCompileHistoryTracking(): void {
  const persisted = loadPersisted();
  if (persisted.size > 0) compileSizeHistory.value = persisted;

  // Write-through to localStorage on every change. A Map serialises to JSON as
  // an empty object, so the entries must be marshalled into a plain object.
  effect(() => {
    try {
      const obj: Record<string, number[]> = {};
      for (const [key, value] of compileSizeHistory.value) obj[key] = value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // Quota / unavailable — history simply won't survive a restart.
    }
  });
}
