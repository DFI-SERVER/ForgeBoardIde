import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The settings module hydrates from localStorage once, at import time. To
 * exercise hydration against different stored states, each scenario seeds
 * localStorage and then imports a fresh copy of the module via a helper that
 * resets the module registry first.
 */
const STORAGE_KEY = "forgeboard.settings";

/** Reset the module cache and re-import settings.ts so it re-hydrates. */
async function freshImport() {
  vi.resetModules();
  return import("@/features/settings/settings");
}

/**
 * Drop the persisted settings entry. `localStorage.clear()` is not reliably
 * implemented across the test runner's storage shim, so the single key the
 * module owns is removed explicitly instead.
 */
function clearStored() {
  localStorage.removeItem(STORAGE_KEY);
}

beforeEach(() => {
  clearStored();
});

afterEach(() => {
  clearStored();
  vi.restoreAllMocks();
});

describe("settings defaults", () => {
  it("uses the documented defaults when nothing is stored", async () => {
    const { settings, DEFAULT_SETTINGS } = await freshImport();
    expect(settings.value).toEqual(DEFAULT_SETTINGS);
  });

  it("DEFAULT_SETTINGS has every field with sensible values", async () => {
    const { DEFAULT_SETTINGS, FONT_SIZE_MIN, FONT_SIZE_MAX } = await freshImport();
    expect(DEFAULT_SETTINGS.fontSize).toBeGreaterThanOrEqual(FONT_SIZE_MIN);
    expect(DEFAULT_SETTINGS.fontSize).toBeLessThanOrEqual(FONT_SIZE_MAX);
    expect([2, 4]).toContain(DEFAULT_SETTINGS.tabSize);
    expect(typeof DEFAULT_SETTINGS.wordWrap).toBe("boolean");
    expect(typeof DEFAULT_SETTINGS.minimap).toBe("boolean");
    expect(typeof DEFAULT_SETTINGS.lineNumbers).toBe("boolean");
    expect(typeof DEFAULT_SETTINGS.bracketColorization).toBe("boolean");
    expect(typeof DEFAULT_SETTINGS.stickyScroll).toBe("boolean");
    expect(typeof DEFAULT_SETTINGS.indentGuides).toBe("boolean");
    expect(typeof DEFAULT_SETTINGS.formatOnSave).toBe("boolean");
    expect(typeof DEFAULT_SETTINGS.trimTrailingWhitespaceOnSave).toBe("boolean");
    expect(["dark", "light"]).toContain(DEFAULT_SETTINGS.theme);
    expect([
      "consolas",
      "cascadia-code",
      "fira-code",
      "jetbrains-mono",
    ]).toContain(DEFAULT_SETTINGS.fontFamily);
    expect(typeof DEFAULT_SETTINGS.fontLigatures).toBe("boolean");
    expect(typeof DEFAULT_SETTINGS.verboseBuild).toBe("boolean");
  });

  it("does not mutate DEFAULT_SETTINGS when settings change", async () => {
    const { settings, updateSettings, DEFAULT_SETTINGS } = await freshImport();
    const snapshot = { ...DEFAULT_SETTINGS };
    updateSettings({ fontSize: 21, minimap: true });
    expect(DEFAULT_SETTINGS).toEqual(snapshot);
    expect(settings.value).not.toBe(DEFAULT_SETTINGS);
  });
});

