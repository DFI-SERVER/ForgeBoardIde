/**
 * Persisted IDE preferences.
 *
 * A single `Settings` object lives in a `@preact/signals` signal, so any
 * component or non-React module that reads `settings.value` re-runs when a
 * preference changes. The object is hydrated from `localStorage` on module
 * load and written straight back on every change, so preferences survive a
 * restart without an explicit save step.
 *
 * Parsing stored JSON is deliberately defensive — a missing, truncated or
 * hand-corrupted entry must never crash the app or apply a nonsensical value;
 * it falls back to the defaults, field by field.
 */
import { signal } from "@preact/signals";

/** Tab width, in spaces. The editor only offers these two. */
export type TabSize = 2 | 4;

/** Every user-tunable preference, in one flat, serialisable object. */
export interface Settings {
  /** Editor font size in CSS pixels. Clamped to [FONT_SIZE_MIN, FONT_SIZE_MAX]. */
  fontSize: number;
  /** Spaces per indentation level. */
  tabSize: TabSize;
  /** Soft-wrap long lines instead of scrolling horizontally. */
  wordWrap: boolean;
  /** Show the minimap (code overview) on the editor's right edge. */
  minimap: boolean;
  /** Show the line-number gutter. */
  lineNumbers: boolean;
  /** Pass `-v` to arduino-cli so the Output panel shows the full build log. */
  verboseBuild: boolean;
}

/** Inclusive bounds for the editor font size, shared by the UI and the clamp. */
export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 22;

/** The shipped defaults — also the fallback for any corrupt/missing field. */
export const DEFAULT_SETTINGS: Settings = {
  fontSize: 15,
  tabSize: 2,
  wordWrap: false,
  minimap: false,
  lineNumbers: true,
  verboseBuild: false,
};

/** localStorage key the settings object is persisted under. */
const STORAGE_KEY = "forgeboard.settings";

/** Round `n` to an integer and clamp it into the font-size range. */
function clampFontSize(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_SETTINGS.fontSize;
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)));
}

/**
 * Coerce an arbitrary parsed value into a valid `Settings`, taking each field
 * from the input only when it is the right type (and in range), and falling
 * back to the default otherwise. Unknown extra keys are dropped.
 */
function coerce(raw: unknown): Settings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SETTINGS };
  const o = raw as Record<string, unknown>;
  const bool = (v: unknown, fallback: boolean) =>
    typeof v === "boolean" ? v : fallback;
  return {
    fontSize: clampFontSize(o.fontSize),
    tabSize: o.tabSize === 4 ? 4 : o.tabSize === 2 ? 2 : DEFAULT_SETTINGS.tabSize,
    wordWrap: bool(o.wordWrap, DEFAULT_SETTINGS.wordWrap),
    minimap: bool(o.minimap, DEFAULT_SETTINGS.minimap),
    lineNumbers: bool(o.lineNumbers, DEFAULT_SETTINGS.lineNumbers),
    verboseBuild: bool(o.verboseBuild, DEFAULT_SETTINGS.verboseBuild),
  };
}

/** Read + validate the persisted settings, or return a fresh default copy. */
function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return { ...DEFAULT_SETTINGS };
    return coerce(JSON.parse(stored));
  } catch {
    // Missing localStorage, malformed JSON — fall back to defaults.
    return { ...DEFAULT_SETTINGS };
  }
}

/** Best-effort write of the current settings to localStorage. */
function persist(value: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — preferences just won't survive a restart.
  }
}

/**
 * The live settings signal. Read `settings.value` to subscribe reactively;
 * prefer `updateSettings()` to change a preference so the write-through to
 * localStorage always happens.
 */
export const settings = signal<Settings>(loadSettings());

/**
 * Apply a partial change to the settings and persist the result immediately.
 * Replaces the signal value with a new object so signal subscribers re-run.
 */
export function updateSettings(patch: Partial<Settings>): void {
  const next = coerce({ ...settings.value, ...patch });
  settings.value = next;
  persist(next);
}

/** Reset every preference to its shipped default (and persist that). */
export function resetSettings(): void {
  settings.value = { ...DEFAULT_SETTINGS };
  persist(settings.value);
}
