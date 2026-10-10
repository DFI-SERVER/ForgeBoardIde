import { useEffect, useRef, useState } from "preact/hooks";
import { serialApi, ensureSerialListeners } from "@/ipc/serial";
import {
  serialLog,
  appendSerialLog,
  serialBaud,
  serialLineEnding,
  serialConnected,
} from "@/features/serial/state";
import { connectedPort } from "@/features/boards/state";
import { toast } from "@/app/state";
import "./SerialMonitor.css";

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

function info(text: string) {
  appendSerialLog({ ts: Date.now(), text, kind: "info" });
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
      appendSerialLog({ ts: Date.now(), text: `> ${input}`, kind: "tx" });
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
          onChange={async (e) => {
            const newBaud = Number((e.target as HTMLSelectElement).value);
            // If the port is open, the chip is already negotiated at the
            // OLD baud — silently flipping the signal would leave the IDE
            // talking at the new rate while the port stays at the old one,
            // producing the classic "garbage characters" effect. Close and
            // reopen the port atomically so the wire matches the UI.
            if (serialConnected.value) {
              const port = connectedPort.value;
              try {
                await serialApi.close();
                serialConnected.value = false;
                serialBaud.value = newBaud;
                if (port) {
                  await serialApi.open(port, newBaud);
                  serialConnected.value = true;
                  toast.value = {
                    text: `Reconnected at ${newBaud} baud`,
                    kind: "info",
                  };
                }
              } catch (err) {
                // Leave the port closed and let the user reopen manually
                // — better than silently re-connecting at the wrong rate.
                serialBaud.value = newBaud;
                toast.value = {
                  text: `Couldn't reopen at ${newBaud} baud: ${String(err)}`,
                  kind: "warn",
                };
              }
            } else {
              serialBaud.value = newBaud;
            }
          }}
        >
          {BAUD_RATES.map((b) => (
            <option value={b}>{b}</option>
          ))}
        </select>
        <div class="sm-seg-group" role="group" aria-label="Line ending">
          {(
            [
              { label: "LF", value: "\n", title: "Line feed (\\n)" },
              { label: "CRLF", value: "\r\n", title: "Carriage return + line feed (\\r\\n)" },
              { label: "CR", value: "\r", title: "Carriage return (\\r)" },
              { label: "None", value: "", title: "No line ending appended" },
            ] as const
          ).map((opt) => {
            const active = serialLineEnding.value === opt.value;
            return (
              <button
                key={opt.label}
                type="button"
                class={`sm-seg${active ? " active" : ""}`}
                title={opt.title}
                aria-pressed={active}
                onClick={() =>
                  (serialLineEnding.value = opt.value as typeof serialLineEnding.value)
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div class="sm-spacer" />
        <button class="sm-btn-ghost" onClick={() => (serialLog.value = [])}>
          Clear
        </button>
      </div>

      <div class="sm-log">
        {serialLog.value.length === 0 && (
          <div class="sm-empty">
            no output &middot; connect to {connectedPort.value ?? "a port"} to begin
          </div>
        )}
        {serialLog.value.map((entry, i) => (
          <div key={i} class={`sm-entry sm-${entry.kind}`}>
            <span class="sm-ts">{formatTime(entry.ts)}</span>
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
              ? "type a message and press Enter"
              : "connect first"
          }
          disabled={!serialConnected.value}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          onKeyDown={onKeyDown}
        />
        <button class="sm-send" onClick={sendInput} disabled={!serialConnected.value}>
          Send &crarr;
        </button>
      </div>
    </div>
  );
}
