import "./ActionBar.css";
import { Check, Upload, Columns2 } from "lucide-preact";
import {
  buildPhase,
  sketchProfiles,
  editorGroups,
  openTabs,
} from "../state/appState";
import { compileSketch, uploadSketch, splitEditorRight } from "../lib/actions";
import { BoardSelector } from "./BoardSelector";
import { ConnectionPill } from "./ConnectionPill";
import { ProfilePill } from "./ProfilePill";

export function ActionBar() {
  const phase = buildPhase.value;
  const busy = phase === "compiling" || phase === "uploading";
  // The pill only makes sense for sketches that ship a `sketch.yaml` with at
  // least one profile — hide it everywhere else so the toolbar stays calm.
  const showProfilePill = sketchProfiles.value.length > 0;
  // The Split button only makes sense when there's a single pane with
  // something open to clone. Hidden in any other state so the toolbar
  // stays calm. (After the split the pane-X in the tab strip undoes it.)
  const showSplitBtn = editorGroups.value.length === 1 && openTabs.value.length > 0;
  return (
    <div class="actionbar">
      <button
        class="btn btn-ghost"
        title="Compile the sketch and check for errors"
        onClick={compileSketch}
        disabled={busy}
      >
        <Check size={14} strokeWidth={1.5} />
        <span>{phase === "compiling" ? "Checking…" : "Check code"}</span>
      </button>

      <button
        class="btn btn-primary"
        title="Compile and upload to the board"
        onClick={uploadSketch}
        disabled={busy}
      >
        <span>{phase === "uploading" ? "Uploading…" : "Upload"}</span>
        <Upload size={14} strokeWidth={1.5} />
      </button>

      <div class="actionbar-spacer" />

      {showSplitBtn && (
        <button
          class="btn btn-icon"
          title="Split Editor Right (Ctrl+\\)"
          aria-label="Split Editor Right"
          onClick={splitEditorRight}
        >
          <Columns2 size={14} strokeWidth={1.5} />
        </button>
      )}

      <BoardSelector />
      {showProfilePill && <ProfilePill />}
      <ConnectionPill />

      {busy && <div class="actionbar-progress" />}
    </div>
  );
}
