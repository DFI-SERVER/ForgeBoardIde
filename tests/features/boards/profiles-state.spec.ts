import { describe, it, expect, beforeEach } from "vitest";
import { activeProfile, sketchProfiles, type SketchProfile } from "@/features/boards/state";

const SAMPLE: SketchProfile[] = [
  { name: "nanorp", fqbn: "arduino:mbed_nano:nanorp2040connect" },
  { name: "release", fqbn: "esp32:esp32:esp32", notes: "Field build" },
];

beforeEach(() => {
  sketchProfiles.value = [];
  activeProfile.value = null;
});

describe("sketchProfiles signal", () => {
  it("starts empty", () => {
    expect(sketchProfiles.value).toEqual([]);
  });

  it("accepts a populated list", () => {
    sketchProfiles.value = SAMPLE;
    expect(sketchProfiles.value).toHaveLength(2);
    expect(sketchProfiles.value[0].name).toBe("nanorp");
    expect(sketchProfiles.value[1].fqbn).toBe("esp32:esp32:esp32");
    expect(sketchProfiles.value[1].notes).toBe("Field build");
  });

  it("can be cleared back to empty", () => {
    sketchProfiles.value = SAMPLE;
    sketchProfiles.value = [];
    expect(sketchProfiles.value).toEqual([]);
  });
});

describe("activeProfile signal", () => {
  it("starts null", () => {
    expect(activeProfile.value).toBeNull();
  });

  it("accepts a profile name", () => {
    activeProfile.value = "nanorp";
    expect(activeProfile.value).toBe("nanorp");
  });

  it("accepts null to mean 'use board picker instead'", () => {
    activeProfile.value = "nanorp";
    activeProfile.value = null;
    expect(activeProfile.value).toBeNull();
  });

  it("is independent of sketchProfiles — switching the list does not auto-pick", () => {
    // The state contract: ONLY sketch.ts's refreshProfiles() touches
    // activeProfile when reloading. Tests guard that swapping the list
    // alone does not silently change which profile is active.
    sketchProfiles.value = SAMPLE;
    expect(activeProfile.value).toBeNull();
  });
});
