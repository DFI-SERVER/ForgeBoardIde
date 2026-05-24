/**
 * arduino-cli sketch-size parser — pure, UI-free, and unit-tested.
 *
 * After every successful compile, arduino-cli prints two summary lines:
 *
 *   Sketch uses 40192 bytes (15%) of program storage space. Maximum is 262144 bytes.
 *   Global variables use 4012 bytes (12%) of dynamic memory, leaving 28756 bytes
 *   for local variables. Maximum is 32768 bytes.
 *
 * Older toolchains omit the trailing `Maximum is …` from the RAM line and
 * instead report only the bytes used + bytes free; that variant is also
 * supported (total = used + free).
 *
 * This module is deliberately free of signals, Tauri and the DOM so it can be
 * exercised in isolation; the compile flow feeds raw output through `parse`
 * and pushes the result into the `lastCompileSize` signal.
 */

/** Parsed flash + RAM sizes from one compile's size report. */
export interface CompileSize {
  /** Bytes of program storage (flash) the linked image consumes. */
  flashUsed: number;
  /** Total flash budget for the target board, in bytes. */
  flashTotal: number;
  /** Bytes of dynamic memory (RAM) used by global variables. */
  ramUsed: number;
  /** Total dynamic-memory budget for the target board, in bytes. */
  ramTotal: number;
}

/**
 * Flash line — `Sketch uses <used> bytes (<pct>%) of program storage space.
 * Maximum is <total> bytes.`. The percentage is captured but recomputed from
 * used/total for accuracy (some toolchains round to whole percent here).
 */
const FLASH_RE =
  /Sketch uses (\d+) bytes \(\d+%\) of program storage space\.\s+Maximum is (\d+) bytes\./;

/**
 * Newer RAM line — `Global variables use <used> bytes (<pct>%) of dynamic
 * memory, leaving <free> bytes for local variables. Maximum is <total> bytes.`.
 */
const RAM_WITH_MAX_RE =
  /Global variables use (\d+) bytes \(\d+%\) of dynamic memory, leaving (\d+) bytes for local variables\.\s+Maximum is (\d+) bytes\./;

/**
 * Older RAM line — `Global variables use <used> bytes (<pct>%) of dynamic
 * memory, leaving <free> bytes for local variables.` (no Maximum). Total is
 * recovered as `used + free`.
 */
const RAM_NO_MAX_RE =
  /Global variables use (\d+) bytes \(\d+%\) of dynamic memory, leaving (\d+) bytes for local variables\./;

/**
 * Strip ANSI SGR sequences (`\x1b[...m`) that arduino-cli sometimes emits when
 * it detects a colour-capable terminal. The regexes above match literal text,
 * so any colour escapes must be removed first.
 */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Parse the size summary out of a block of compiler output.
 *
 * Returns `null` when either the flash line or the RAM line cannot be found —
 * a partial result would render a half-empty bar, which is worse than rendering
 * nothing at all.
 *
 * Accepts the raw output either as a single string (any newline style) or as
 * an array of already-split lines — the compile flow has both shapes.
 */
export function parseCompileSize(output: string | string[]): CompileSize | null {
  const text = Array.isArray(output) ? output.join("\n") : output;
  const clean = stripAnsi(text);

  const flashMatch = FLASH_RE.exec(clean);
  if (!flashMatch) return null;
  const flashUsed = Number.parseInt(flashMatch[1], 10);
  const flashTotal = Number.parseInt(flashMatch[2], 10);
  if (!Number.isFinite(flashUsed) || !Number.isFinite(flashTotal)) return null;
  if (flashTotal <= 0) return null;

  // Try the newer line first (it's strictly more specific); fall back to the
  // older shape and reconstruct total from used + free.
  let ramUsed: number;
  let ramTotal: number;
  const ramWithMax = RAM_WITH_MAX_RE.exec(clean);
  if (ramWithMax) {
    ramUsed = Number.parseInt(ramWithMax[1], 10);
    ramTotal = Number.parseInt(ramWithMax[3], 10);
  } else {
    const ramNoMax = RAM_NO_MAX_RE.exec(clean);
    if (!ramNoMax) return null;
    ramUsed = Number.parseInt(ramNoMax[1], 10);
    const ramFree = Number.parseInt(ramNoMax[2], 10);
    if (!Number.isFinite(ramFree)) return null;
    ramTotal = ramUsed + ramFree;
  }
  if (!Number.isFinite(ramUsed) || !Number.isFinite(ramTotal)) return null;
  if (ramTotal <= 0) return null;

  return { flashUsed, flashTotal, ramUsed, ramTotal };
}
