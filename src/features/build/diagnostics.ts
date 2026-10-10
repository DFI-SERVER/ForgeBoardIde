/**
 * Compiler-diagnostics parser — pure, UI-free, and unit-tested.
 *
 * arduino-cli compiles with gcc, and gcc reports problems on stderr in the
 * canonical form:
 *
 *   path:line:col: error: message
 *   path:line:col: warning: message
 *
 * The `col` field is sometimes absent (`path:line: error: …`). The `path`
 * itself may contain colons — a Windows drive letter (`C:\Users\…`) — so the
 * parser anchors on the *last* `line[:col]: severity:` run, not the first
 * colon. Any line that does not match (linker banners, progress notes, blank
 * lines) is ignored.
 *
 * This module is deliberately free of signals, Tauri and Monaco so it can be
 * exercised in isolation; the compile flow feeds raw output through `parse`
 * and pushes the result into the `diagnostics` signal.
 */

/** A single structured compiler problem. */
export interface Diagnostic {
  /** File the problem is in — verbatim from the compiler (absolute path). */
  file: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column. 1 when the compiler omitted the column. */
  column: number;
  /** Problem severity. `note:` / `fatal error:` collapse onto these two. */
  severity: "error" | "warning";
  /** The human-readable message, trimmed. */
  message: string;
}

/**
 * Matches a gcc/arduino-cli diagnostic line.
 *
 *   group 1  file      — everything up to the location run; may hold colons
 *   group 2  line      — 1+ digits
 *   group 3  column    — 1+ digits, optional (gcc sometimes omits it)
 *   group 4  severity  — error | warning | note, with an optional `fatal `
 *   group 5  message   — the rest of the line
 *
 * `file` is non-greedy so the `\d+:` location is the *last* such run on the
 * line, which is what keeps a `C:` drive letter out of the captured location.
 */
const DIAGNOSTIC_RE =
  /^(.+?):(\d+)(?::(\d+))?:\s*(?:fatal\s+)?(error|warning|note):\s*(.*)$/i;

/**
 * Parse one line of compiler output into a Diagnostic, or `null` when the
 * line is not a diagnostic.
 */
export function parseDiagnosticLine(raw: string): Diagnostic | null {
  const m = DIAGNOSTIC_RE.exec(raw.trimEnd());
  if (!m) return null;

  const [, file, lineStr, colStr, severityRaw, messageRaw] = m;

  const line = Number.parseInt(lineStr, 10);
  if (!Number.isFinite(line) || line < 1) return null;

  // gcc omits the column on some diagnostics — default it to 1 so the row
  // and the Monaco marker still have a sane anchor.
  const column = colStr ? Number.parseInt(colStr, 10) : 1;

  const message = messageRaw.trim();
  if (message.length === 0) return null;

  // gcc `note:` lines elaborate on the preceding error; surface them as
  // warnings so they are not silently dropped.
  const severity: Diagnostic["severity"] =
    severityRaw.toLowerCase() === "error" ? "error" : "warning";

  return {
    file: file.trim(),
    line,
    column: Number.isFinite(column) && column >= 1 ? column : 1,
    severity,
    message,
  };
}

/**
 * Parse a full block of compiler output (one compile's stdout+stderr) into a
 * flat, ordered list of diagnostics. Non-diagnostic lines are skipped; empty
 * input yields an empty array.
 *
 * Accepts the raw output either as a single string (any newline style) or as
 * an array of already-split lines — the compile flow has both shapes.
 */
export function parseDiagnostics(output: string | string[]): Diagnostic[] {
  const lines = Array.isArray(output)
    ? output
    : output.split(/\r\n|\r|\n/);

  const diagnostics: Diagnostic[] = [];
  for (const line of lines) {
    const d = parseDiagnosticLine(line);
    if (d) diagnostics.push(d);
  }
  return diagnostics;
}

/** Counts of errors and warnings across a diagnostics list. */
export interface DiagnosticCounts {
  errors: number;
  warnings: number;
}

/** Tally errors vs. warnings — used by the status bar summary. */
export function countDiagnostics(diagnostics: Diagnostic[]): DiagnosticCounts {
  let errors = 0;
  let warnings = 0;
  for (const d of diagnostics) {
    if (d.severity === "error") errors++;
    else warnings++;
  }
  return { errors, warnings };
}

/** One file's diagnostics, grouped under its path, in first-seen order. */
export interface DiagnosticGroup {
  file: string;
  diagnostics: Diagnostic[];
}

/**
 * Group diagnostics by file, preserving the order each file first appears in
 * — the shape the Problems panel renders.
 */
export function groupDiagnostics(diagnostics: Diagnostic[]): DiagnosticGroup[] {
  const groups: DiagnosticGroup[] = [];
  const byFile = new Map<string, DiagnosticGroup>();
  for (const d of diagnostics) {
    let group = byFile.get(d.file);
    if (!group) {
      group = { file: d.file, diagnostics: [] };
      byFile.set(d.file, group);
      groups.push(group);
    }
    group.diagnostics.push(d);
  }
  return groups;
}
