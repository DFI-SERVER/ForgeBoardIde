import "./ActionBar.css";
import { Check, Upload, Columns2 } from "lucide-preact";
import { buildPhase, buildProgress } from "@/features/build/state";
import { sketchProfiles } from "@/features/boards/state";
import { editorGroups, openTabs } from "@/features/editor/state";
import { compileSketch, uploadSketch } from "@/features/build/actions";
import { splitEditorRight } from "@/features/editor/actions";
import { BoardSelector } from "@/features/boards/components/BoardSelector";
import { BoardOptionsMenu } from "@/features/boards/components/BoardOptionsMenu";
import { ConnectionPill } from "@/features/boards/components/ConnectionPill";
import { ProfilePill } from "@/features/boards/components/ProfilePill";

/**
 * The toolbar. Check Code and Upload are the two primary actions, in red,
 * first thing on the left. While a build runs, the status line next to them
 * shows the real stage and percentage (see `features/build/progress.ts`) and
 * the bar underneath is determinate — no looping animation.
 */
export function ActionBar() {
  const phase = buildPhase.value;
  const busy = phase === "compiling" || phase === "uploading";
  const progress = buildProgress.value;
  // The pill only makes sense for sketches that ship a `sketch.yaml` with at
  // least one profile — hide it everywhere else so the toolbar stays calm.
  const showProfilePill = sketchProfiles.value.length > 0;
  // The Split button only makes sense when there's a single pane with
  // something open to clone.
  const showSplitBtn = editorGroups.value.length === 1 && openTabs.value.length > 0;
  const pct = progress?.percent ?? null;
  const statusText = busy
    ? progress
      ? `${progress.stage}${pct !== null ? ` · ${pct}%` : ""}`
      : phase === "compiling"
        ? "Starting…"
        : "Starting upload…"
    : phase === "success"
      ? "Done"
      : phase === "error"
        ? "Failed — see Problems"
        : "";

  return (
    <div class="actionbar">
      <button
        class="btn btn-action"
        title="Compile the sketch and check for errors"
        onClick={compileSketch}
        disabled={busy}
      >
        <Check size={14} strokeWidth={2} />
        <span>{phase === "compiling" ? "Checking…" : "Check Code"}</span>
      </button>

      <button
        class="btn btn-action btn-action-upload"
        title="Compile and upload to the board"
        onClick={uploadSketch}
        disabled={busy}
      >
        <Upload size={14} strokeWidth={2} />
        <span>{phase === "uploading" ? "Uploading…" : "Upload"}</span>
      </button>

      {statusText && (
        <div class={`actionbar-status ${phase === "error" ? "is-error" : ""}`} role="status" aria-live="polite">
          {statusText}
        </div>
      )}

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
      <BoardOptionsMenu />
      {showProfilePill && <ProfilePill />}
      <ConnectionPill />

      {busy && (
        <div class={`actionbar-progress ${pct === null ? "is-indeterminate" : ""}`} aria-hidden="true">
          <div class="actionbar-progress-fill" style={pct !== null ? { width: `${pct}%` } : undefined} />
        </div>
      )}
    </div>
  );
}
