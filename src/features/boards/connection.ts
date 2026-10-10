/**
 * Board connection engine — always-on detection, auto-connect, and the
 * decision logic that drives the honest connection state.
 *
 * The pure decision (decideWatchAction) is unit-tested; startBoardWatch is
 * the thin imperative shell that runs it on a timer.
 */
import { arduinoApi } from "@/ipc/arduino";
import {
  connectedPort,
  connectedBoard,
  identifyInProgress,
  detectedPorts,
  selectedFqbn,
  boardScanError,
  toolsPreparing,
} from "./state";
import { toast } from "@/app/state";
import { buildPhase } from "@/features/build/state";
import { displayBoardName } from "./forge-boards";

/** Boards identified this session, by USB serial number (or port name when the
 *  device has none). Replugging or resetting a known board skips the probe. */
export const identityCache = new Map<string, { fqbn: string; name: string }>();

/** The cache key for a port: its USB serial number when known, else the port. */
export function identityKeyFor(port: string): string {
  const entry = detectedPorts.value.find((p) => p.port === port);
  return entry?.serial_number ? `usb:${entry.serial_number}` : `port:${port}`;
}

/** How often the watcher scans for connected boards. */
const POLL_INTERVAL_MS = 1000;

export type WatchAction =
  | { kind: "connect"; port: string }
  | { kind: "disconnect" }
  | { kind: "none" };

/**
 * Pure decision: given the port we are currently connected to and the
 * previous vs. current detected-port lists, decide what the watcher does.
 *
 * - The connected board vanished   -> disconnect
 * - Already connected and present  -> nothing
 * - Not connected, a board is there -> connect (preferring a fresh arrival)
 */
export function decideWatchAction(
  currentPort: string | null,
  prevPorts: string[],
  currPorts: string[],
): WatchAction {
  if (currentPort !== null && !currPorts.includes(currentPort)) {
    return { kind: "disconnect" };
  }
  if (currentPort !== null) {
    return { kind: "none" };
  }
  const arrived = currPorts.filter((p) => !prevPorts.includes(p));
  const port = arrived[0] ?? currPorts[0];
  return port !== undefined ? { kind: "connect", port } : { kind: "none" };
}

/**
 * Connect to `port`: select it, then identify the chip on it. Drives
 * connectedPort / identifyInProgress / connectedBoard / selectedFqbn and
 * raises a toast for the outcome. Safe against the board being unplugged
 * mid-probe — a stale result for a port we have since left is discarded.
 */
export async function connectToPort(port: string): Promise<void> {
  connectedPort.value = port;
  connectedBoard.value = null;
  // A board seen before (same USB serial number, or same port) is known
  // without probing it again — the esptool probe resets the chip and costs
  // seconds, which is exactly the delay after pressing RST.
  const key = identityKeyFor(port);
  const known = identityCache.get(key);
  if (known) {
    connectedBoard.value = known.name;
    selectedFqbn.value = known.fqbn;
    identifyInProgress.value = false;
    toast.value = { text: `✓ ${displayBoardName(known.fqbn, known.name)} connected on ${port}`, kind: "success" };
    return;
  }
  identifyInProgress.value = true;
  try {
    const id = await arduinoApi.identifyBoard(port);
    identityCache.set(key, { fqbn: id.fqbn, name: id.name });
    if (connectedPort.value !== port) return; // unplugged / changed while probing
    connectedBoard.value = id.name;
    selectedFqbn.value = id.fqbn;
    toast.value = { text: `✓ ${displayBoardName(id.fqbn, id.name)} connected on ${port}`, kind: "success" };
  } catch {
    if (connectedPort.value !== port) return;
    connectedBoard.value = null;
    toast.value = {
      text: `⚠ Couldn't identify the board on ${port} — pick it manually`,
      kind: "warn",
    };
  } finally {
    if (connectedPort.value === port) identifyInProgress.value = false;
  }
}

