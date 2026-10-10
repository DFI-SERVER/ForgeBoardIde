/**
 * Command palette and keyboard-shortcuts modal state.
 */
import { signal } from "@preact/signals";

/** Whether the fuzzy-search command palette overlay is open. The Ctrl+Shift+P
 *  / Ctrl+K shortcuts toggle this via togglePalette(); menu-click opens via
 *  openPalette(). The palette resets its query each time it opens. */
export const paletteOpen = signal<boolean>(false);

/** Which palette flow is active. Set by openPalette(); read by CommandPalette
 *  to choose its result provider and select action. Defaults to "command"
 *  for backwards compatibility with existing Ctrl+Shift+P / Ctrl+K callers. */
export type PaletteMode = "command" | "file";

export const paletteMode = signal<PaletteMode>("command");

/** Open the palette in the requested mode. Single entry point so every
 *  trigger goes through one place. */
export function openPalette(mode: PaletteMode = "command"): void {
  paletteMode.value = mode;
  paletteOpen.value = true;
}

/** Toggle the palette. Used by global Ctrl+Shift+P / Ctrl+K, which open the
 *  palette if closed and close it if already open (preserves the muscle
 *  memory from VS Code and the prior ForgeBoard behavior). The mode is only
 *  set when opening. */
export function togglePalette(mode: PaletteMode = "command"): void {
  if (paletteOpen.value) {
    paletteOpen.value = false;
  } else {
    paletteMode.value = mode;
    paletteOpen.value = true;
  }
}

/** Whether the Keyboard Shortcuts reference modal is open. Opened by F1, the
 *  Help menu, and a command-palette command; the modal resets its filter each
 *  time it opens. */
export const keyboardShortcutsOpen = signal<boolean>(false);
