/**
 * Turn a failed upload's output into one Problems-panel entry, so a flashing
 * or connection failure gets the same plain-language explanation and
 * numbered steps a compiler error does (Check → Debug → Solution).
 *
 * The compiler succeeded in this case, so there is no file or line; the
 * entry is attached to the sketch under a virtual "Upload" file. The message
 * is the one line of the flasher output that names the cause, which
 * `humanize-errors.ts` then matches.
 */
import type { Diagnostic } from "./diagnostics";

export const UPLOAD_FILE = "Upload";

/** The output line that best names an upload failure, or null if nothing fits. */
export function pickUploadFailureLine(lines: readonly string[]): string | null {
  const clean = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").trim()).filter(Boolean);
  const patterns: RegExp[] = [
    /A fatal error occurred: (.+)/i,
    /Failed to connect to [^:]+(?::.*)?/i,
    /could not open port.*/i,
    /Resource busy.*/i,
    /Access is denied.*/i,
    /Permission denied.*/i,
    /Bad CPU type in executable.*/i,
    /Exec format error.*/i,
    /No such file or directory.*/i,
    /Timed out waiting for packet.*/i,
    /invalid header.*/i,
    /Error during Upload: (.+)/i,
    /error: (.+)/i,
    /Error: (.+)/,
  ];
  for (const re of patterns) {
    for (let i = clean.length - 1; i >= 0; i--) {
      const m = clean[i].match(re);
      if (m) return (m[1] ?? m[0]).trim();
    }
  }
  return null;
}

export function uploadFailureDiagnostic(outputLines: readonly string[], stderr: string): Diagnostic | null {
  const msg = pickUploadFailureLine([...outputLines, ...stderr.split(/\r?\n/)]);
  if (!msg) return null;
  return { file: UPLOAD_FILE, line: 0, column: 0, severity: "error", message: msg };
}
