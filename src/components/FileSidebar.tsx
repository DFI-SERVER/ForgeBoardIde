import "./FileSidebar.css";
import { useState } from "preact/hooks";
import { open as openNativeDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, FilePlus2 } from "lucide-preact";
import {
  currentSketch,
  activeRail,
  openTabs,
  activeTabIndex,
  toast,
} from "../state/appState";
import { projectApi } from "../ipc/project";
import { loadSketch } from "../lib/sketch";
import { BoardsView } from "./BoardsView";
import { Modal } from "./Modal";

/** Pull a readable message out of a thrown value (incl. serialized ProjectError). */
function errText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

function FilesView() {
  const sketch = currentSketch.value;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  if (!sketch) return <div class="sb-placeholder">No sketch open.</div>;

  const activeTab = openTabs.value[activeTabIndex.value];

  async function startNewSketch() {
    setName("");
    setError("");
    setCreating(false);
    let root = "";
    try {
      root = await projectApi.sketchesRoot();
    } catch {
      /* leave blank — the backend falls back to the default location */
    }
    setLocation(root);
    setDialogOpen(true);
  }

  async function browseLocation() {
    const picked = await openNativeDialog({
      directory: true,
      title: "Choose where to save the sketch",
    });
    if (typeof picked === "string") setLocation(picked);
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
      const created = await projectApi.create(trimmed, location || null);
      await loadSketch(created);
      setDialogOpen(false);
    } catch (e) {
      setError(`Couldn't create the sketch: ${errText(e)}`);
    } finally {
      setCreating(false);
    }
  }

  async function openExistingSketch() {
    const picked = await openNativeDialog({
      directory: true,
      title: "Open a sketch folder",
    });
    if (typeof picked !== "string") return;
    try {
      const opened = await projectApi.open(picked);
      await loadSketch(opened);
    } catch (e) {
      toast.value = {
        text: `Couldn't open that folder: ${errText(e)}`,
        kind: "warn",
      };
    }
  }

  return (
    <>
      <div class="sb-header">
        <span class="sb-title">Your files</span>
        <span class="sb-actions">
          <button
            class="sb-action"
            title="Open sketch…"
            onClick={openExistingSketch}
          >
            <FolderOpen size={15} strokeWidth={1.75} />
          </button>
          <button class="sb-action" title="New sketch" onClick={startNewSketch}>
            <FilePlus2 size={15} strokeWidth={1.75} />
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
          <label class="dlg-label dlg-label-spaced">Location</label>
          <div class="dlg-location">
            <span class="dlg-location-path" title={location}>
              {location || "Default sketches folder"}
            </span>
            <button class="dlg-btn dlg-btn-sm" onClick={browseLocation}>
              Browse…
            </button>
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
