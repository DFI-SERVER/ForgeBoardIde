// types.ts — shared UI types for the mobile IDE shell.

export type Screen = "sketches" | "editor" | "serial" | "connect" | "libraries" | "settings";
export type Theme = "dark" | "light";
export type Nav = "tabbar" | "verb";
export type CodeFont = "JetBrains Mono" | "IBM Plex Mono" | "Fira Code";

/** USB-OTG connect journey: plug in → grant → connected → unplugged. */
export type OtgState = "waiting" | "detected" | "connected" | "unplugged";

/** User-tunable preferences — surfaced in the in-app Settings screen. */
export interface Tweaks {
  theme: Theme;
  nav: Nav;
  codeFont: CodeFont;
  gutter: boolean;
  keyRow: boolean;
}

export const CODE_FONTS: Record<CodeFont, string> = {
  "JetBrains Mono": "'JetBrains Mono', monospace",
  "IBM Plex Mono": "'IBM Plex Mono', monospace",
  "Fira Code": "'Fira Code', monospace",
};
