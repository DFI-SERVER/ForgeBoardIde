import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, it, expect, beforeEach } from "vitest";
import { ProfilePill } from "@/features/boards/components/ProfilePill";
import { activeProfile, sketchProfiles, type SketchProfile } from "@/features/boards/state";

const SAMPLE: SketchProfile[] = [
  {
    name: "nanorp",
    fqbn: "arduino:mbed_nano:nanorp2040connect",
    notes: "ESP32-S3 dev profile",
  },
  { name: "release", fqbn: "esp32:esp32:esp32" },
];

beforeEach(() => {
  sketchProfiles.value = [];
  activeProfile.value = null;
});

describe("ProfilePill", () => {
  it("renders nothing when there are no profiles", () => {
    const { container } = render(<ProfilePill />);
    expect(container.querySelector(".pp-wrapper")).toBeNull();
  });

  it("renders the active profile name in the trigger", () => {
    sketchProfiles.value = SAMPLE;
    activeProfile.value = "nanorp";
    render(<ProfilePill />);
    expect(screen.getByText("Profile:")).toBeInTheDocument();
    expect(screen.getByText("nanorp")).toBeInTheDocument();
  });

  it("falls back to '(none)' when no profile is active", () => {
    sketchProfiles.value = SAMPLE;
    activeProfile.value = null;
    render(<ProfilePill />);
    expect(screen.getByText("(none)")).toBeInTheDocument();
  });

  it("opens the dropdown on click and lists every profile + the opt-out", () => {
    sketchProfiles.value = SAMPLE;
    render(<ProfilePill />);
    fireEvent.click(screen.getByText("Profile:").closest("button")!);
    // Each profile appears with its FQBN.
    expect(screen.getByText("nanorp")).toBeInTheDocument();
    expect(screen.getByText("release")).toBeInTheDocument();
    expect(
      screen.getByText("arduino:mbed_nano:nanorp2040connect"),
    ).toBeInTheDocument();
    expect(screen.getByText("esp32:esp32:esp32")).toBeInTheDocument();
    // And the escape hatch is there.
    expect(screen.getByText("Use board picker instead")).toBeInTheDocument();
  });

  it("shows the notes from sketch.yaml when present", () => {
    sketchProfiles.value = SAMPLE;
    render(<ProfilePill />);
    fireEvent.click(screen.getByText("Profile:").closest("button")!);
    expect(screen.getByText("ESP32-S3 dev profile")).toBeInTheDocument();
  });

  it("selecting a profile sets activeProfile and closes the dropdown", () => {
    sketchProfiles.value = SAMPLE;
    activeProfile.value = null;
    render(<ProfilePill />);
    fireEvent.click(screen.getByText("Profile:").closest("button")!);
    fireEvent.click(screen.getByText("release").closest("button")!);
    expect(activeProfile.value).toBe("release");
    // Dropdown is gone now — the header text only renders while open.
    expect(screen.queryByText("sketch.yaml profiles")).toBeNull();
  });

  it("clicking 'Use board picker instead' clears activeProfile", () => {
    sketchProfiles.value = SAMPLE;
    activeProfile.value = "nanorp";
    render(<ProfilePill />);
    fireEvent.click(screen.getByText("Profile:").closest("button")!);
    fireEvent.click(
      screen.getByText("Use board picker instead").closest("button")!,
    );
    expect(activeProfile.value).toBeNull();
  });

  it("marks the active item with a check icon", () => {
    sketchProfiles.value = SAMPLE;
    activeProfile.value = "release";
    const { container } = render(<ProfilePill />);
    fireEvent.click(screen.getByText("Profile:").closest("button")!);
    // The trigger button shows the active name too, so disambiguate by
    // selecting only rows inside the dropdown's .pp-item-name spans.
    const rowFor = (name: string) =>
      Array.from(container.querySelectorAll(".pp-item-name"))
        .find((el) => el.textContent === name)
        ?.closest("button");
    const releaseRow = rowFor("release")!;
    expect(releaseRow.className).toContain("active");
    expect(releaseRow.querySelector("svg")).not.toBeNull();
    const nanorpRow = rowFor("nanorp")!;
    expect(nanorpRow.className).not.toContain("active");
  });

  it("toggles closed on a second click", () => {
    sketchProfiles.value = SAMPLE;
    render(<ProfilePill />);
    const trigger = screen.getByText("Profile:").closest("button")!;
    fireEvent.click(trigger);
    expect(screen.getByText("sketch.yaml profiles")).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByText("sketch.yaml profiles")).toBeNull();
  });
});
