import "./WelcomeScreen.css";
import { useEffect, useState } from "preact/hooks";
import { newSketch, openSketch, openRecentSketch } from "../lib/actions";
import { projectApi, type RecentProject } from "../ipc/project";

/**
 * Welcome screen — the editor area's empty state.
 *
 * Brand-first, calm, monochrome. A centred wordmark, a small caps tagline,
 * two ghost buttons, and a tight recents list. Shown by EditorArea whenever
 * no file tab is open. Hands off to `newSketch`/`openSketch` from
 * lib/actions so the menu, shortcut and welcome surfaces all behave the same.
 */
export function WelcomeScreen() {
  const [recent, setRecent] = useState<RecentProject[]>([]);

  // Load the recent-sketches list once when the screen mounts. The Welcome
  // screen only appears with no tabs open, so this is cheap and re-runs each
  // time the user returns to the empty state.
  useEffect(() => {
    let cancelled = false;
    projectApi
      .listRecent()
      .then((list) => {
        if (!cancelled) setRecent(list);
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div class="welcome" role="region" aria-label="Welcome">
      <div class="welcome-inner">
        <h1 class="welcome-wordmark" aria-label="ForgeBoard">
          <span class="welcome-wordmark-light">Forge</span>
          <span class="welcome-wordmark-bold">Board</span>
        </h1>
        <div class="welcome-tagline">Build &middot; Burn &middot; Run</div>

        <div class="welcome-actions">
          <button
            class="welcome-btn welcome-btn-primary"
            onClick={() => newSketch()}
          >
            New sketch
          </button>
          <button class="welcome-btn" onClick={() => void openSketch()}>
            Open sketch
          </button>
        </div>

        {recent.length > 0 && (
          <div class="welcome-recents">
            <div class="welcome-recents-label">Recent</div>
            <ul class="welcome-recents-list">
              {recent.slice(0, 5).map((r) => (
                <li key={r.path}>
                  <button
                    class="welcome-recents-row"
                    title={r.path}
                    onClick={() => void openRecentSketch(r.path)}
                  >
                    <span class="welcome-recents-name">{r.name}</span>
                    <span class="welcome-recents-path">{r.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
