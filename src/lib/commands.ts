/**
 * The command registry — every runnable IDE action, in one flat list.
 *
 * The command palette (CommandPalette.tsx) renders and fuzzy-filters this
 * array. Commands are derived from the `keybindings` single source of truth so
 * a command, its menu-bar item and its keyboard shortcut always do the exact
 * same thing and show the exact same combo. A handful of commands that have no
 * keyboard shortcut (and so no keybinding) are appended afterwards.
 */
import { keybindings, type Keybinding } from "./keybindings";
import { keyboardShortcutsOpen } from "../state/appState";
import { openBurnBootloaderDialog } from "./actions";

/** A single palette-runnable command. */
export interface Command {
  /** Stable, unique identifier (used as the list key). */
  id: string;
  /** Human-readable label shown in the palette. */
  title: string;
  /** Grouping label, shown muted next to the title. */
  category: string;
  /** Performs the action. */
  run: () => void;
  /** Optional keyboard-shortcut hint, right-aligned in the row. */
  shortcut?: string;
}

/** Turn a keybinding into its palette command. */
function fromKeybinding(k: Keybinding): Command {
  return {
    id: k.id,
    title: k.label,
    category: k.category,
    run: k.run,
    shortcut: k.combo,
  };
}

/**
 * All commands, in display order.
 *
 * The first block is every keybinding-backed command, minus `Ctrl+K` — it is
 * a second binding for the command palette and listing it twice would be
 * noise. The second block is shortcut-less commands. The palette ranks
 * matches, so this order only matters as a tie-breaker.
 */
export const commands: Command[] = [
  ...keybindings
    .filter((k) => k.id !== "view.commandPalette.k")
    .map(fromKeybinding),

  /* ------------------------ commands without a keyboard shortcut --- */
  {
    id: "help.keyboardShortcuts",
    title: "Help: Keyboard Shortcuts",
    category: "Help",
    run: () => {
      keyboardShortcutsOpen.value = true;
    },
  },
  {
    id: "tools.burnBootloader",
    title: "Burn Bootloader…",
    category: "Tools",
    run: openBurnBootloaderDialog,
  },
];

/* -------------------------------------------------------- matching --- */

/** A command paired with its computed match score for a given query. */
export interface ScoredCommand {
  command: Command;
  score: number;
}

/**
 * Score how well `query` matches `text`. Higher is better; 0 means no match.
 *
 *   exact title           → 1000
 *   prefix of the title   →  800
 *   contiguous substring  →  500  (earlier position scores higher)
 *   subsequence (fuzzy)   →  100  (tighter spans score higher)
 *
 * Case-insensitive throughout.
 */
function scoreText(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  if (t === q) return 1000;
  if (t.startsWith(q)) return 800;

  const idx = t.indexOf(q);
  if (idx !== -1) return 500 - idx;

  // Subsequence: every query char appears in order. Reward tight spans.
  let ti = 0;
  let first = -1;
  let last = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    let found = -1;
    while (ti < t.length) {
      if (t[ti] === ch) {
        found = ti;
        ti++;
        break;
      }
      ti++;
    }
    if (found === -1) return 0;
    if (first === -1) first = found;
    last = found;
  }
  const span = last - first + 1;
  return Math.max(1, 100 - (span - q.length));
}

/**
 * Filter and rank the registry against a search query. An empty query returns
 * every command in registry order. Matches are scored against the title and,
 * at a discount, the category — so typing a category name still surfaces its
 * commands. Ties are broken by registry order (stable sort).
 */
export function filterCommands(query: string): Command[] {
  const trimmed = query.trim();
  if (!trimmed) return commands.slice();

  const scored: ScoredCommand[] = [];
  for (const command of commands) {
    const titleScore = scoreText(trimmed, command.title);
    const categoryScore = scoreText(trimmed, command.category);
    const score = Math.max(titleScore, categoryScore * 0.4);
    if (score > 0) scored.push({ command, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.command);
}
