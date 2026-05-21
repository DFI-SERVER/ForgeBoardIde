import "./FileSidebar.css";
import { useState } from "preact/hooks";
import {
  currentSketch,
  activeRail,
  openTabs,
  activeTabIndex,
  fileContents,
} from "../state/appState";
import { projectApi } from "../ipc/project";
import { BoardsView } from "./BoardsView";
import { Modal } from "./Modal";

function FilesView() {
  const sketch = currentSketch.value;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  if (!sketch) return <div class="sb-placeholder">No sketch open.</div>;

  const activeTab = openTabs.value[activeTabIndex.value];

  function openDialog() {
    setName("");
    setError("");
    setDialogOpen(true);
  }

  async function createSketch() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name for the sketch.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const created = await projectApi.create(trimmed);
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
      setDialogOpen(false);
    } catch (e) {
      setError(`Couldn't create the sketch: ${e}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div class="sb-header">
        <span class="sb-title">Your files</span>
        <span class="sb-new" onClick={openDialog}>
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

      {dialogOpen && (
        <Modal title="New sketch" onClose={() => setDialogOpen(false)}>
          <label class="dlg-label" for="new-sketch-name">
            Sketch name
          </label>
          <input
            id="new-sketch-name"
            class="dlg-input"
            value={name}
            placeholder="my_sketch"
            autofocus
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createSketch();
            }}
          />
          <div class="dlg-hint">
            Created as its own folder in Documents/ForgeBoard/sketches.
          </div>
          {error && <div class="dlg-error">{error}</div>}
          <div class="dlg-actions">
            <button class="dlg-btn" onClick={() => setDialogOpen(false)}>
              Cancel
            </button>
            <button
              class="dlg-btn dlg-btn-primary"
              disabled={creating}
              onClick={createSketch}
            >
              {creating ? "Creating…" : "Create sketch"}
            </button>
          </div>
        </Modal>
      )}
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