describe("settings persistence round-trip", () => {
  it("writes every change straight to localStorage", async () => {
    const { updateSettings } = await freshImport();
    updateSettings({ fontSize: 18, tabSize: 4, wordWrap: true });

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored).toMatchObject({ fontSize: 18, tabSize: 4, wordWrap: true });
  });

  it("re-hydrates a stored object on the next module load", async () => {
    // First module instance: change some settings.
    const first = await freshImport();
    const patch = {
      fontSize: 20,
      tabSize: 4 as const,
      wordWrap: true,
      minimap: true,
      lineNumbers: false,
      verboseBuild: true,
    };
    first.updateSettings(patch);

    // A fresh import reads what the first instance persisted. Fields the
    // patch didn't touch must come back as their shipped defaults.
    const second = await freshImport();
    expect(second.settings.value).toEqual({
      ...second.DEFAULT_SETTINGS,
      ...patch,
    });
  });

  it("merges a partially-stored object with the defaults", async () => {
    // Only one field persisted — the rest must come from defaults.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontSize: 12 }));
    const { settings, DEFAULT_SETTINGS } = await freshImport();
    expect(settings.value.fontSize).toBe(12);
    expect(settings.value.tabSize).toBe(DEFAULT_SETTINGS.tabSize);
    expect(settings.value.verboseBuild).toBe(DEFAULT_SETTINGS.verboseBuild);
  });
});

describe("settings setters", () => {
  it("updateSettings applies a partial patch and leaves other fields alone", async () => {
    const { settings, updateSettings, DEFAULT_SETTINGS } = await freshImport();
    updateSettings({ minimap: true });
    expect(settings.value.minimap).toBe(true);
    expect(settings.value.fontSize).toBe(DEFAULT_SETTINGS.fontSize);
    expect(settings.value.tabSize).toBe(DEFAULT_SETTINGS.tabSize);
  });

  it("updateSettings can change each editor field individually", async () => {
    const { settings, updateSettings } = await freshImport();

    updateSettings({ fontSize: 16 });
    expect(settings.value.fontSize).toBe(16);

    updateSettings({ tabSize: 4 });
    expect(settings.value.tabSize).toBe(4);

    updateSettings({ wordWrap: true });
    expect(settings.value.wordWrap).toBe(true);

    updateSettings({ minimap: true });
    expect(settings.value.minimap).toBe(true);

    updateSettings({ lineNumbers: false });
    expect(settings.value.lineNumbers).toBe(false);

    updateSettings({ verboseBuild: true });
    expect(settings.value.verboseBuild).toBe(true);
  });

  it("clamps the font size into the allowed range", async () => {
    const { settings, updateSettings, FONT_SIZE_MIN, FONT_SIZE_MAX } =
      await freshImport();

    updateSettings({ fontSize: 999 });
    expect(settings.value.fontSize).toBe(FONT_SIZE_MAX);

    updateSettings({ fontSize: 1 });
    expect(settings.value.fontSize).toBe(FONT_SIZE_MIN);
  });

  it("rounds a fractional font size to an integer", async () => {
    const { settings, updateSettings } = await freshImport();
    updateSettings({ fontSize: 14.7 });
    expect(settings.value.fontSize).toBe(15);
  });

  it("replaces the signal object so subscribers re-run", async () => {
    const { settings, updateSettings } = await freshImport();
    const before = settings.value;
    updateSettings({ wordWrap: true });
    expect(settings.value).not.toBe(before);
  });

  it("resetSettings restores every default and persists it", async () => {
    const { settings, updateSettings, resetSettings, DEFAULT_SETTINGS } =
      await freshImport();
    updateSettings({ fontSize: 22, verboseBuild: true, lineNumbers: false });

    resetSettings();
    expect(settings.value).toEqual(DEFAULT_SETTINGS);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored).toEqual(DEFAULT_SETTINGS);
  });
});

