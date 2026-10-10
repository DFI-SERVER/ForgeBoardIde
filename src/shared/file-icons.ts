import { FileCode2, FileText } from "lucide-preact";

type LucideIcon = typeof FileCode2;

/** Extensions whose contents the C-brace formatter and language-aware
 *  features apply to. Kept in one place so every component that shows a
 *  file-type icon — tabs, sidebar, palette rows — uses the same test. */
export const C_LIKE_EXT = /\.(ino|pde|cpp|cxx|cc|c|h|hpp|hxx)$/i;

/** Pick a lucide icon from `path`'s file extension. Anything with a C-family
 *  extension gets the code icon; everything else gets the generic text icon. */
export function iconForName(path: string): LucideIcon {
  return C_LIKE_EXT.test(path) ? FileCode2 : FileText;
}

/**
 * Human-readable language label for the StatusBar from a file path's extension.
 * `.ino`/`.pde` are Arduino sketches; the broader C-family maps to "C++"; a few
 * common text formats get their own labels; anything else is "Plain".
 *
 * Matching is case-insensitive on the trailing extension.
 */
export function languageLabelForName(path: string): string {
  const m = /\.([^.\\/]+)$/.exec(path);
  if (!m) return "Plain";
  const ext = m[1].toLowerCase();
  switch (ext) {
    case "ino":
    case "pde":
      return "Arduino";
    case "cpp":
    case "cxx":
    case "cc":
    case "c":
    case "h":
    case "hpp":
    case "hxx":
      return "C++";
    case "json":
      return "JSON";
    case "md":
      return "Markdown";
    case "txt":
      return "Plain";
    default:
      return "Plain";
  }
}
