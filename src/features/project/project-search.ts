/**
 * Find in Project — the pure search logic.
 *
 * Given a set of in-memory files (name + content) and a query string, this
 * scans every line of every file and returns each match. It is deliberately
 * free of any UI, signal or Tauri dependency so it can be unit-tested in
 * isolation and reused anywhere.
 *
 * A sketch is only ever a handful of small files, so a plain line-by-line
 * scan in JavaScript is more than fast enough — no indexing, no Rust.
 */

/** One file to search: its display name, absolute path, and full text. */
export interface SearchableFile {
  /** Display name, e.g. "blink.ino". */
  name: string;
  /** Absolute path — the stable key used to open the file later. */
  path: string;
  /** Full file contents. */
  content: string;
}

/** A single matched occurrence of the query within a file. */
export interface SearchMatch {
  /** Path of the file the match is in. */
  filePath: string;
  /** Display name of the file the match is in. */
  fileName: string;
  /** 1-based line number of the match. */
  line: number;
  /** The full text of the matching line (verbatim, untrimmed). */
  lineText: string;
  /** 0-based column where the matched substring starts within `lineText`. */
  matchStart: number;
  /** Length of the matched substring (always `query.length`). */
  matchLength: number;
}

/** All matches in one file, grouped under the file's identity. */
export interface FileMatchGroup {
  filePath: string;
  fileName: string;
  matches: SearchMatch[];
}

/** Outcome of a project search: flat matches, file groups, and a total. */
export interface SearchResult {
  /** Every match across every file, in file-then-line order. */
  matches: SearchMatch[];
  /** The same matches grouped per file; files with no match are omitted. */
  groups: FileMatchGroup[];
  /** Total number of matches (== `matches.length`). */
  total: number;
}

/** An empty result — the canonical "nothing matched / nothing searched" value. */
export const EMPTY_SEARCH_RESULT: SearchResult = { matches: [], groups: [], total: 0 };

/**
 * Find every occurrence of `query` across `files`.
 *
 * - Case-insensitive by default; pass `{ caseSensitive: true }` to opt out.
 * - Reports every occurrence, including multiple matches on a single line and
 *   multiple lines within a single file.
 * - An empty or whitespace-only query matches nothing (returns an empty
 *   result) — searching for "" would otherwise "match" every position.
 * - The query is treated as a literal string, never a regular expression.
 */
export function searchFiles(
  files: SearchableFile[],
  query: string,
  options: { caseSensitive?: boolean } = {},
): SearchResult {
  if (!query) return EMPTY_SEARCH_RESULT;

  const caseSensitive = options.caseSensitive ?? false;
  const needle = caseSensitive ? query : query.toLowerCase();
  const needleLen = query.length;

  const matches: SearchMatch[] = [];
  const groups: FileMatchGroup[] = [];

  for (const file of files) {
    // Split on any newline style (\r\n, \n, \r) so line numbers line up with
    // what the editor shows regardless of the file's line endings.
    const lines = file.content.split(/\r\n|\r|\n/);
    const fileMatches: SearchMatch[] = [];

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const haystack = caseSensitive ? lineText : lineText.toLowerCase();

      // Walk every occurrence on this line, not just the first.
      let from = 0;
      while (true) {
        const at = haystack.indexOf(needle, from);
        if (at === -1) break;
        const match: SearchMatch = {
          filePath: file.path,
          fileName: file.name,
          line: i + 1, // 1-based, matches editor line numbers
          lineText,
          matchStart: at,
          matchLength: needleLen,
        };
        fileMatches.push(match);
        matches.push(match);
        from = at + needleLen; // step past this match; no overlapping hits
      }
    }

    if (fileMatches.length > 0) {
      groups.push({
        filePath: file.path,
        fileName: file.name,
        matches: fileMatches,
      });
    }
  }

  return { matches, groups, total: matches.length };
}

/**
 * Split a line into alternating plain / matched segments for highlighted
 * rendering. Given the line text and the line's matches (each with a
 * `matchStart` / `matchLength`), returns runs in order; `highlight` flags the
 * runs that are the matched substring.
 *
 * Used by the Search view to render a result line with the query emphasised
 * without dangerouslySetInnerHTML.
 */
export interface LineSegment {
  text: string;
  highlight: boolean;
}

export function segmentLine(
  lineText: string,
  matches: { matchStart: number; matchLength: number }[],
): LineSegment[] {
  if (matches.length === 0) return [{ text: lineText, highlight: false }];

  // Matches arrive in scan order (left-to-right) and never overlap, but sort
  // defensively so the segment walk is correct regardless of caller order.
  const ordered = [...matches].sort((a, b) => a.matchStart - b.matchStart);

  const segments: LineSegment[] = [];
  let cursor = 0;
  for (const m of ordered) {
    const start = Math.max(m.matchStart, cursor);
    const end = m.matchStart + m.matchLength;
    if (end <= cursor) continue; // fully covered by a previous segment
    if (start > cursor) {
      segments.push({ text: lineText.slice(cursor, start), highlight: false });
    }
    segments.push({ text: lineText.slice(start, end), highlight: true });
    cursor = end;
  }
  if (cursor < lineText.length) {
    segments.push({ text: lineText.slice(cursor), highlight: false });
  }
  return segments;
}
