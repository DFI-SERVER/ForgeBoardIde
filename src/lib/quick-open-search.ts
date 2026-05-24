/**
 * Quick Open — fuzzy filename matcher.
 *
 * The scoring model follows fzy's three preferences (matches at the start of
 * names / after a token boundary, consecutive runs of matched characters,
 * shorter spans) and adds an extension-prefix bonus that's helpful for
 * filename navigation specifically. See
 * https://github.com/jhawthorn/fzy/blob/master/ALGORITHM.md.
 *
 * The matcher is case-insensitive and treats the query as a literal
 * subsequence — no regex characters carry special meaning.
 */

/** Result cap — bounds the rendered list defensively for huge sketches. */
export const MAX_RESULTS = 50;

/** A file usable as a Quick Open candidate. The interface is intentionally
 *  narrower than the full `SketchFile`: `path` is the stable key, `name` is
 *  what gets matched and rendered. */
export interface QuickOpenFile {
  path: string;
  name: string;
}

const BOUNDARY_RE = /[_\-./]/;

/** Score how well `query` matches `name`. 0 means no match. */
export function scoreMatch(query: string, name: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const n = name.toLowerCase();

  let score = 0;
  let qi = 0;
  let firstMatchAt = -1;
  let lastMatchAt = -1;
  let prevWasMatch = false;

  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] !== q[qi]) {
      prevWasMatch = false;
      continue;
    }
    if (firstMatchAt === -1) firstMatchAt = i;
    lastMatchAt = i;

    // Boundary bonus: start of name, or the character before is a boundary.
    const atBoundary = i === 0 || BOUNDARY_RE.test(n[i - 1]);
    if (atBoundary) score += 20;
    // Start-of-name is a stronger signal than an interior token boundary.
    if (i === 0) score += 5;

    // Consecutive-run bonus.
    if (prevWasMatch) score += 10;

    qi++;
    prevWasMatch = true;
  }

  if (qi < q.length) return 0; // not a complete subsequence

  // Gap penalty: discourage scattered matches.
  const span = lastMatchAt - firstMatchAt + 1;
  score -= span - q.length;

  // Extension-prefix bonus.
  const dot = n.lastIndexOf(".");
  if (dot >= 0 && n.slice(dot + 1).startsWith(q)) score += 5;

  return Math.max(1, score);
}

/** Rank `files` by their match against `query`. Empty query returns the
 *  list as-is (caller is responsible for the recents / all-files fallback). */
export function rankFiles<F extends QuickOpenFile>(
  files: readonly F[],
  query: string,
): F[] {
  if (!query.trim()) return files.slice();

  const scored: { file: F; score: number }[] = [];
  for (const file of files) {
    const score = scoreMatch(query, file.name);
    if (score > 0) scored.push({ file, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.file.name.localeCompare(b.file.name);
  });

  return scored.slice(0, MAX_RESULTS).map((s) => s.file);
}
