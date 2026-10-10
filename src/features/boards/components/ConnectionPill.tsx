import { useEffect, useRef, useState } from "preact/hooks";
import { ChevronDown } from "lucide-preact";
import {
  connectionState,
  connectedPort,
  connectedBoard,
  detectedPorts,
  boardScanError,
  toolsPreparing,
  selectedFqbn,
} from "@/features/boards/state";
import { connectToPort } from "@/features/boards/connection";
import { forgeBoardForFqbn } from "@/features/boards/forge-boards";
import "./ConnectionPill.css";

/**
 * The toolbar connection pill — the single, honest indicator of which board
 * is connected. Four states (no-board / detecting / connected / unidentified)
 * driven by connectionState; the dropdown lists every detected port so the
 * user can switch, but auto-connect means they rarely need to.
 */
export function ConnectionPill() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when clicking outside it.
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

  const state = connectionState.value;
  const port = connectedPort.value;
  const forge = forgeBoardForFqbn(selectedFqbn.value);
  const board = forge ? `${forge.name} · ${forge.chip}` : connectedBoard.value;
  const ports = detectedPorts.value;
  // A scan that could not run is not "no board" — say so, in the same
  // warning style as an unidentified board, and explain in the dropdown.
  const scanError = state === "no-board" ? boardScanError.value : null;

  function pick(p: string) {
    setOpen(false);
    void connectToPort(p);
  }

  return (
    <div class="cp-wrapper" ref={wrapRef}>
      <button
        class={`cp-btn cp-${scanError ? "unidentified" : state}`}
        title={scanError ?? "Board connection"}
        onClick={() => setOpen(!open)}
      >
        <span class="cp-dot" />
        <span class="cp-label">
          {state === "no-board" &&
            (scanError
              ? "⚠ Board scan failed"
              : toolsPreparing.value
                ? "Preparing Arduino tools…"
                : "No board — plug one in")}
          {state === "detecting" && `Detecting board on ${port}…`}
          {state === "connected" && (
            <>
              <b>{board}</b> · {port}
            </>
          )}
          {state === "unidentified" && `⚠ Couldn't identify · ${port}`}
        </span>
        <span class="cp-caret">
          <ChevronDown size={14} strokeWidth={1.5} color="currentColor" />
        </span>
      </button>

      {open && (
        <div class="cp-dropdown">
          <div class="cp-head">
            Detected boards <span class="cp-muted">· live</span>
          </div>
          {ports.length === 0 ? (
            <div class="cp-empty">{scanError ?? "No boards detected. Plug one into USB."}</div>
          ) : (
            ports.map((p) => (
              <button
                key={p.port}
                class={`cp-item ${p.port === port ? "active" : ""}`}
                onClick={() => pick(p.port)}
              >
                <div class="cp-item-port">{p.port}</div>
                <div class="cp-item-name">{p.name ?? "Unknown device"}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
