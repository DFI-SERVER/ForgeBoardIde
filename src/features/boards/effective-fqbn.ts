/**
 * The effective FQBN for build / burn / size-tracking. When a sketch.yaml
 * profile is active, arduino-cli resolves the target board from the profile;
 * any feature that reaches around the build pipeline (burn-bootloader, which
 * has no --profile flag; the per-FQBN memory-history bucket) must derive the
 * same board so its behaviour aligns with what compile/upload actually do.
 *
 * Falls back to the global `selectedFqbn` when no profile is active, or when
 * `activeProfile` points to a name that no longer exists in `sketchProfiles`
 * (a stale signal value during a reload — treat it as "no profile").
 */
import { activeProfile, sketchProfiles, selectedFqbn } from "./state";
import { baseFqbn, boardOptions, composeFqbn } from "./board-options";

/**
 * Without a profile, the selected board plus the user's board-option
 * choices (USB CDC, partition scheme…) as an `:opt=val,…` suffix — see
 * `board-options.ts`. A board with nothing chosen yields the bare FQBN.
 */
export function effectiveFqbn(): string {
  const active = activeProfile.value;
  if (active) {
    const profile = sketchProfiles.value.find((p) => p.name === active);
    if (profile) return profile.fqbn;
  }
  const base = baseFqbn(selectedFqbn.value);
  return composeFqbn(base, boardOptions.value[base]);
}

/**
 * True when this board family can upload WITHOUT a serial port selected.
 *
 * STM32 is the canonical case: its DFU and SWD upload methods go through
 * STM32CubeProgrammer, which enumerates the target itself (a board in DFU
 * mode has NO COM port at all — USB 0483:DF11 with no serial interface), and
 * the core declares no serial discovery. Gating Upload on a detected port
 * would make DFU upload impossible.
 */
export function isPortlessUploadFqbn(fqbn: string): boolean {
  return fqbn.startsWith("STMicroelectronics:stm32");
}
