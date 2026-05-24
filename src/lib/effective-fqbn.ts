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
import { activeProfile, sketchProfiles, selectedFqbn } from "../state/appState";

export function effectiveFqbn(): string {
  const active = activeProfile.value;
  if (active) {
    const profile = sketchProfiles.value.find((p) => p.name === active);
    if (profile) return profile.fqbn;
  }
  return selectedFqbn.value;
}
