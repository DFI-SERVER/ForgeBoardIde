import { useEffect, useRef, useState } from "preact/hooks";
import { serialApi, ensureSerialListeners } from "../ipc/serial";
import {
  serialLog,
  serialBaud,
  serialLineEnding,
  serialConnected,
  connectedPort,
} from "../state/appState";
import "./SerialMonitor.css";

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

function info(text: string) {
  serialLog.value = [...serialLog.value, { ts: Date.now(), text, kind: "info" }];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(
    d.getMilliseconds(),
  ).padStart(3, "0")}`;
}

export function SerialMonitor() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const endRef = useRef<HTMLDivElement>(null);

  // Listeners are installed app-wide (idempotent) so lines survive tab switches.
  useEffect(() => {
    ensureSerialListeners();
  }, []);

  // Auto-scroll to the newest line.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [serialLog.value]);

  async function toggleConnection() {
    if (serialConnected.value) {
      await serialApi.close();
      serialConnected.value = false;
      info("[disconnected]");
      return;
    }
    const port = connectedPort.value;
    if (!port) {
      info("[no port selected — connect a board first]");
      return;
    }
    try {
      await serialApi.open(port, serialBaud.value);
      serialConnected.value = true;
      info(`[connected to ${port} at ${serialBaud.value} baud]`);
    } catch (e) {
      info(`[couldn't open ${port}: ${String(e)}]`);
    }
  }

  async function sendInput() {
    if (!input.trim() || !serialConnected.value) return;
    const payload = input + serialLineEnding.value;
    const bytes = Array.from(new TextEncoder().encode(payload));
    try {
      await serialApi.write(bytes);
      serialLog.value = [
        ...serialLog.value,
        { ts: Date.now(), text: `> ${input}`, kind: "tx" },
      ];
      setHistory([input, ...history].slice(0, 50));
      setHistIdx(-1);
      setInput("");
    } catch (e) {
      info(`[write failed: ${String(e)}]`);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      sendInput();
    } else if (e.key === "ArrowUp" && history.length > 0) {
      e.preventDefault();
      const next = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(next);
      setInput(history[next]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx > 0) {
        const next = histIdx - 1;
        setHistIdx(next);
        setInput(history[next]);
      } else {
        setHistIdx(-1);
        setInput("");
      }
    }
  }

  return (
    <div class="sm">
      <div class="sm-toolbar">
        <button
          class={`sm-btn ${serialConnected.value ? "connected" : ""}`}
          onClick={toggleConnection}
        >
          <span class="sm-dot" />
          {serialConnected.value ? "Disconnect" : "Connect"}
        </button>
        <select
          class="sm-select"
          value={serialBaud.value}
          onChange={(e) =>
            (serialBaud.value = Number((e.target as HTMLSelectElement).value))
          }
        >
          {BAUD_RATES.map((b) => (
            <option value={b}>{b}</option>
          ))}
        </select>
        <select
          class="sm-select"
          value={serialLineEnding.value}
          onChange={(e) =>
            (serialLineEnding.value = (e.target as HTMLSelectElement)
              .value as typeof serialLineEnding.value)
          }
        >
          <option value={"\n"}>LF</option>
          <option value={"\r\n"}>CRLF</option>
          <option value={"\r"}>CR</option>
          <option value={""}>No line ending</option>
        </select>
        <div class="sm-spacer" />
        <button class="sm-btn-ghost" onClick={() => (serialLog.value = [])}>
          Clear
        </button>
      </div>

      <div class="sm-log">
        {serialLog.value.length === 0 && (
          <div class="sm-empty">
            No serial output. Click Connect to open {connectedPort.value ?? "a port"}.
          </div>
        )}
        {serialLog.value.map((entry, i) => (
          <div key={i} class={`sm-entry sm-${entry.kind}`}>
            <span class="sm-ts">[{formatTime(entry.ts)}]</span>
            {entry.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div class="sm-input-row">
        <span class="sm-prompt">&gt;</span>
        <input
          class="sm-input"
          value={input}
          placeholder={
            serialConnected.value
              ? "type a message, Enter to send"
              : "connect to a port first…"
          }
          disabled={!serialConnected.value}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          onKeyDown={onKeyDown}
        />
        <button class="sm-send" onClick={sendInput} disabled={!serialConnected.value}>
          Send
        </button>
      </div>
    </div>
  );
}
