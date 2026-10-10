/**
 * Which desktop OS the webview is running on. Used only for chrome decisions
 * (native traffic lights vs. our own window buttons); everything hardware-
 * related is decided on the Rust side.
 *
 * WKWebView on macOS reports "Macintosh" in its user agent; WebView2 on
 * Windows reports "Windows"; WebKitGTK on Linux reports "Linux". jsdom in
 * tests reports none of these, so tests see the Windows/Linux layout.
 */
export const isMac: boolean =
  typeof navigator !== "undefined" && /Macintosh|Mac OS X/i.test(navigator.userAgent);
