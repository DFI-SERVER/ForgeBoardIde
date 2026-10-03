import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

/**
 * Spawn a new ForgeBoard IDE window with a fresh app instance.
 *
 * Each window runs its own copy of the app (separate JS context, separate
 * signals, separate Monaco models), so two sketches can live side-by-side
 * without the "new sketch replaces the current one" trap. The window
 * bootstraps from the same URL the main window uses, so once mounted it's
 * a fully-functional IDE pointing at a blank workspace.
 *
 * Window labels are namespaced under `sketch-` so the default capability's
 * `windows: ["main", "sketch-*"]` glob grants new windows the same IPC
 * permissions as the main one without us having to declare a per-window
 * capability for each new label.
 *
 * When `sketchPath` is supplied the new window opens that sketch on
 * launch — the path is passed via the URL hash (`#sketch=<encoded>`),
 * which `bootstrapProject` reads before falling back to the most-recent
 * entry. Without a path the window opens whatever the recent list
 * surfaces, identical to the main window's first-launch behaviour.
 *
 * Rejects when window creation fails (capability missing, OS refused,
 * URL invalid). Callers in the UI should turn that into a toast rather
 * than letting it escape unhandled.
 */
export async function spawnNewSketchWindow(
  sketchPath?: string,
): Promise<WebviewWindow> {
  const label = `sketch-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const url = sketchPath
    ? `/#sketch=${encodeURIComponent(sketchPath)}`
    : "/";
  const win = new WebviewWindow(label, {
    url,
    title: "ForgeBoard IDE",
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    center: true,
    decorations: false,
    resizable: true,
    // Matches the main window's pre-paint color (tauri.conf.json) so a
    // new window never flashes white before the webview's first frame.
    backgroundColor: "#181a23",
  });

  return new Promise<WebviewWindow>((resolve, reject) => {
    // tauri://created fires once the webview is mounted and the app is
    // about to hydrate. The new window is then a fully independent
    // ForgeBoard IDE instance.
    const okPromise = win.once("tauri://created", () => resolve(win));
    const errPromise = win.once("tauri://error", (e) => {
      reject(new Error(`failed to create window: ${JSON.stringify(e.payload)}`));
    });
    // Wire up the listeners; Promise.race isn't needed because tauri only
    // ever fires one of these per window-creation attempt.
    void Promise.all([okPromise, errPromise]);
  });
}

/**
 * Read the `#sketch=<encodedPath>` hint from the current window's URL hash,
 * if any. Returns the decoded sketch path or null when no override is
 * present. Used by `bootstrapProject` to decide whether to open a specific
 * sketch (passed via {@link spawnNewSketchWindow}) instead of the most-recent
 * one.
 *
 * The hint is consumed once and cleared from the URL so a window reload
 * doesn't keep reopening the same sketch — the user may have navigated
 * away in the meantime.
 */
export function consumeSketchHashOverride(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash.startsWith("#sketch=")) return null;
  const encoded = hash.slice("#sketch=".length);
  try {
    const decoded = decodeURIComponent(encoded);
    // Clear the hash so a subsequent reload doesn't reopen the same sketch.
    history.replaceState(null, "", window.location.pathname + window.location.search);
    return decoded;
  } catch {
    return null;
  }
}
