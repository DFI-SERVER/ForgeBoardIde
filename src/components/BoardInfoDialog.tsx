import { Modal } from "./Modal";
import {
  connectionState,
  connectedPort,
  connectedBoard,
  selectedFqbn,
} from "../state/appState";
import "./BoardInfoDialog.css";

/**
 * Get Board Info — a read-out of the connected board: its port, identified
 * name, and the FQBN the IDE compiles against. Reads the live connection
 * signals, so it stays current if a board is plugged or unplugged while open.
 */
export function BoardInfoDialog({ onClose }: { onClose: () => void }) {
  const state = connectionState.value;

  return (
    <Modal title="Board Information" onClose={onClose}>
      {state === "no-board" ? (
        <div class="bi-empty">
          No board connected. Plug a board into a USB port — the IDE detects
          and identifies it automatically.
        </div>
      ) : (
        <dl class="bi-list">
          <BoardInfoRow label="Port" value={connectedPort.value ?? "—"} />
          <BoardInfoRow
            label="Board"
            value={
              state === "detecting"
                ? "Identifying…"
                : (connectedBoard.value ?? "Unidentified board")
            }
          />
          <BoardInfoRow label="FQBN" value={selectedFqbn.value} />
        </dl>
      )}
    </Modal>
  );
}

/** One label / value pair in the board read-out. */
function BoardInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div class="bi-row">
      <dt class="bi-label">{label}</dt>
      <dd class="bi-value">{value}</dd>
    </div>
  );
}
