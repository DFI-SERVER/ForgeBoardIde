// boot.ts — single entry that picks the UI for the platform.
//
// The desktop and Android builds both load index.html, but they want very
// different frontends: the full desktop IDE vs. the touch-first mobile IDE.
// We branch on the webview's user agent (Tauri's Android System WebView
// reports "Android"; Windows WebView2 reports "Windows"). Each branch is a
// dynamic import, so the desktop bundle (Monaco, Tauri desktop wiring) never
// ships to the phone and vice-versa.
//
// The desktop boot (./main) is left completely untouched — it runs exactly as
// before when this picks the desktop branch.

const isMobileApp = /android|iphone|ipad|ipod/i.test(navigator.userAgent);

if (isMobileApp) {
  import("@/mobile/main");
} else {
  import("./main");
}
