import { describe, it, expect, beforeEach } from "vitest";
import {
  keybindings,
  CATEGORY_ORDER,
  keybindingById,
  comboFor,
  eventCombo,
  matchKeyEvent,
} from "../../src/lib/keybindings";
import {
  activeRail,
  paletteOpen,
  keyboardShortcutsOpen,
  bottomPanelOpen,
} from "../../src/state/appState";

beforeEach(() => {
  activeRail.value = "files";
  paletteOpen.value = false;
  keyboardShortcutsOpen.value = false;
  bottomPanelOpen.value = true;
});

/** Minimal KeyboardEvent stand-in for `eventCombo` / `matchKeyEvent`. */
function keyEvent(
  key: string,
  mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {},
): KeyboardEvent {
  return {
    key,
    ctrlKey: !!mods.ctrl,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
    metaKey: !!mods.meta,
  } as KeyboardEvent;
}

describe("keybindings data", () => {
  it("is not empty", () => {
    expect(keybindings.length).toBeGreaterThan(0);
  });

  it("gives every keybinding a unique id", () => {
    const ids = keybindings.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every keybinding a non-empty label", () => {
    for (const k of keybindings) {
      expect(typeof k.label).toBe("string");
      expect(k.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("gives every keybinding a category drawn from CATEGORY_ORDER", () => {
    for (const k of keybindings) {
      expect(CATEGORY_ORDER).toContain(k.category);
    }
  });

  it("gives every keybinding a non-empty combo", () => {
    for (const k of keybindings) {
      expect(typeof k.combo).toBe("string");
      expect(k.combo.trim().length).toBeGreaterThan(0);
    }
  });

  it("has no two keybindings sharing the same combo", () => {
    const combos = keybindings.map((k) => k.combo);
    const seen = new Map<string, string>();
    for (const k of keybindings) {
      expect(
        seen.has(k.combo),
        `combo ${k.combo} is bound to both ${seen.get(k.combo)} and ${k.id}`,
      ).toBe(false);
      seen.set(k.combo, k.id);
    }
    expect(new Set(combos).size).toBe(combos.length);
  });

  it("scopes every keybinding to either global or editor", () => {
    for (const k of keybindings) {
      expect(["global", "editor"]).toContain(k.scope);
    }
  });

  it("covers the conventional primary shortcuts the spec requires", () => {
    const byCombo = new Map(keybindings.map((k) => [k.combo, k]));
    for (const combo of [
      "Ctrl+N",
      "Ctrl+O",
      "Ctrl+S",
      "Ctrl+R",
      "Ctrl+U",
      "Ctrl+F",
      "Ctrl+H",
      "Ctrl+Shift+F",
      "Ctrl+Shift+P",
      "Ctrl+K",
      "F1",
    ]) {
      expect(byCombo.has(combo), `expected a binding for ${combo}`).toBe(true);
    }
  });

  it("does not bind Ctrl+/ (reserved for toggle-line-comment in the editor)", () => {
    expect(keybindings.some((k) => k.combo === "Ctrl+/")).toBe(false);
  });
});

describe("keybindingById / comboFor", () => {
  it("looks a keybinding up by id", () => {
    expect(keybindingById("file.save")?.combo).toBe("Ctrl+S");
  });

  it("returns the combo string for an id", () => {
    expect(comboFor("sketch.compile")).toBe("Ctrl+R");
  });

  it("returns undefined for an unknown id", () => {
    expect(keybindingById("nope.nope")).toBeUndefined();
    expect(comboFor("nope.nope")).toBeUndefined();
  });
});

describe("eventCombo", () => {
  it("upper-cases a plain letter key", () => {
    expect(eventCombo(keyEvent("s", { ctrl: true }))).toBe("Ctrl+S");
  });

  it("emits modifiers in Ctrl, Shift, Alt order", () => {
    expect(
      eventCombo(keyEvent("p", { ctrl: true, shift: true })),
    ).toBe("Ctrl+Shift+P");
  });

  it("folds the macOS Meta key into Ctrl", () => {
    expect(eventCombo(keyEvent("s", { meta: true }))).toBe("Ctrl+S");
  });

  it("passes named keys through unchanged", () => {
    expect(eventCombo(keyEvent("F1"))).toBe("F1");
    expect(eventCombo(keyEvent("Tab", { ctrl: true }))).toBe("Ctrl+Tab");
  });
});

describe("matchKeyEvent", () => {
  it("resolves a global keybinding from an event", () => {
    const hit = matchKeyEvent(keyEvent("s", { ctrl: true }));
    expect(hit?.id).toBe("file.save");
  });

  it("returns undefined when no combo matches", () => {
    expect(matchKeyEvent(keyEvent("q", { ctrl: true }))).toBeUndefined();
  });

  it("does not match editor-scoped bindings (undo is Monaco's)", () => {
    // Ctrl+Z is an editor-scoped keybinding — the global handler must ignore it.
    expect(matchKeyEvent(keyEvent("z", { ctrl: true }))).toBeUndefined();
  });

  it("runs the matched binding's action", () => {
    matchKeyEvent(keyEvent("1", { ctrl: true }))?.run();
    expect(activeRail.value).toBe("home");
  });

  it("F1 resolves to the Keyboard Shortcuts binding", () => {
    const hit = matchKeyEvent(keyEvent("F1"));
    expect(hit?.id).toBe("view.keyboardShortcuts");
    hit?.run();
    expect(keyboardShortcutsOpen.value).toBe(true);
  });
});
