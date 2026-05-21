import "./FileSidebar.css";
import { FolderOpen, FilePlus2, FileCode2 } from "lucide-preact";
import {
  currentSketch,
  activeRail,
  openTabs,
  activeTabIndex,
} from "../state/appState";
import { newSketch, openSketch } from "../lib/actions";
import { BoardsView } from "./BoardsView";

function FilesView() {
  const sketch = currentSketch.value;

  if (!sketch) return <div class="sb-placeholder">No sketch open.</div>;

  const activeTab = openTabs.value[activeTabIndex.value];

  return (
    <>
      <div class="sb-header">
        <span class="sb-title">Your files</span>
        <span class="sb-actions">
          <button class="sb-action" title="Open sketch…" onClick={openSketch}>
            <FolderOpen size={16} strokeWidth={1.5} />
          </button>
          <button class="sb-action" title="New sketch" onClick={newSketch}>
            <FilePlus2 size={16} strokeWidth={1.5} />
          </button>
        </span>
      </div>
      <div class="sb-body">
        <div class="sb-section-label">SKETCH · {sketch.name}</div>
        {sketch.files.map((f) => (
          <div
            class={`sb-file ${activeTab?.path === f.path ? "active" : ""}`}
            onClick={() => {
              const idx = openTabs.value.findIndex((t) => t.path === f.path);
              if (idx >= 0) activeTabIndex.value = idx;
            }}
          >
            {f.is_main && (
              <span class="sb-mod" title="Main sketch file">
                <FileCode2 size={14} strokeWidth={1.5} />
              </span>
            )}
            <span class="sb-file-name">{f.name}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function PlaceholderView({ label }: { label: string }) {
  return (
    <div class="sb-body">
      <div class="sb-placeholder">{label} — coming soon.</div>
    </div>
  );
}

export function FileSidebar() {
  const rail = activeRail.value;
  return (
    <aside class="sidebar">
      {rail === "files" && <FilesView />}
      {rail === "home" && <PlaceholderView label="Home" />}
      {rail === "examples" && <PlaceholderView label="Examples" />}
      {rail === "search" && <PlaceholderView label="Search" />}
      {rail === "libraries" && <PlaceholderView label="Libraries" />}
      {rail === "boards" && <BoardsView />}
      {rail === "walkthrough" && <PlaceholderView label="Walkthrough" />}
      {rail === "settings" && <PlaceholderView label="Settings" />}
    </aside>
  );
}
