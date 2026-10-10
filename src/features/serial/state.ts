/**
 * Serial Monitor log and port settings.
 */
import { signal } from "@preact/signals";

/** Serial Monitor log — received lines, sent lines, and info notices. */
export interface SerialLogEntry {
  ts: number;
  text: string;
  kind: "rx" | "tx" | "info";
}

export const serialLog = signal<SerialLogEntry[]>([]);

/** Cap on retained serial log entries. A device printing at high baud can
 *  emit hundreds of lines per second; without a cap the array (and the DOM
 *  list rendered from it) grows for as long as the port stays open. */
export const MAX_SERIAL_LOG_ENTRIES = 5000;

/** Monotonic count of entries ever appended to `serialLog`. Never decreases,
 *  even when the cap trims old entries or Clear empties the log — the Serial
 *  Plotter uses it to track how much of the stream it has consumed, which an
 *  array index can't express once the head starts being dropped. */
export const serialLogTotal = signal<number>(0);

/** Append one entry to the serial log, trimming the oldest past the cap.
 *  Every writer goes through here so the cap and `serialLogTotal` stay
 *  consistent. `serialLogTotal` is updated first so a subscriber reacting to
 *  `serialLog` always sees the matching total. */
export function appendSerialLog(entry: SerialLogEntry): void {
  const next = [...serialLog.value, entry];
  if (next.length > MAX_SERIAL_LOG_ENTRIES) {
    next.splice(0, next.length - MAX_SERIAL_LOG_ENTRIES);
  }
  serialLogTotal.value = serialLogTotal.value + 1;
  serialLog.value = next;
}

export const serialBaud = signal<number>(115200);

export const serialLineEnding = signal<"\n" | "\r\n" | "\r" | "">("\n");

export const serialConnected = signal<boolean>(false);
