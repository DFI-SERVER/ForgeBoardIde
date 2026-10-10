import "./WindowControls.css";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Real frameless-window controls. getCurrentWindow() is called lazily in the
 *  handlers so the component still renders fine outside a Tauri runtime (tests,
 *  browser preview). */
export function WindowControls() {
  return (
    <div class="window-controls">
      <button
        class="win-btn"
        title="Minimize"
        onClick={() => getCurrentWindow().minimize()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" stroke-width="1" />
        </svg>
      </button>
      <button
        class="win-btn"
        title="Maximize"
        onClick={() => getCurrentWindow().toggleMaximize()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1" />
        </svg>
      </button>
      <button
        class="win-btn win-close"
        title="Close"
        onClick={() => getCurrentWindow().close()}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" stroke-width="1" />
          <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" stroke-width="1" />
        </svg>
      </button>
    </div>
  );
}
