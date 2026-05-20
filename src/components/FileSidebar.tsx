import "./FileSidebar.css";
import {
  currentSketch,
  activeRail,
  openTabs,
  activeTabIndex,
  fileContents,
} from "../state/appState";
import { projectApi } from "../ipc/project";
import { BoardsView } from "./BoardsView";

function FilesView() {
  const sketch = currentSketch.value;
  if (!sketch) return <div class="sb-placeholder">No sketch open.</div>;

  const activeTab = openTabs.value[activeTabIndex.value];

  return (
    <>
      <div class="sb-header">
        <span class="sb-title">Your files</span>
        <span
          class="sb-new"
          onClick={async () => {
            const name = prompt("New sketch name:");
            if (!name) return;
            try {
              const created = await projectApi.create(name);
              currentSketch.value = created;
              const contents = new Map<string, string>();
              for (const f of created.files) {
                contents.set(f.path, await projectApi.readFile(f.path));
              }
              fileContents.value = contents;
              openTabs.value = created.files.map((f) => ({
                path: f.path,
                name: f.name,
                modified: false,
              }));
              activeTabIndex.value = 0;
            } catch (e) {
              alert(`Couldn't create: ${e}`);
            }
          }}
        >
          + new
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
            {f.is_main && <span class="sb-mod">◆</span>}
            {f.name}
          </div>
        ))}
      </div>
    </>
  );
}

function PlaceholderView({ label }: { label: string }) {
  return (
    <div class="sb-body">
      <div class="sb-placeholder">{label} view coming in a later phase.</div>
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
