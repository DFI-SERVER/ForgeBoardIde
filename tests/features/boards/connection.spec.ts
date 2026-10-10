import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  decideWatchAction,
  connectToPort,
  disconnectBoard,
  describeScanError,
  recordScanFailure,
  recordScanSuccess,
  prepareArduinoTools,
  identityCache,
} from "@/features/boards/connection";
import {
  connectedPort,
  connectedBoard,
  identifyInProgress,
  connectionState,
  selectedFqbn,
  boardScanError,
  toolsPreparing,
} from "@/features/boards/state";
import { toast } from "@/app/state";
import { arduinoApi } from "@/ipc/arduino";

beforeEach(() => {
  connectedPort.value = null;
  identityCache.clear();
  connectedBoard.value = null;
  identifyInProgress.value = false;
  toast.value = null;
  selectedFqbn.value = "esp32:esp32:esp32s3";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("decideWatchAction", () => {
  it("connects to the first board when nothing is connected", () => {
    expect(decideWatchAction(null, [], ["COM4"])).toEqual({
      kind: "connect",
      port: "COM4",
    });
  });

  it("does nothing when the connected board is still present", () => {
    expect(decideWatchAction("COM4", ["COM4"], ["COM4"])).toEqual({
      kind: "none",
    });
  });

  it("disconnects when the connected board is unplugged", () => {
    expect(decideWatchAction("COM4", ["COM4"], [])).toEqual({
      kind: "disconnect",
    });
  });

  it("does not hijack the connection when a second board appears", () => {
    expect(decideWatchAction("COM4", ["COM4"], ["COM4", "COM5"])).toEqual({
      kind: "none",
    });
  });

  it("does nothing when no boards are present and none connected", () => {
    expect(decideWatchAction(null, [], [])).toEqual({ kind: "none" });
  });

  it("connects to a board that was already present but never connected", () => {
    expect(decideWatchAction(null, ["COM4", "COM5"], ["COM5"])).toEqual({
      kind: "connect",
      port: "COM5",
    });
  });

  it("disconnects when the connected board is swapped for another in one tick", () => {
    expect(decideWatchAction("COM4", ["COM4"], ["COM5"])).toEqual({
      kind: "disconnect",
    });
  });
});

describe("connectToPort", () => {
  it("identifies the board and moves to the connected state", async () => {
    vi.spyOn(arduinoApi, "identifyBoard").mockResolvedValue({
      fqbn: "esp32:esp32:esp32s3",
      name: "ESP32-S3 Dev Module",
      source: "chip-probe",
    });

    await connectToPort("COM4");

    expect(connectedPort.value).toBe("COM4");
    expect(connectedBoard.value).toBe("ESP32-S3 Dev Module");
    expect(selectedFqbn.value).toBe("esp32:esp32:esp32s3");
    expect(identifyInProgress.value).toBe(false);
    expect(connectionState.value).toBe("connected");
    expect(toast.value?.text).toContain("Spark");
    expect(toast.value?.kind).toBe("success");
  });

  it("moves to the unidentified state when identification fails", async () => {
    vi.spyOn(arduinoApi, "identifyBoard").mockRejectedValue(
      new Error("couldn't identify"),
    );

    await connectToPort("COM7");

    expect(connectedPort.value).toBe("COM7");
    expect(connectedBoard.value).toBeNull();
    expect(identifyInProgress.value).toBe(false);
    expect(connectionState.value).toBe("unidentified");
    expect(toast.value?.text).toContain("COM7");
    expect(toast.value?.kind).toBe("warn");
  });
});

describe("disconnectBoard", () => {
  it("clears the connection back to the no-board state", () => {
    connectedPort.value = "COM4";
    connectedBoard.value = "ESP32-S3 Dev Module";

    disconnectBoard();

    expect(connectedPort.value).toBeNull();
    expect(connectedBoard.value).toBeNull();
    expect(connectionState.value).toBe("no-board");
    expect(toast.value?.text).toBe("Board disconnected");
    expect(toast.value?.kind).toBe("info");
  });
});

describe("board scan failures", () => {
  it("explains a fresh install with no internet in user words", () => {
    const msg = describeScanError(
      "serial-discovery tool missing: arduino-cli could not download it (no internet connection)",
    );
    expect(msg).toMatch(/internet connection/i);
    expect(msg).toMatch(/retries automatically/i);
  });

  it("explains a first launch that is still downloading tools", () => {
    const msg = describeScanError(
      "serial-discovery tool missing: arduino-cli has not downloaded it yet",
    );
    expect(msg).toMatch(/first launch/i);
  });

  it("passes other failures through with a prefix", () => {
    expect(describeScanError(new Error("boom"))).toBe("Board scan failed: boom");
  });

  it("records the reason and toasts it once, not on every tick", () => {
    boardScanError.value = null;
    recordScanFailure("serial-discovery tool missing: arduino-cli could not download it (no internet connection)");
    expect(boardScanError.value).toMatch(/internet/i);
    expect(toast.value?.kind).toBe("warn");

    toast.value = null;
    recordScanFailure("serial-discovery tool missing: arduino-cli could not download it (no internet connection)");
    expect(toast.value).toBeNull();
    expect(boardScanError.value).toMatch(/internet/i);
  });

  it("clears the reason once a scan succeeds", () => {
    boardScanError.value = "Board scan failed: boom";
    recordScanSuccess();
    expect(boardScanError.value).toBeNull();
  });
});

describe("prepareArduinoTools", () => {
  it("clears the preparing flag and toasts when tools were downloaded", async () => {
    vi.spyOn(arduinoApi, "prepare").mockResolvedValue(true);
    boardScanError.value = "stale";
    await prepareArduinoTools();
    expect(toolsPreparing.value).toBe(false);
    expect(boardScanError.value).toBeNull();
    expect(toast.value?.text).toMatch(/Arduino tools ready/);
  });

  it("stays quiet when everything was already present", async () => {
    vi.spyOn(arduinoApi, "prepare").mockResolvedValue(false);
    toast.value = null;
    await prepareArduinoTools();
    expect(toolsPreparing.value).toBe(false);
    expect(toast.value).toBeNull();
  });

  it("records a failure in user words and never throws", async () => {
    vi.spyOn(arduinoApi, "prepare").mockRejectedValue(
      "serial-discovery tool missing: arduino-cli could not download it (no internet connection)",
    );
    boardScanError.value = null;
    await expect(prepareArduinoTools()).resolves.toBeUndefined();
    expect(toolsPreparing.value).toBe(false);
    expect(boardScanError.value).toMatch(/internet connection/i);
    expect(toast.value?.kind).toBe("warn");
  });
});

describe("identity cache (fast reconnect after RST)", () => {
  it("skips the probe for a board seen before and keys by USB serial number", async () => {
    const { identityCache, identityKeyFor } = await import("@/features/boards/connection");
    const { detectedPorts } = await import("@/features/boards/state");
    identityCache.clear();
    detectedPorts.value = [{ port: "COM4", fqbn: undefined, name: undefined, serial_number: "AB12" } as never];
    expect(identityKeyFor("COM4")).toBe("usb:AB12");
    expect(identityKeyFor("COM9")).toBe("port:COM9");

    const identify = vi.spyOn(arduinoApi, "identifyBoard").mockResolvedValue({ fqbn: "esp32:esp32:esp32s3", name: "ESP32-S3 Dev Module", source: "chip-probe" });
    await connectToPort("COM4");
    expect(identify).toHaveBeenCalledTimes(1);
    expect(toast.value?.text).toContain("Spark");

    // Same board comes back on another port name after RST: no second probe.
    detectedPorts.value = [{ port: "COM5", fqbn: undefined, name: undefined, serial_number: "AB12" } as never];
    connectedPort.value = null;
    connectedBoard.value = null;
    await connectToPort("COM5");
    expect(identify).toHaveBeenCalledTimes(1);
    expect(connectedBoard.value).toBe("ESP32-S3 Dev Module");
    expect(selectedFqbn.value).toBe("esp32:esp32:esp32s3");
    identityCache.clear();
  });
});
