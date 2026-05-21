/**
 * The command registry — every runnable IDE action, in one flat list.
 *
 * The command palette (CommandPalette.tsx) renders and fuzzy-filters this
 * array. Each command is a thin wrapper over the shared action modules, so a
 * command and its menu-bar / shortcut equivalent always do the exact same
 * thing. Adding a feature to the palette is just one entry here.
 */
import {
  newSketch,
  openSketch,
  saveActiveFile,
  compileSketch,
  uploadSketch,
  toggleBottomPanel,
} from "./actions";
import {
  editorFind,
  editorReplace,
  editorUndo,
  editorRedo,
} from "./editor-actions";
import { activeRail, searchFocusRequest, type RailIcon } from "../state/appState";

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

/** Build a "Go" command that switches the activity rail to a given view. */
function goTo(id: string, title: string, rail: RailIcon): Command {
  return {
    id,
    title,
    category: "Go",
    run: () => {
      activeRail.value = rail;
    },
  };
}

/**
 * All commands, in display order. The palette ranks matches, so this order
 * only matters as a tie-breaker for equally-good matches.
 */
export const commands: Command[] = [
  /* ---------------------------------------------------------- File --- */
  {
    id: "file.new",
    title: "New Sketch",
    category: "File",
    shortcut: "Ctrl+N",
    run: newSketch,
  },
  {
    id: "file.open",
    title: "Open Sketch…",
    category: "File",
    shortcut: "Ctrl+O",
    run: openSketch,
  },
  {
    id: "file.save",
    title: "Save",
    category: "File",
    shortcut: "Ctrl+S",
    run: saveActiveFile,
  },

  /* -------------------------------------------------------- Sketch --- */
  {
    id: "sketch.compile",
    title: "Verify / Compile",
    category: "Sketch",
    shortcut: "Ctrl+R",
    run: compileSketch,
  },
  {
    id: "sketch.upload",
    title: "Upload",
    category: "Sketch",
    shortcut: "Ctrl+U",
    run: uploadSketch,
  },

  /* ---------------------------------------------------------- Edit --- */
  {
    id: "edit.undo",
    title: "Undo",
    category: "Edit",
    shortcut: "Ctrl+Z",
    run: editorUndo,
  },
  {
    id: "edit.redo",
    title: "Redo",
    category: "Edit",
    shortcut: "Ctrl+Y",
    run: editorRedo,
  },
  {
    id: "edit.find",
    title: "Find",
    category: "Edit",
    shortcut: "Ctrl+F",
    run: editorFind,
  },
  {
    id: "edit.replace",
    title: "Replace",
    category: "Edit",
    shortcut: "Ctrl+H",
    run: editorReplace,
  },
  {
    id: "edit.findInProject",
    title: "Find in Project",
    category: "Edit",
    shortcut: "Ctrl+Shift+F",
    run: () => {
      activeRail.value = "search";
      searchFocusRequest.value++;
    },
  },

  /* ---------------------------------------------------------- View --- */
  {
    id: "view.toggleBottomPanel",
    title: "Toggle Bottom Panel",
    category: "View",
    run: toggleBottomPanel,
  },

  /* ------------------------------------------------------------ Go --- */
  goTo("go.home", "Go to Home", "home"),
  goTo("go.files", "Go to Files", "files"),
  goTo("go.boards", "Go to Boards", "boards"),
  goTo("go.libraries", "Go to Libraries", "libraries"),
  goTo("go.examples", "Go to Examples", "examples"),
  goTo("go.search", "Go to Search", "search"),
  goTo("go.walkthrough", "Go to Walkthrough", "walkthrough"),
  goTo("go.settings", "Go to Settings", "settings"),
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
