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
