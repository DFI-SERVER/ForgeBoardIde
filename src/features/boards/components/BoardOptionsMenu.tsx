import { useEffect, useRef, useState } from "preact/hooks";
import { SlidersHorizontal } from "lucide-preact";
import { arduinoApi } from "@/ipc/arduino";
import { selectedFqbn, activeProfile } from "@/features/boards/state";
import {
  baseFqbn,
  boardOptions,
  boardOptionCatalog,
  changedCount,
  clearBoardOptions,
  effectiveOptionValue,
  setBoardOption,
} from "@/features/boards/board-options";
import "./BoardOptionsMenu.css";

/**
 * Board options menu — what Arduino IDE puts under Tools: USB CDC On Boot,
 * Partition Scheme, Flash Size, Upload Speed, PSRAM, Core Debug Level, …
 * Fetched from `arduino-cli board details` once per board and cached for
 * the session. Choices persist per board and go into the build FQBN.
 */
export function BoardOptionsMenu() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const base = baseFqbn(selectedFqbn.value);
  const catalog = boardOptionCatalog.value[base];
  const chosen = boardOptions.value[base];

  // Fetch the option list for the current board the first time it is needed.
  useEffect(() => {
    if (catalog || loading) return;
    setLoading(true);
    setError(null);
    arduinoApi
      .boardDetails(base)
      .then((d) => {
        boardOptionCatalog.value = { ...boardOptionCatalog.value, [base]: d.options };
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [base]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Nothing to offer: boards without menu options, or a core not installed.
  if (!loading && !error && (!catalog || catalog.length === 0)) return null;

  const changed = catalog ? changedCount(catalog, chosen) : 0;
  const profileActive = activeProfile.value !== null;

  return (
    <div class="bo-wrapper" ref={wrapRef}>
      <button
        class={`bo-btn ${changed > 0 ? "bo-btn-changed" : ""}`}
        title={profileActive ? "Board options (a sketch profile is active — it decides the board)" : "Board options"}
        aria-label="Board options"
        onClick={() => setOpen(!open)}
      >
        <SlidersHorizontal size={14} strokeWidth={1.5} />
        {changed > 0 && <span class="bo-badge">{changed}</span>}
      </button>

      {open && (
        <div class="bo-dropdown">
          <div class="bo-head">
            <span>Board options</span>
            {changed > 0 && (
              <button class="bo-reset" onClick={() => clearBoardOptions(base)}>
                Reset to defaults
              </button>
            )}
          </div>
          {profileActive && (
            <div class="bo-note">A sketch profile is active; it decides the board and these options are not used.</div>
          )}
          {loading && <div class="bo-note">Loading options…</div>}
          {error && <div class="bo-note bo-error">Couldn't read board options: {error}</div>}
          {catalog?.map((o) => {
            const current = effectiveOptionValue(base, o, chosen);
            const def = o.values.find((v) => v.selected)?.value;
            return (
              <label key={o.option} class={`bo-row ${chosen?.[o.option] && chosen[o.option] !== def ? "bo-row-changed" : ""}`}>
                <span class="bo-label">{o.label}</span>
                <select
                  class="bo-select"
                  value={current}
                  onChange={(e) => {
                    const v = (e.target as HTMLSelectElement).value;
                    // Choosing the platform default clears the stored choice,
                    // except where the backend applies its own rule (ESP32-S3
                    // CDC) — there the explicit value must be kept.
                    const backendRule = base === "esp32:esp32:esp32s3" && o.option === "CDCOnBoot";
                    setBoardOption(base, o.option, v === def && !backendRule ? "" : v);
                  }}
                >
                  {o.values.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                      {v.selected ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