describe("settings graceful fallback on corrupt data", () => {
  it("falls back to defaults when the stored JSON is malformed", async () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json");
    const { settings, DEFAULT_SETTINGS } = await freshImport();
    expect(settings.value).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to defaults when the stored value is not an object", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify("a string"));
    const { settings, DEFAULT_SETTINGS } = await freshImport();
    expect(settings.value).toEqual(DEFAULT_SETTINGS);
  });

  it("falls back to defaults when the stored value is null", async () => {
    localStorage.setItem(STORAGE_KEY, "null");
    const { settings, DEFAULT_SETTINGS } = await freshImport();
    expect(settings.value).toEqual(DEFAULT_SETTINGS);
  });

  it("repairs individual fields with the wrong type", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        fontSize: "huge", // wrong type
        tabSize: 3, // not an allowed value
        wordWrap: "yes", // wrong type
        minimap: 1, // wrong type
        lineNumbers: null, // wrong type
        verboseBuild: true, // valid — must survive
      }),
    );
    const { settings, DEFAULT_SETTINGS } = await freshImport();
    expect(settings.value.fontSize).toBe(DEFAULT_SETTINGS.fontSize);
    expect(settings.value.tabSize).toBe(DEFAULT_SETTINGS.tabSize);
    expect(settings.value.wordWrap).toBe(DEFAULT_SETTINGS.wordWrap);
    expect(settings.value.minimap).toBe(DEFAULT_SETTINGS.minimap);
    expect(settings.value.lineNumbers).toBe(DEFAULT_SETTINGS.lineNumbers);
    // The one valid field is kept.
    expect(settings.value.verboseBuild).toBe(true);
  });

  it("clamps an out-of-range stored font size on load", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontSize: 500 }));
    const { settings, FONT_SIZE_MAX } = await freshImport();
    expect(settings.value.fontSize).toBe(FONT_SIZE_MAX);
  });

  it("rejects an unknown theme string and falls back to the default", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: "warm-cream" }));
    const { settings, DEFAULT_SETTINGS } = await freshImport();
    expect(settings.value.theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it("accepts each of the two known themes", async () => {
    for (const theme of ["dark", "light"] as const) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme }));
      const { settings } = await freshImport();
      expect(settings.value.theme).toBe(theme);
    }
  });

  it("migrates a legacy solarized-dark to dark", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: "solarized-dark" }));
    const { settings } = await freshImport();
    expect(settings.value.theme).toBe("dark");
  });

  it("migrates a legacy solarized-light to light", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: "solarized-light" }));
    const { settings } = await freshImport();
    expect(settings.value.theme).toBe("light");
  });

  it("defaults applyPlatformCorrections to true", async () => {
    const { DEFAULT_SETTINGS } = await freshImport();
    expect(DEFAULT_SETTINGS.applyPlatformCorrections).toBe(true);
  });

  it("respects a stored applyPlatformCorrections=false", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ applyPlatformCorrections: false }),
    );
    const { settings } = await freshImport();
    expect(settings.value.applyPlatformCorrections).toBe(false);
  });

  it("recovers from a non-boolean applyPlatformCorrections", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ applyPlatformCorrections: "sure" }),
    );
    const { settings, DEFAULT_SETTINGS } = await freshImport();
    expect(settings.value.applyPlatformCorrections).toBe(
      DEFAULT_SETTINGS.applyPlatformCorrections,
    );
  });

  it("rejects an unknown fontFamily and falls back to the default", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontFamily: "comic-sans" }));
    const { settings, DEFAULT_SETTINGS } = await freshImport();
    expect(settings.value.fontFamily).toBe(DEFAULT_SETTINGS.fontFamily);
  });

  it("accepts each known fontFamily preset", async () => {
    const families = [
      "consolas",
      "cascadia-code",
      "fira-code",
      "jetbrains-mono",
    ] as const;
    for (const fontFamily of families) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontFamily }));
      const { settings } = await freshImport();
      expect(settings.value.fontFamily).toBe(fontFamily);
    }
  });

  it("rejects a non-boolean fontLigatures and falls back", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontLigatures: "yes" }));
    const { settings, DEFAULT_SETTINGS } = await freshImport();
    expect(settings.value.fontLigatures).toBe(DEFAULT_SETTINGS.fontLigatures);
  });

  it("survives localStorage.getItem throwing", async () => {
    vi.spyOn(globalThis.localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    const { settings, DEFAULT_SETTINGS } = await freshImport();
    expect(settings.value).toEqual(DEFAULT_SETTINGS);
  });

  it("does not throw when localStorage.setItem fails", async () => {
    const { updateSettings } = await freshImport();
    vi.spyOn(globalThis.localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    // The write is best-effort — a failing setItem must not surface.
    expect(() => updateSettings({ fontSize: 17 })).not.toThrow();
  });
});
