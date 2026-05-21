/**
 * Board connection engine — always-on detection, auto-connect, and the
 * decision logic that drives the honest connection state.
 *
 * The pure decision (decideWatchAction) is unit-tested; startBoardWatch is
 * the thin imperative shell that runs it on a timer.
 */
import { arduinoApi } from "../ipc/arduino";
import {
  connectedPort,
  connectedBoard,
  identifyInProgress,
  detectedPorts,
  selectedFqbn,
  toast,
} from "../state/appState";

/** How often the watcher scans for connected boards. */
const POLL_INTERVAL_MS = 2000;

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
  identifyInProgress.value = true;
  try {
    const id = await arduinoApi.identifyBoard(port);
    if (connectedPort.value !== port) return; // unplugged / changed while probing
    connectedBoard.value = id.name;
    selectedFqbn.value = id.fqbn;
    toast.value = `✓ ${id.name} connected on ${port}`;
  } catch {
    if (connectedPort.value !== port) return;
    connectedBoard.value = null;
    toast.value = `⚠ Couldn't identify the board on ${port} — pick it manually`;
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
  if (announce && wasConnected) toast.value = "Board disconnected";
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
    ticking = true;
    try {
      const detected = await arduinoApi.detectPorts();
      detectedPorts.value = detected;
      const ports = detected.map((d) => d.port);
      const action = decideWatchAction(connectedPort.value, prevPorts, ports);
      prevPorts = ports;
      if (action.kind === "connect") {
        await connectToPort(action.port);
      } else if (action.kind === "disconnect") {
        disconnectBoard();
      }
    } catch {
      /* transient detection error — retry on the next tick */
    } finally {
      ticking = false;
    }
  };

  void tick();
  setInterval(() => void tick(), POLL_INTERVAL_MS);
}
