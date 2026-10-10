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

/** The two monochrome themes the IDE ships. */
export type Theme = "dark" | "light";

/** The editor font family options — keys map to a CSS font-family stack in
 *  monaco-setup.ts. The chosen face MUST already be installed on the user's
 *  system; we don't ship web fonts (the IDE is offline-friendly). */
export type FontFamily =
  | "consolas"
  | "cascadia-code"
  | "fira-code"
  | "jetbrains-mono";

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
  /** Tint matching bracket pairs so nested scopes are easy to scan. */
  bracketColorization: boolean;
  /** Pin the enclosing function / scope header at the top of the editor. */
  stickyScroll: boolean;
  /** Render vertical indentation guides in the gutter. */
  indentGuides: boolean;
  /** Run Auto Format over each modified file on save. */
  formatOnSave: boolean;
  /** Strip trailing spaces and tabs from every line on save. */
  trimTrailingWhitespaceOnSave: boolean;
  /** Active theme — drives both the app shell tokens (via data-theme) and
   *  the Monaco editor theme. */
  theme: Theme;
  /** Editor font face. */
  fontFamily: FontFamily;
  /** Enable programming ligatures (e.g. `!=` → ≠) in the editor. Only
   *  visible with fonts that ship contextual ligature OpenType features
   *  (Fira Code, JetBrains Mono, Cascadia Code — not Consolas). */
  fontLigatures: boolean;
  /** Pass `-v` to arduino-cli so the Output panel shows the full build log. */
  verboseBuild: boolean;
  /** Apply ForgeBoard's platform corrections — small overlay files that
   *  patch known upstream platform.txt bugs (e.g. the ESP32-S3 native-USB
   *  upload bug). On by default; turn off only if you maintain your own
   *  platform.local.txt and don't want ours to overwrite it. */
  applyPlatformCorrections: boolean;
  /** Extra board-manager index URLs (one per vendor), the same list Arduino
   *  IDE keeps under "Additional boards manager URLs". Passed to arduino-cli
   *  as --additional-urls on every core command; never written into the
   *  shared arduino-cli.yaml. */
  additionalBoardUrls: string[];
}

/** Inclusive bounds for the editor font size, shared by the UI and the clamp. */
export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 22;

/** The valid Theme values, kept as a tuple so coerce can validate strings. */
const THEMES: readonly Theme[] = ["dark", "light"];

/** Legacy theme identifiers from the previous (3-theme) ship. A localStorage
 *  value left over from that build is migrated to the closest mono equivalent
 *  rather than dropped to the default — Solarized Dark users land on Dark,
 *  Solarized Light users land on Light. */
const LEGACY_THEME_MIGRATION: Readonly<Record<string, Theme>> = {
  "solarized-dark": "dark",
  "solarized-light": "light",
};

/** Translate any persisted theme string to a current Theme. Unknown strings
 *  return `null` so coerce can fall back to the shipped default. */
function migrateTheme(raw: unknown): Theme | null {
  if (typeof raw !== "string") return null;
  if (THEMES.includes(raw as Theme)) return raw as Theme;
  return LEGACY_THEME_MIGRATION[raw] ?? null;
}

/** The valid FontFamily values, used by coerce to validate stored strings. */
const FONT_FAMILIES: readonly FontFamily[] = [
  "consolas",
  "cascadia-code",
  "fira-code",
  "jetbrains-mono",
];

/** The shipped defaults — also the fallback for any corrupt/missing field. */
export const DEFAULT_SETTINGS: Settings = {
  fontSize: 15,
  tabSize: 2,
  wordWrap: false,
  minimap: false,
  lineNumbers: true,
  bracketColorization: true,
  stickyScroll: true,
  indentGuides: true,
  formatOnSave: false,
  trimTrailingWhitespaceOnSave: false,
  theme: "dark",
  fontFamily: "cascadia-code",
  fontLigatures: false,
  verboseBuild: false,
  applyPlatformCorrections: true,
  additionalBoardUrls: [],
};

/** localStorage key the settings object is persisted under. */
const STORAGE_KEY = "forgeboard.settings";

/** Keep only well-formed http(s) URLs, trimmed and de-duplicated. */
export function urlList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (/^https?:\/\/\S+$/i.test(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

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
    bracketColorization: bool(o.bracketColorization, DEFAULT_SETTINGS.bracketColorization),
    stickyScroll: bool(o.stickyScroll, DEFAULT_SETTINGS.stickyScroll),
    indentGuides: bool(o.indentGuides, DEFAULT_SETTINGS.indentGuides),
    formatOnSave: bool(o.formatOnSave, DEFAULT_SETTINGS.formatOnSave),
    trimTrailingWhitespaceOnSave: bool(
      o.trimTrailingWhitespaceOnSave,
      DEFAULT_SETTINGS.trimTrailingWhitespaceOnSave,
    ),
    theme: migrateTheme(o.theme) ?? DEFAULT_SETTINGS.theme,
    fontFamily: FONT_FAMILIES.includes(o.fontFamily as FontFamily)
      ? (o.fontFamily as FontFamily)
      : DEFAULT_SETTINGS.fontFamily,
    fontLigatures: bool(o.fontLigatures, DEFAULT_SETTINGS.fontLigatures),
    verboseBuild: bool(o.verboseBuild, DEFAULT_SETTINGS.verboseBuild),
    applyPlatformCorrections: bool(
      o.applyPlatformCorrections,
      DEFAULT_SETTINGS.applyPlatformCorrections,
    ),
    additionalBoardUrls: urlList(o.additionalBoardUrls),
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
