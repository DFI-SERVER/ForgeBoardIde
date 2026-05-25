/**
 * Persistence for a handful of session signals — the selected board FQBN,
 * the serial monitor's baud and its line-ending choice.
 *
 * Each signal is hydrated from a known `localStorage` key on module load and
 * a write-through `effect` mirrors every subsequent change back to storage.
 * The shape mirrors `lib/recent-files.ts`: defensive parsing in, best-effort
 * write out — a malformed or hand-corrupted value falls back to the default
 * rather than crashing the IDE, and a write failure just means the choice
 * won't survive a restart.
 *
 * The signals themselves live in `state/appState.ts` (the source of truth
 * for the rest of the app); this module is purely the persistence layer.
 */
import { effect } from "@preact/signals";
import {
  selectedFqbn,
  serialBaud,
  serialLineEnding,
} from "../state/appState";

const FQBN_KEY = "forgeboard.selected-fqbn";
const BAUD_KEY = "forgeboard.serial-baud";
const LINE_ENDING_KEY = "forgeboard.serial-line-ending";

/** The valid line-ending values, kept as a tuple so the coercion can
 *  validate stored strings. Matches the SerialMonitor `<select>` options
 *  exactly: LF, CRLF, CR, and "no line ending". */
const LINE_ENDINGS: readonly ("\n" | "\r\n" | "\r" | "")[] = [
  "\n",
  "\r\n",
  "\r",
  "",
];

/** Read the persisted FQBN, or null when nothing valid is stored. */
function loadFqbn(): string | null {
  try {
    const raw = localStorage.getItem(FQBN_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    // Accept only a non-empty string — anything else (null, number, "") would
    // disable the toolbar pill and silently break compile/upload.
    if (typeof parsed === "string" && parsed.length > 0) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Read the persisted baud rate, or null when nothing valid is stored. */
function loadBaud(): number | null {
  try {
    const raw = localStorage.getItem(BAUD_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "number" &&
      Number.isFinite(parsed) &&
      Number.isInteger(parsed) &&
      parsed > 0
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Read the persisted line-ending, or null when nothing valid is stored. */
function loadLineEnding(): "\n" | "\r\n" | "\r" | "" | null {
  try {
    const raw = localStorage.getItem(LINE_ENDING_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "string" &&
      LINE_ENDINGS.includes(parsed as (typeof LINE_ENDINGS)[number])
    ) {
      return parsed as (typeof LINE_ENDINGS)[number];
    }
    return null;
  } catch {
    return null;
  }
}

/** Hydrate the persisted board/serial signals from localStorage and start
 *  write-through effects. Idempotent — a second call after the first is a
 *  no-op so test files importing the module twice don't double-subscribe. */
let wired = false;
export function startPersistedBoardTracking(): void {
  if (wired) return;
  wired = true;

  const fqbn = loadFqbn();
  if (fqbn !== null) selectedFqbn.value = fqbn;
  const baud = loadBaud();
  if (baud !== null) serialBaud.value = baud;
  const le = loadLineEnding();
  if (le !== null) serialLineEnding.value = le;

  // Write-through. Each effect runs once at start (writing the current
  // value back out — a harmless re-write of what we just read) and again
  // on every subsequent change.
  effect(() => {
    try {
      localStorage.setItem(FQBN_KEY, JSON.stringify(selectedFqbn.value));
    } catch {
      // Storage full or unavailable — choice won't survive a restart.
    }
  });
  effect(() => {
    try {
      localStorage.setItem(BAUD_KEY, JSON.stringify(serialBaud.value));
    } catch {
      // Storage full or unavailable — choice won't survive a restart.
    }
  });
  effect(() => {
    try {
      localStorage.setItem(
        LINE_ENDING_KEY,
        JSON.stringify(serialLineEnding.value),
      );
    } catch {
      // Storage full or unavailable — choice won't survive a restart.
    }
  });
}
