import "./WelcomeScreen.css";
import { useEffect, useState } from "preact/hooks";
import {
  FilePlus2,
  FolderOpen,
  GraduationCap,
  FileCode2,
  Usb,
  CircuitBoard,
} from "lucide-preact";
import { newSketch, openSketch, openRecentSketch } from "../lib/actions";
import { projectApi, type RecentProject } from "../ipc/project";
import { activeRail } from "../state/appState";

/**
 * Welcome screen — the editor area's empty state.
 *
 * Shown by EditorArea whenever no file tab is open: a calm start screen
 * instead of a blank editor. It gives a beginner the four things they need
 * first — start a sketch, reopen a recent one, browse the examples, and the
 * reminder that uploading needs a board on USB.
 *
 * Actions reuse the shared handlers in lib/actions.ts, so "New sketch" here
 * behaves exactly like the menu and sidebar. The recent list comes from the
 * `project_list_recent` backend command.
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
        {/* --- Wordmark --- */}
        <div class="welcome-brand">
          <CircuitBoard
            class="welcome-brand-mark"
            size={28}
            strokeWidth={1.5}
          />
          <div class="welcome-wordmark">
            <span class="welcome-wordmark-name">ForgeBoard</span>
            <span class="welcome-wordmark-sub">Arduino IDE for ESP32</span>
          </div>
        </div>

        {/* --- Primary actions --- */}
        <div class="welcome-actions">
          <button class="welcome-action" onClick={() => newSketch()}>
            <FilePlus2
              class="welcome-action-icon"
              size={18}
              strokeWidth={1.5}
            />
            <span class="welcome-action-text">
              <span class="welcome-action-title">New sketch</span>
              <span class="welcome-action-desc">
                Start a fresh .ino from a blank template
              </span>
            </span>
          </button>
          <button class="welcome-action" onClick={() => void openSketch()}>
            <FolderOpen
              class="welcome-action-icon"
              size={18}
              strokeWidth={1.5}
            />
            <span class="welcome-action-text">
              <span class="welcome-action-title">Open sketch</span>
              <span class="welcome-action-desc">
                Open an existing sketch folder
              </span>
            </span>
          </button>
        </div>

        {/* --- Recent sketches --- */}
        <div class="welcome-section">
          <div class="welcome-section-label">Recent sketches</div>
          {recent.length === 0 ? (
            <div class="welcome-empty">
              No recent sketches yet — create your first one above.
            </div>
          ) : (
            <ul class="welcome-recent">
              {recent.slice(0, 6).map((r) => (
                <li key={r.path}>
                  <button
                    class="welcome-recent-row"
                    title={r.path}
                    onClick={() => void openRecentSketch(r.path)}
                  >
                    <FileCode2
                      class="welcome-recent-icon"
                      size={14}
                      strokeWidth={1.5}
                    />
                    <span class="welcome-recent-name">{r.name}</span>
                    <span class="welcome-recent-path">{r.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* --- Footer: browse examples + USB hint --- */}
        <div class="welcome-footer">
          <button
            class="welcome-link"
            onClick={() => (activeRail.value = "examples")}
          >
            <GraduationCap size={14} strokeWidth={1.5} />
            Browse examples
          </button>
          <div class="welcome-hint">
            <Usb size={14} strokeWidth={1.5} class="welcome-hint-icon" />
            Connect your board over USB to upload.
          </div>
        </div>
      </div>
    </div>
  );
}
