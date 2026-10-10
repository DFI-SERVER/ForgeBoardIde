import { useState } from "preact/hooks";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Modal } from "@/shared/components/Modal";
import {
  connectionState,
  connectedPort,
  connectedBoard,
  selectedFqbn,
} from "@/features/boards/state";
import { forgeBoardForFqbn } from "@/features/boards/forge-boards";
import { toast } from "@/app/state";
import "./BoardInfoDialog.css";

/**
 * Get Board Info — the connected board's port, name and FQBN, and for a
 * Forge board its datasheet link and pin diagram (the "board context" the
 * Flow State requirement asks for). Reads the live connection signals, so
 * it stays current if a board is plugged or unplugged while open.
 */
export function BoardInfoDialog({ onClose }: { onClose: () => void }) {
  const state = connectionState.value;
  const forge = forgeBoardForFqbn(selectedFqbn.value);
  const [pinoutMissing, setPinoutMissing] = useState(false);

  return (
    <Modal title="Board Information" onClose={onClose}>
      {state === "no-board" ? (
        <div class="bi-empty">
          No board connected. Plug a board into a USB port — the IDE detects
          and identifies it automatically.
        </div>
      ) : (
        <>
          <dl class="bi-list">
            <BoardInfoRow label="Port" value={connectedPort.value ?? "—"} />
            <BoardInfoRow
              label="Board"
              value={
                state === "detecting"
                  ? "Identifying…"
                  : forge
                    ? `${forge.name} (Forge Board)`
                    : (connectedBoard.value ?? "Unidentified board")
              }
            />
            {forge && <BoardInfoRow label="Chip" value={forge.chip} />}
            <BoardInfoRow label="FQBN" value={selectedFqbn.value} />
          </dl>
          {forge && (
            <div class="bi-forge">
              <button
                class="bi-link"
                onClick={() =>
                  openUrl(forge.datasheet).catch(() => {
                    toast.value = { kind: "warn", text: `Couldn't open the link. The address is ${forge.datasheet}` };
                  })
                }
              >
                Open the {forge.name} datasheet
              </button>
              <div class="bi-pinout-title">Pin diagram</div>
              {pinoutMissing ? (
                <div class="bi-pinout-missing">Pin diagram not available yet for {forge.name}.</div>
              ) : (
                <img
                  class="bi-pinout"
                  src={forge.pinout}
                  alt={`${forge.name} pin diagram`}
                  onError={() => setPinoutMissing(true)}
                />
              )}
            </div>
          )}
        </>
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
