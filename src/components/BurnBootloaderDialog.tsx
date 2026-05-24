import { useEffect, useState } from "preact/hooks";
import { Modal } from "./Modal";
import { arduinoApi } from "../ipc/arduino";
import { errText } from "../lib/actions";
import { settings } from "../lib/settings";
import { effectiveFqbn } from "../lib/effective-fqbn";
import {
  burnBootloaderDialogOpen,
  connectedPort,
  buildOutput,
  buildPhase,
  bottomPanelOpen,
  bottomPanelTab,
  toast,
} from "../state/appState";
import "./BurnBootloaderDialog.css";

/**
 * The static programmer list shown in the dropdown — the conventional set that
 * `arduino-cli burn-bootloader -P …` accepts across boards. The IDE does not
 * currently introspect a board's `programmers.txt`; this fixed list covers the
 * common Uno / Mega / Leonardo / SAMD use cases.
 */
export const PROGRAMMERS: { id: string; label: string }[] = [
  { id: "avrisp", label: "AVR ISP" },
  { id: "avrispmkii", label: "AVR ISP mkII" },
  { id: "usbtinyisp", label: "USBtinyISP" },
  { id: "arduinoisp", label: "Arduino as ISP" },
  { id: "arduinoasisp", label: "Arduino as ISP (ATmega32U4)" },
  { id: "usbasp", label: "USBasp" },
  { id: "parallel", label: "Parallel Programmer" },
  { id: "stk500", label: "Atmel STK500" },
  { id: "atmel_ice", label: "Atmel-ICE" },
];

/** The IDE's default programmer choice — the most common option for Uno-style
 *  boards. The user can pick any other entry from the dropdown. */
export const DEFAULT_PROGRAMMER = "arduinoisp";

/* ----------------------------------------------------------------- event --- */

let listenerInstalled = false;
async function ensureBurnListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  await arduinoApi.onBurnBootloaderOutput((line) => {
    buildOutput.value = [...buildOutput.value, line];
  });
}

/* ----------------------------------------------------------------- shell --- */

/**
 * The Burn Bootloader confirm dialog — opened from the Tools menu via
 * `openBurnBootloaderDialog()`. Renders nothing when the dialog is closed so
 * it can live globally in App.tsx (mirroring `NewSketchDialog`'s shape).
 */
export function BurnBootloaderDialog() {
  if (!burnBootloaderDialogOpen.value) return null;
  return <BurnBootloaderDialogBody />;
}

function BurnBootloaderDialogBody() {
  const [programmer, setProgrammer] = useState(DEFAULT_PROGRAMMER);
  const [busy, setBusy] = useState(false);
  // Honour the active sketch.yaml profile — burn-bootloader doesn't take a
  // --profile flag, so we must resolve the target FQBN ourselves to match
  // what compile/upload would build against.
  const fqbn = effectiveFqbn();
  const port = connectedPort.value;

  const close = () => {
    if (busy) return; // don't close mid-burn
    burnBootloaderDialogOpen.value = false;
  };

  // While the dialog is open, block Escape-close if the burn is running.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && busy) e.stopPropagation();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [busy]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    await ensureBurnListener();
    // Surface progress in the same Output tab the compile/upload flow uses.
    buildOutput.value = [];
    bottomPanelOpen.value = true;
    bottomPanelTab.value = "output";
    buildPhase.value = "uploading";
    try {
      const result = await arduinoApi.burnBootloader(
        fqbn,
        port,
        programmer,
        settings.value.verboseBuild,
      );
      buildPhase.value = result.success ? "success" : "error";
      if (!result.success && result.stderr.trim()) {
        buildOutput.value = [
          ...buildOutput.value,
          "",
          result.stderr.trimEnd(),
        ];
      }
      toast.value = result.success
        ? { text: "Bootloader burned.", kind: "success" }
        : { text: "Burning the bootloader failed.", kind: "warn" };
    } catch (e) {
      buildPhase.value = "error";
      buildOutput.value = [
        ...buildOutput.value,
        `Error: ${errText(e)}`,
      ];
      toast.value = {
        text: `Burning the bootloader failed: ${errText(e)}`,
        kind: "warn",
      };
    } finally {
      setBusy(false);
      burnBootloaderDialogOpen.value = false;
    }
  }

  return (
    <Modal title="Burn Bootloader" onClose={close}>
      <div class="bb-intro">
        Burning a bootloader erases the chip and writes a fresh bootloader.
        It is rarely needed — most boards arrive with a working bootloader.
      </div>

      <dl class="bb-summary">
        <BurnBootloaderRow label="Board" value={fqbn} />
        <BurnBootloaderRow label="Port" value={port ?? "Not selected"} />
      </dl>

      <label class="dlg-label dlg-label-spaced" for="bb-programmer">
        Programmer
      </label>
      <select
        id="bb-programmer"
        class="bb-select"
        value={programmer}
        disabled={busy}
        onChange={(e) =>
          setProgrammer((e.target as HTMLSelectElement).value)
        }
      >
        {PROGRAMMERS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>

      <div class="dlg-actions">
        <button class="dlg-btn" onClick={close} disabled={busy}>
          Cancel
        </button>
        <button
          class="dlg-btn dlg-btn-primary"
          disabled={busy}
          onClick={confirm}
        >
          {busy ? "Burning…" : "Burn Bootloader"}
        </button>
      </div>
    </Modal>
  );
}

/** One label / value pair in the board summary. */
function BurnBootloaderRow({ label, value }: { label: string; value: string }) {
  return (
    <div class="bb-row">
      <dt class="bb-label">{label}</dt>
      <dd class="bb-value">{value}</dd>
    </div>
  );
}
