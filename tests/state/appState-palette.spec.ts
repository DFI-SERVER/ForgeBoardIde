import { describe, it, expect, beforeEach } from "vitest";
import {
  openPalette,
  togglePalette,
  paletteOpen,
  paletteMode,
} from "../../src/state/appState";

beforeEach(() => {
  paletteOpen.value = false;
  paletteMode.value = "command";
});

describe("openPalette", () => {
  it("opens with the default 'command' mode when no argument given", () => {
    openPalette();
    expect(paletteOpen.value).toBe(true);
    expect(paletteMode.value).toBe("command");
  });

  it("opens with the requested mode", () => {
    openPalette("file");
    expect(paletteOpen.value).toBe(true);
    expect(paletteMode.value).toBe("file");
  });

  it("re-sets the mode even if the palette was already open in another mode", () => {
    paletteOpen.value = true;
    paletteMode.value = "file";
    openPalette("command");
    expect(paletteOpen.value).toBe(true);
    expect(paletteMode.value).toBe("command");
  });
});

describe("togglePalette", () => {
  it("opens when closed, in the default 'command' mode", () => {
    togglePalette();
    expect(paletteOpen.value).toBe(true);
    expect(paletteMode.value).toBe("command");
  });

  it("opens in the requested mode when closed", () => {
    togglePalette("file");
    expect(paletteOpen.value).toBe(true);
    expect(paletteMode.value).toBe("file");
  });

  it("closes when already open", () => {
    paletteOpen.value = true;
    paletteMode.value = "file";
    togglePalette();
    expect(paletteOpen.value).toBe(false);
  });

  it("does NOT change paletteMode when closing", () => {
    // When closing, the mode signal is irrelevant; leaving it alone keeps
    // the next-open's mode prediction more straightforward.
    paletteOpen.value = true;
    paletteMode.value = "file";
    togglePalette("command"); // closes
    expect(paletteOpen.value).toBe(false);
    expect(paletteMode.value).toBe("file"); // unchanged on close
  });
});
