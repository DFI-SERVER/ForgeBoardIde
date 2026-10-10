import { useEffect, useRef, useState } from "preact/hooks";
import { Check, ChevronDown } from "lucide-preact";
import { activeProfile, sketchProfiles } from "@/features/boards/state";
import { currentSketch } from "@/features/project/state";
import { writeSketchProfile } from "@/features/boards/sketch-profile-store";
import "./ProfilePill.css";

/**
 * The reproducible-build profile pill — visible only when the open sketch
 * carries a `sketch.yaml`. Clicking it opens a dropdown of the file's
 * profiles plus an escape hatch ("Use board picker instead") that returns
 * control to the global board selector by clearing `activeProfile`.
 *
 * Caller is responsible for hiding this component when no profiles exist;
 * see ActionBar.tsx. Render-time behaviour: nothing to draw when the list
 * is empty, so we bail to avoid an empty wrapper polluting the toolbar.
 */
export function ProfilePill() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside — same pattern as BoardSelector / ConnectionPill.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const profiles = sketchProfiles.value;
  const active = activeProfile.value;
  if (profiles.length === 0) return null;

  // Lead with the active name; fall back to the literal "(none)" when the
  // user has opted out of profile mode, so the pill still reads naturally.
  const label = active ?? "(none)";

  function pick(name: string | null) {
    activeProfile.value = name;
    // Persist the explicit choice on the current sketch so a reopen
    // restores it instead of reverting to default_profile. `null` clears
    // the entry (the user is back on the global board selector).
    const sk = currentSketch.value;
    if (sk) writeSketchProfile(sk.path, name);
    setOpen(false);
  }

  return (
    <div class="pp-wrapper" ref={wrapRef}>
      <button
        class={`pp-btn ${active ? "pp-active" : ""}`}
        title="Reproducible-build profile from sketch.yaml"
        onClick={() => setOpen(!open)}
      >
        <span class="pp-prefix">Profile:</span>
        <span class="pp-label">{label}</span>
        <span class="pp-caret">
          <ChevronDown size={14} strokeWidth={1.5} color="currentColor" />
        </span>
      </button>

      {open && (
        <div class="pp-dropdown">
          <div class="pp-head">sketch.yaml profiles</div>
          {profiles.map((p) => (
            <button
              key={p.name}
              class={`pp-item ${p.name === active ? "active" : ""}`}
              onClick={() => pick(p.name)}
            >
              <span class="pp-item-check">
                {p.name === active ? (
                  <Check size={14} strokeWidth={1.75} color="currentColor" />
                ) : null}
              </span>
              <span class="pp-item-body">
                <span class="pp-item-name">{p.name}</span>
                <span class="pp-item-fqbn">{p.fqbn}</span>
                {p.notes && <span class="pp-item-notes">{p.notes}</span>}
              </span>
            </button>
          ))}
          <div class="pp-sep" />
          <button
            class={`pp-item ${active === null ? "active" : ""}`}
            onClick={() => pick(null)}
          >
            <span class="pp-item-check">
              {active === null ? (
                <Check size={14} strokeWidth={1.75} color="currentColor" />
              ) : null}
            </span>
            <span class="pp-item-body">
              <span class="pp-item-name">Use board picker instead</span>
              <span class="pp-item-notes">Ignore sketch.yaml; use global FQBN.</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
