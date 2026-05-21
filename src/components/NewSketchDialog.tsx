import { useState } from "preact/hooks";
import { open as openNativeDialog } from "@tauri-apps/plugin-dialog";
import { newSketchDialogOpen } from "../state/appState";
import { projectApi } from "../ipc/project";
import { createSketch, errText } from "../lib/actions";
import { Modal } from "./Modal";

/**
 * The app-global "New sketch" dialog. Rendered once in App.tsx; opened by the
 * shared `newSketch()` action (File menu, sidebar "+ new" button). Collects a
 * name + location, creates the sketch, and loads it into the editor.
 */
export function NewSketchDialog() {
  if (!newSketchDialogOpen.value) return null;
  return <NewSketchDialogBody />;
}

function NewSketchDialogBody() {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // Resolve the default sketches root once, on first render of the open dialog.
  useState(() => {
    projectApi
      .sketchesRoot()
      .then((root) => setLocation(root))
      .catch(() => {
        /* leave blank — the backend falls back to the default location */
      });
  });

  const close = () => {
    newSketchDialogOpen.value = false;
  };

  async function browseLocation() {
    const picked = await openNativeDialog({
      directory: true,
      title: "Choose where to save the sketch",
    });
    if (typeof picked === "string") setLocation(picked);
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name for the sketch.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      await createSketch(trimmed, location || null);
      close();
    } catch (e) {
      setError(`Couldn't create the sketch: ${errText(e)}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal title="New sketch" onClose={close}>
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
          if (e.key === "Enter") submit();
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
        <button class="dlg-btn" onClick={close}>
          Cancel
        </button>
        <button
          class="dlg-btn dlg-btn-primary"
          disabled={creating}
          onClick={submit}
        >
          {creating ? "Creating…" : "Create sketch"}
        </button>
      </div>
    </Modal>
  );
}
