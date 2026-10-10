/**
 * Global keyboard shortcuts — a single window keydown handler driven entirely
 * by the `keybindings` list. There is no per-key logic here: every shortcut,
 * its combo, and its action live in `keybindings.ts`, so what the reference
 * modal shows is exactly what fires.
 */
import { matchKeyEvent } from "@/features/commands/keybindings";

/**
 * Install the global shortcut handler. Each keydown is resolved against the
 * `global`-scoped keybindings; a match runs the action and consumes the event.
 * Editor-scoped bindings (undo/redo) are deliberately not handled here — they
 * fall through to Monaco's own, selection-aware keybinding service.
 */
export function installShortcuts() {
  window.addEventListener("keydown", (e) => {
    const binding = matchKeyEvent(e);
    if (!binding) return;
    e.preventDefault();
    binding.run();
  });
}
