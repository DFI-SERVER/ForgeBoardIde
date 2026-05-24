import "./ActionBar.css";
import { Check, Upload } from "lucide-preact";
import { buildPhase, sketchProfiles } from "../state/appState";
import { compileSketch, uploadSketch } from "../lib/actions";
import { BoardSelector } from "./BoardSelector";
import { ConnectionPill } from "./ConnectionPill";
import { ProfilePill } from "./ProfilePill";

export function ActionBar() {
  const phase = buildPhase.value;
  const busy = phase === "compiling" || phase === "uploading";
  // The pill only makes sense for sketches that ship a `sketch.yaml` with at
  // least one profile — hide it everywhere else so the toolbar stays calm.
  const showProfilePill = sketchProfiles.value.length > 0;
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

      <BoardSelector />
      {showProfilePill && <ProfilePill />}
      <ConnectionPill />

      {busy && <div class="actionbar-progress" />}
    </div>
  );
}
