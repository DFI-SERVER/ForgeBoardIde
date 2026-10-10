import "./HomeView.css";
import { useEffect, useState } from "preact/hooks";
import { newSketch, openSketch, openRecentSketch } from "@/features/project/actions";
import { projectApi, type RecentProject } from "@/ipc/project";
import {
  connectedBoard,
  connectedPort,
  connectionState,
  type ConnectionState,
} from "@/features/boards/state";
import { currentSketch } from "@/features/project/state";

/**
 * Home — the activity rail's landing view.
 *
 * Brutalist mono sidebar: `$ SECTION` headers in mono uppercase, file rows
 * with uppercase filenames, left accent stripe on the focused row. The
 * board card surfaces hardware state with a coloured dot (the only place
 * colour earns its keep in this panel). Recent sketches come from the
 * `project_list_recent` backend command.
 */

/** Human label for the board line, by connection state. */
function boardLabel(state: ConnectionState, board: string | null): string {
  switch (state) {
    case "connected":
      return board ?? "BOARD CONNECTED";
    case "detecting":
      return "IDENTIFYING…";
    case "unidentified":
      return "UNRECOGNISED BOARD";
    default:
      return "NO BOARD";
  }
}

export function HomeView() {
  const [recent, setRecent] = useState<RecentProject[]>([]);
  // Re-fetch when the open sketch changes so a freshly-created or freshly-opened
  // sketch shows up at the top of the list without leaving + returning to Home.
  const sketchPath = currentSketch.value?.path;

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
  }, [sketchPath]);

  const state = connectionState.value;
  const port = connectedPort.value;

  return (
    <div class="hv">
      <div class="hv-section">
        <div class="hv-section-head">$ QUICK START</div>
        <button class="hv-row hv-action" onClick={() => newSketch()}>
          <span class="hv-row-prefix">▸</span>
          <span class="hv-row-name">NEW SKETCH</span>
        </button>
        <button class="hv-row hv-action" onClick={() => void openSketch()}>
          <span class="hv-row-prefix">▸</span>
          <span class="hv-row-name">OPEN SKETCH</span>
        </button>
      </div>

      <div class="hv-section">
        <div class="hv-section-head">$ RECENT SKETCHES</div>
        {recent.length === 0 ? (
          <div class="hv-empty">no recent sketches</div>
        ) : (
          <ul class="hv-list">
            {recent.slice(0, 8).map((r) => (
              <li key={r.path}>
                <button
                  class="hv-row hv-file"
                  title={r.path}
                  onClick={() => void openRecentSketch(r.path)}
                >
                  <span class="hv-row-prefix">·</span>
                  <span class="hv-row-name">{r.name.toUpperCase()}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div class="hv-section">
        <div class="hv-section-head">$ BOARD</div>
        <div class={`hv-board hv-board-${state}`}>
          <span class="hv-board-dot" />
          <div class="hv-board-text">
            <span class="hv-board-name">
              {boardLabel(state, connectedBoard.value).toUpperCase()}
            </span>
            {port && <span class="hv-board-meta">{port}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
