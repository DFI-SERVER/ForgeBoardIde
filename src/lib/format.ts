/**
 * Auto Format — a brace-depth re-indenter for Arduino / C++ source.
 *
 * It normalises indentation: every line is re-indented to its brace-nesting
 * depth and trailing whitespace is trimmed. It deliberately does NOT reflow
 * code, wrap long lines, or change spacing within a line — it is a safe,
 * predictable indenter, not a full formatter. Because it only ever rewrites
 * leading and trailing whitespace, it can never change what the code means.
 *
 * Brace counting ignores braces inside string literals, character literals
 * and comments, so a `{` inside `"text"` never shifts the indentation. Lines
 * that fall inside a block comment are emitted exactly as written — re-
 * indenting comment bodies would wreck aligned tables and ASCII diagrams.
 */

/** The scanner's running lexical state, carried from one line to the next. */
interface ScanState {
  /** True when inside an unterminated block comment. */
  inBlockComment: boolean;
}

/** What scanning one line's code revealed. */
interface LineScan {
  /** Net `{` minus `}` from real code on the line. */
  delta: number;
  /** Lexical state after the line — the next line's starting state. */
  next: ScanState;
}

/**
 * Count the net brace-depth change `line` contributes, ignoring any braces
 * inside strings, character literals or comments. `state` is the lexical
 * state at the START of the line; the returned `next` is the state after it.
 *
 * String and character literals never span lines in C/C++, so they reset per
 * line; only block-comment state is carried across.
 */
function scanLine(line: string, state: ScanState): LineScan {
  let inBlockComment = state.inBlockComment;
  let inString = false;
  let inChar = false;
  let delta = 0;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    const d = line[i + 1];

    if (inBlockComment) {
      if (c === "*" && d === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (c === "\\") i++; // skip the escaped character
      else if (c === '"') inString = false;
      continue;
    }
    if (inChar) {
      if (c === "\\") i++;
      else if (c === "'") inChar = false;
      continue;
    }

    // Plain code.
    if (c === "/" && d === "/") break; // line comment runs to end of line
    if (c === "/" && d === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "'") {
      inChar = true;
      continue;
    }
    if (c === "{") delta++;
    else if (c === "}") delta--;
  }

  return { delta, next: { inBlockComment } };
}

/**
 * Re-indent `source` so each line sits at its brace-nesting depth, using
 * `indentUnit` (e.g. two or four spaces) per level. A trailing newline and
 * CRLF line endings in the input are preserved.
 */
export function formatArduino(source: string, indentUnit: string): string {
  const hadCRLF = source.includes("\r\n");
  const hadTrailingNewline = /\n$/.test(source);
  const lines = source
    .replace(/\r\n/g, "\n")
    .replace(/\n$/, "")
    .split("\n");

  let depth = 0;
  let state: ScanState = { inBlockComment: false };
  const out: string[] = [];

  for (const raw of lines) {
    // A line inside a block comment is emitted verbatim — never re-indent a
    // comment body. Its braces still do not count (scanLine handles that).
    if (state.inBlockComment) {
      const scan = scanLine(raw, state);
      depth = Math.max(0, depth + scan.delta);
      state = scan.next;
      out.push(raw.replace(/\s+$/, ""));
      continue;
    }

    const trimmed = raw.trim();

    if (trimmed === "") {
      out.push("");
      continue;
    }

    // Preprocessor directives sit at column 0, as a C compiler expects.
    if (trimmed.startsWith("#")) {
      const scan = scanLine(raw, state);
      depth = Math.max(0, depth + scan.delta);
      state = scan.next;
      out.push(trimmed);
      continue;
    }

    // A line that opens with `}` closes a block started earlier, so it sits
    // one level out from the code that block encloses.
    const closesFirst = trimmed.startsWith("}");
    const indentDepth = Math.max(0, closesFirst ? depth - 1 : depth);
    out.push(indentUnit.repeat(indentDepth) + trimmed);

    const scan = scanLine(raw, state);
    depth = Math.max(0, depth + scan.delta);
    state = scan.next;
  }

  let result = out.join("\n");
  if (hadTrailingNewline) result += "\n";
  if (hadCRLF) result = result.replace(/\n/g, "\r\n");
  return result;
}