/** Clear the connection — the board is gone, or the user disconnected. */
export function disconnectBoard(announce = true): void {
  const wasConnected = connectedPort.value !== null;
  connectedPort.value = null;
  connectedBoard.value = null;
  identifyInProgress.value = false;
  if (announce && wasConnected) {
    toast.value = { text: "Board disconnected", kind: "info" };
  }
}

/**
 * Turn a raw board-scan failure into one sentence a user can act on.
 * The Rust side reports a missing `serial-discovery` tool when arduino-cli
 * has never managed to download it — the fresh-install-without-internet
 * case — and everything else is passed through trimmed.
 */
export function describeScanError(raw: unknown): string {
  const text = String(raw instanceof Error ? raw.message : raw).trim();
  if (/serial-discovery/i.test(text)) {
    return /no internet/i.test(text)
      ? "ForgeBoard needs an internet connection once to download Arduino's board tools. Connect to the internet — it retries automatically."
      : "Arduino's board tools are still being downloaded (first launch). This usually takes under a minute.";
  }
  if (/spawn arduino-cli|No such file|not found/i.test(text)) {
    return `The bundled arduino-cli could not be started: ${text}`;
  }
  return `Board scan failed: ${text || "unknown error"}`;
}

/** Record a failed scan: show the reason in the pill, and toast it once
 *  (not every two seconds) until a scan succeeds again. */
export function recordScanFailure(e: unknown): void {
  const message = describeScanError(e);
  if (boardScanError.value === null) {
    toast.value = { text: `⚠ ${message}`, kind: "warn" };
  }
  boardScanError.value = message;
}

/** A scan ran to completion — clear any earlier failure. */
export function recordScanSuccess(): void {
  boardScanError.value = null;
}

/**
 * First-launch setup, run once at startup before the board watcher starts.
 * Asks the backend to make sure arduino-cli's index and serial-discovery
 * tool exist (downloading them if not). While it runs the pill reads
 * "Preparing Arduino tools…"; a failure lands in `boardScanError` with the
 * same wording a failed scan would use, and the watcher keeps retrying.
 * Never throws — startup must continue either way.
 */
export async function prepareArduinoTools(): Promise<void> {
  toolsPreparing.value = true;
  try {
    const downloaded = await arduinoApi.prepare();
    recordScanSuccess();
    if (downloaded) {
      toast.value = { text: "✓ Arduino tools ready", kind: "success" };
    }
  } catch (e) {
    recordScanFailure(e);
  } finally {
    toolsPreparing.value = false;
  }
}

let watching = false;

/**
 * Start the always-on board watch: every POLL_INTERVAL_MS, scan for
 * connected boards, auto-connect the first one found, and clear the
 * connection when it is unplugged. Idempotent — call once at startup.
 */
export function startBoardWatch(): void {
  if (watching) return;
  watching = true;

  let prevPorts: string[] = [];
  let ticking = false;

  const tick = async (): Promise<void> => {
    if (ticking) return; // a previous scan (or identify probe) is still running
    // During an ESP32 upload the port vanishes for 1–2 s as esptool resets
    // the chip. If the watcher runs in that window it tears down the
    // connection and races with the in-flight upload. Skip polling while
    // a build is in flight; the next tick after `buildPhase` returns to
    // `idle`/`success`/`error` will pick up the post-upload reality.
    const phase = buildPhase.value;
    if (phase === "compiling" || phase === "uploading") return;
    ticking = true;
    try {
      const detected = await arduinoApi.detectPorts();
      recordScanSuccess();
      detectedPorts.value = detected;
      const ports = detected.map((d) => d.port);
      const action = decideWatchAction(connectedPort.value, prevPorts, ports);
      prevPorts = ports;
      if (action.kind === "connect") {
        await connectToPort(action.port);
      } else if (action.kind === "disconnect") {
        disconnectBoard();
      }
    } catch (e) {
      // The scan itself failed (not "found nothing"). Remember why so the
      // UI can say so, and keep retrying every tick — a first launch that
      // gains internet, or an install that gets repaired, heals itself.
      recordScanFailure(e);
    } finally {
      ticking = false;
    }
  };

  void tick();
  setInterval(() => void tick(), POLL_INTERVAL_MS);
}
