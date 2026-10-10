import { describe, it, expect } from "vitest";
import { humanizeDiagnostic, kindLabel } from "@/features/build/humanize-errors";

const d = (message: string) => ({ file: "Upload", line: 0, column: 0, severity: "error" as const, message });

describe("Check → Debug → Solution classification", () => {
  it("separates code, connection and system problems", () => {
    expect(humanizeDiagnostic(d("'digtalWrite' was not declared in this scope"))!.kind).toBe("code");
    expect(humanizeDiagnostic(d("Could not open /dev/cu.usbmodem31201, the port is busy or doesn't exist."))!.kind).toBe("connection");
    expect(humanizeDiagnostic(d("Bad CPU type in executable"), "mac")!.kind).toBe("system");
    expect(humanizeDiagnostic(d("Platform 'esp32:esp32' not found"))!.kind).toBe("system");
  });

  it("gives numbered steps worded for the OS", () => {
    const win = humanizeDiagnostic(d("no upload port provided"), "windows")!;
    expect(win.steps!.some((s) => /USB driver/.test(s))).toBe(true);
    const mac = humanizeDiagnostic(d("no upload port provided"), "mac")!;
    expect(mac.steps!.some((s) => /Allow accessory/.test(s))).toBe(true);
    const linux = humanizeDiagnostic(d("/dev/ttyUSB0: Permission denied"), "linux")!;
    expect(linux.kind).toBe("system");
    expect(linux.steps![0]).toContain("usermod -aG dialout");
  });

  it("explains ESP32 download mode step by step", () => {
    const h = humanizeDiagnostic(d("Failed to connect to ESP32-S3: Wrong boot mode detected"))!;
    expect(h.kind).toBe("connection");
    expect(h.steps!.join(" ")).toMatch(/Hold the BOOT button/);
    expect(h.steps!.length).toBeGreaterThanOrEqual(4);
  });

  it("offers the Setup check or Boards view as the one-click action where it applies", () => {
    expect(humanizeDiagnostic(d("Exec format error"), "mac")!.action).toEqual({ kind: "open-setup-check", label: "Open Setup check" });
    expect(humanizeDiagnostic(d("Platform 'esp8266:esp8266' not installed"))!.action?.kind).toBe("open-boards");
  });

  it("labels kinds for the badge", () => {
    expect(kindLabel("code")).toBe("In your code");
    expect(kindLabel("connection")).toBe("Board connection");
    expect(kindLabel("system")).toBe("Computer setup");
  });
});
