import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  decideWatchAction,
  connectToPort,
  disconnectBoard,
} from "../../src/lib/connection";
import {
  connectedPort,
  connectedBoard,
  identifyInProgress,
  connectionState,
  selectedFqbn,
  toast,
} from "../../src/state/appState";
import { arduinoApi } from "../../src/ipc/arduino";

beforeEach(() => {
  connectedPort.value = null;
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
    expect(toast.value).toContain("ESP32-S3 Dev Module");
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
    expect(toast.value).toContain("COM7");
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
    expect(toast.value).toBe("Board disconnected");
  });
});
