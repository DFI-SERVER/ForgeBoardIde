/**
 * Library Manager — the pure, UI-free logic for the Library Manager view.
 *
 * Two concerns live here, both deliberately free of any signal, Tauri or
 * Preact dependency so they can be unit-tested in isolation:
 *
 *   1. `filterLibraries` — an in-memory text filter over the cached registry.
 *      The Library Manager fetches the whole registry once (~9000 entries) and
 *      then filters it locally on every keystroke, so this must be cheap and
 *      allocation-light.
 *
 *   2. `computeWindow` — the windowing maths for the virtualized scroll list.
 *      Rendering 9000 rows would jank badly, so only the rows in (and a small
 *      margin around) the viewport are mounted; this turns a scroll offset and
 *      viewport height into the slice of indices to render plus the spacer
 *      heights that stand in for the off-screen rows.
 */

import type { Library } from "../ipc/arduino";

/* ------------------------------------------------------------------ */
/* In-memory filter                                                    */
/* ------------------------------------------------------------------ */

/**
 * Filter `libraries` to those matching `query`.
 *
 * - Case-insensitive; the query is split on whitespace into terms and *every*
 *   term must be found (AND), so "neo adafruit" narrows to libraries that
 *   mention both — order independent.
 * - Each term is matched against the library name, author and one-line
 *   `sentence` (and `paragraph` as a fallback when there is no sentence).
 * - An empty / whitespace-only query returns the input array unchanged (same
 *   reference) — "no filter" rather than "match nothing".
 * - The query is always a literal substring, never a regular expression.
 * - Input order is preserved; this never sorts.
 */
export function filterLibraries(libraries: Library[], query: string): Library[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return libraries;

  return libraries.filter((lib) => {
    const haystack = libraryHaystack(lib);
    return terms.every((term) => haystack.includes(term));
  });
}

/** The lower-cased text of a library that the filter searches within. */
function libraryHaystack(lib: Library): string {
  // `sentence` is the one-liner shown in the row; fall back to `paragraph`
  // only when there is no sentence, mirroring what the row displays.
  const desc = lib.sentence ?? lib.paragraph ?? "";
  return `${lib.name} ${lib.author ?? ""} ${desc}`.toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Virtualized-list windowing                                          */
/* ------------------------------------------------------------------ */

/** The slice of a long list to actually render, plus the spacer heights. */
export interface VirtualWindow {
  /** Index of the first row to mount (inclusive, 0-based). */
  startIndex: number;
  /** Index one past the last row to mount (exclusive) — usable as a slice end. */
  endIndex: number;
  /** Pixel height of the spacer standing in for rows above `startIndex`. */
  topPad: number;
  /** Pixel height of the spacer standing in for rows below `endIndex`. */
  bottomPad: number;
}

/**
 * Work out which rows of a uniform-height list are visible.
 *
 * Given the total row count, the (fixed) row height, the current scroll
 * offset and the viewport height, returns the index range to mount and the
 * top/bottom spacer heights that reserve space for the un-mounted rows so the
 * scrollbar stays correctly sized.
 *
 * `overscan` rows are mounted on each side of the strict viewport so a fast
 * scroll does not flash blank rows; it defaults to a small margin.
 *
 * All inputs are clamped defensively — a negative scroll offset (rubber-band
 * overscroll), a zero row height, or an empty list never produce an invalid
 * window.
 */
export function computeWindow(
  totalCount: number,
  rowHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscan = 6,
): VirtualWindow {
  // An empty list — or a degenerate row height — has nothing to render.
  if (totalCount <= 0 || rowHeight <= 0) {
    return { startIndex: 0, endIndex: 0, topPad: 0, bottomPad: 0 };
  }

  const safeScroll = Math.max(0, scrollTop);
  const safeViewport = Math.max(0, viewportHeight);
  const safeOverscan = Math.max(0, Math.floor(overscan));

  // First strictly-visible row, then pull back by the overscan margin.
  const firstVisible = Math.floor(safeScroll / rowHeight);
  const startIndex = Math.max(0, firstVisible - safeOverscan);

  // Rows that fit in the viewport (+1 for a partially-visible last row),
  // then push forward by the overscan margin.
  const rowsInView = Math.ceil(safeViewport / rowHeight) + 1;
  const endIndex = Math.min(totalCount, firstVisible + rowsInView + safeOverscan);

  return {
    startIndex,
    endIndex,
    topPad: startIndex * rowHeight,
    bottomPad: (totalCount - endIndex) * rowHeight,
  };
}
