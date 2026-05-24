import "./HomeView.css";
import { useEffect, useState } from "preact/hooks";
import { House, FilePlus2, FolderOpen, FileCode2 } from "lucide-preact";
import { newSketch, openSketch, openRecentSketch } from "../lib/actions";
import { projectApi, type RecentProject } from "../ipc/project";
import {
  connectedBoard,
  connectedPort,
  connectionState,
  type ConnectionState,
} from "../state/appState";

/**
 * Home — the activity rail's landing view.
 *
 * A compact quick-start hub in the sidebar: start or open a sketch, jump
 * back into a recent one, and see at a glance what board is connected.
 * Recent sketches come from the `project_list_recent` backend command; the
 * board line mirrors the honest connection state (see lib/connection.ts).
 */

/** Human label for the board line, by connection state. */
function boardLabel(state: ConnectionState, board: string | null): string {
  switch (state) {
    case "connected":
      return board ?? "Board connected";
    case "detecting":
      return "Identifying board…";
    case "unidentified":
      return "Unrecognised board";
    default:
      return "No board connected";
  }
}

export function HomeView() {
  const [recent, setRecent] = useState<RecentProject[]>([]);

  // Load the recent-sketches list whenever Home is shown. Home only mounts
  // when its rail is selected, so this re-runs each time the user returns.
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

  const state = connectionState.value;
  const port = connectedPort.value;

  return (
    <div class="hv">
      <div class="hv-header">
        <House class="hv-header-icon" size={16} strokeWidth={1.75} />
        <span class="hv-title">Home</span>
      </div>

      <div class="hv-body">
        {/* --- Quick start --- */}
        <div class="hv-section-label">Quick start</div>
        <div class="hv-actions">
          <button class="hv-action" onClick={() => newSketch()}>
            <FilePlus2 class="hv-action-icon" size={17} strokeWidth={1.5} />
            <span class="hv-action-text">
              <span class="hv-action-title">New sketch</span>
              <span class="hv-action-desc">Start from a blank template</span>
            </span>
          </button>
          <button class="hv-action" onClick={() => void openSketch()}>
            <FolderOpen class="hv-action-icon" size={17} strokeWidth={1.5} />
            <span class="hv-action-text">
              <span class="hv-action-title">Open sketch</span>
              <span class="hv-action-desc">Open an existing sketch folder</span>
            </span>
          </button>
        </div>

        {/* --- Recent sketches --- */}
        <div class="hv-section-label">Recent sketches</div>
        {recent.length === 0 ? (
          <div class="hv-empty">No recent sketches yet.</div>
        ) : (
          <ul class="hv-recent">
            {recent.slice(0, 8).map((r) => (
              <li key={r.path}>
                <button
                  class="hv-recent-row"
                  title={r.path}
                  onClick={() => void openRecentSketch(r.path)}
                >
                  <FileCode2
                    class="hv-recent-icon"
                    size={14}
                    strokeWidth={1.5}
                  />
                  <span class="hv-recent-name">{r.name}</span>
                  <span class="hv-recent-path">{r.path}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* --- Connected board --- */}
        <div class="hv-section-label">Board</div>
        <div class={`hv-board hv-board-${state}`}>
          <span class="hv-board-dot" />
          <div class="hv-board-text">
            <span class="hv-board-name">
              {boardLabel(state, connectedBoard.value)}
            </span>
            {port && <span class="hv-board-meta">{port}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
