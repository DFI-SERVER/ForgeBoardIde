import { useEffect, useRef, useState } from "preact/hooks";
import { detectedPorts, connectedPort, selectedFqbn, toast } from "../state/appState";
import { arduinoApi } from "../ipc/arduino";
import "./PortSelector.css";

export function PortSelector() {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Re-detect ports every 2s while the dropdown is open.
  useEffect(() => {
    if (!open) return;
    const tick = async () => {
      try {
        detectedPorts.value = await arduinoApi.detectPorts();
      } catch {
        /* ignore transient detection errors */
      }
    };
    tick();
    timer.current = window.setInterval(tick, 2000);
    return () => {
      if (timer.current !== null) clearInterval(timer.current);
    };
  }, [open]);

  // Close when clicking outside the dropdown.
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

  const current = connectedPort.value;
  const ports = detectedPorts.value;

  async function pick(port: string) {
    connectedPort.value = port;
    setOpen(false);
    toast.value = `Detecting board on ${port}…`;
    try {
      const id = await arduinoApi.identifyBoard(port);
      selectedFqbn.value = id.fqbn;
      toast.value = `Detected ${id.name} on ${port}`;
    } catch {
      toast.value = `${port}: couldn't auto-detect — select the board manually.`;
    }
  }

  return (
    <div class="ps-wrapper" ref={wrapRef}>
      <button class="ps-btn" onClick={() => setOpen(!open)}>
        <span class={`ps-dot ${current ? "connected" : "idle"}`} />
        <span>{current ?? "No port"}</span>
        <span class="ps-caret">▾</span>
      </button>
      {open && (
        <div class="ps-dropdown">
          <div class="ps-head">
            Available ports <span class="ps-muted">· live</span>
          </div>
          {ports.length === 0 ? (
            <div class="ps-empty">No devices detected. Plug in your board.</div>
          ) : (
            ports.map((p) => (
              <button
                key={p.port}
                class={`ps-item ${p.port === current ? "active" : ""}`}
                onClick={() => pick(p.port)}
              >
                <div class="ps-item-port">{p.port}</div>
                <div class="ps-item-name">{p.name ?? "Unknown device"}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
