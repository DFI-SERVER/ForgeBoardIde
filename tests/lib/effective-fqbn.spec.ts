import { describe, it, expect, beforeEach } from "vitest";
import { effectiveFqbn, isPortlessUploadFqbn } from "../../src/lib/effective-fqbn";
import {
  activeProfile,
  sketchProfiles,
  selectedFqbn,
} from "../../src/state/appState";

beforeEach(() => {
  activeProfile.value = null;
  sketchProfiles.value = [];
  selectedFqbn.value = "esp32:esp32:esp32s3";
});

describe("effectiveFqbn", () => {
  it("returns selectedFqbn when no profile is active", () => {
    expect(effectiveFqbn()).toBe("esp32:esp32:esp32s3");
  });

  it("returns the active profile's FQBN when one is active", () => {
    sketchProfiles.value = [{ name: "release", fqbn: "arduino:avr:uno" }];
    activeProfile.value = "release";
    expect(effectiveFqbn()).toBe("arduino:avr:uno");
  });

  it("falls back to selectedFqbn when activeProfile points to a missing entry", () => {
    // A stale signal value during a reload — e.g. activeProfile pointed at
    // an entry that has since been removed from sketchProfiles. Treat it
    // as "no profile" rather than returning a bogus board.
    activeProfile.value = "ghost";
    expect(effectiveFqbn()).toBe("esp32:esp32:esp32s3");
  });

  it("picks the matching profile when multiple exist", () => {
    sketchProfiles.value = [
      { name: "debug", fqbn: "arduino:avr:uno" },
      { name: "release", fqbn: "esp32:esp32:esp32" },
      { name: "lab", fqbn: "arduino:mbed_nano:nanorp2040connect" },
    ];
    activeProfile.value = "release";
    expect(effectiveFqbn()).toBe("esp32:esp32:esp32");
  });
});

describe("isPortlessUploadFqbn", () => {
  it("allows port-less upload for STM32 (DFU/SWD find the target themselves)", () => {
    expect(isPortlessUploadFqbn("STMicroelectronics:stm32:GenF4")).toBe(true);
    expect(
      isPortlessUploadFqbn(
        "STMicroelectronics:stm32:GenF4:pnum=BLACKPILL_F411CE,upload_method=dfuMethod",
      ),
    ).toBe(true);
  });

  it("keeps the port requirement for serial-flashed families", () => {
    expect(isPortlessUploadFqbn("esp32:esp32:esp32s3")).toBe(false);
    expect(isPortlessUploadFqbn("arduino:avr:uno")).toBe(false);
    expect(isPortlessUploadFqbn("rp2040:rp2040:rpipico")).toBe(false);
  });
});
