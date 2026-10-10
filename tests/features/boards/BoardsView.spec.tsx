import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { BoardsView } from "@/features/boards/components/BoardsView";
import { installedCores, detectedPorts, coreInstallRunning, coreInstallProgress } from "@/features/boards/state";
import { arduinoApi, type Core } from "@/ipc/arduino";

const ESP32: Core = {
  id: "esp32:esp32",
  name: "esp32",
  version: "3.3.11",
  maintainer: "Espressif Systems",
  installed: true,
  installed_version: "3.3.11",
  latest_version: "3.3.12",
  versions: ["3.3.12", "3.3.11", "3.0.7"],
  website: "https://github.com/espressif/arduino-esp32",
  update_available: true,
};

beforeEach(() => {
  installedCores.value = [];
  detectedPorts.value = [];
  coreInstallRunning.value = null;
  coreInstallProgress.value = [];
  vi.spyOn(arduinoApi, "listCores").mockResolvedValue([]);
  vi.spyOn(arduinoApi, "listBoards").mockResolvedValue([]);
  vi.spyOn(arduinoApi, "detectPorts").mockResolvedValue([]);
  vi.spyOn(arduinoApi, "searchCores").mockResolvedValue([]);
  vi.spyOn(arduinoApi, "onCoreInstallOutput").mockResolvedValue(() => {});
});

describe("BoardsView (Boards Manager)", () => {
  it("lists the popular cores with install buttons by default", () => {
    render(<BoardsView />);
    expect(screen.getByText(/ESP32 \(incl\. ForgeBoard/)).toBeInTheDocument();
    expect(screen.getAllByText("install core →").length).toBeGreaterThan(3);
  });

  it("shows an installed core with update, version picker and remove", async () => {
    vi.spyOn(arduinoApi, "listCores").mockResolvedValue([ESP32]);
    render(<BoardsView />);
    await waitFor(() => expect(installedCores.value).toHaveLength(1));
    fireEvent.click(screen.getByRole("tab", { name: /Installed/ }));
    expect(screen.getByText("update 3.3.12")).toBeInTheDocument();
    expect(screen.getByTitle("Version")).toBeInTheDocument();
    expect(screen.getByText("more info")).toBeInTheDocument();
    const update = screen.getByRole("button", { name: "update" });
    const installSpy = vi.spyOn(arduinoApi, "installCore").mockResolvedValue(0);
    fireEvent.click(update);
    await waitFor(() => expect(installSpy).toHaveBeenCalled());
    expect(installSpy.mock.calls[0][0]).toBe("esp32:esp32@3.3.12");
    expect(installSpy.mock.calls[0][1]).toEqual(expect.arrayContaining([expect.stringContaining("espressif")]));
  });

  it("asks before removing a core", async () => {
    vi.spyOn(arduinoApi, "listCores").mockResolvedValue([{ ...ESP32, update_available: false, latest_version: "3.3.11" }]);
    const uninstall = vi.spyOn(arduinoApi, "uninstallCore").mockResolvedValue(0);
    render(<BoardsView />);
    await waitFor(() => expect(installedCores.value).toHaveLength(1));
    fireEvent.click(screen.getByRole("tab", { name: /Installed/ }));
    fireEvent.click(screen.getByRole("button", { name: "remove" }));
    expect(uninstall).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "confirm remove" }));
    await waitFor(() => expect(uninstall).toHaveBeenCalledWith("esp32:esp32"));
  });

  it("typing a search switches to All and queries every vendor index", async () => {
    const search = vi.spyOn(arduinoApi, "searchCores").mockResolvedValue([{ ...ESP32, installed: false, installed_version: undefined, update_available: false }]);
    render(<BoardsView />);
    fireEvent.input(screen.getByPlaceholderText(/Search the board index/), { target: { value: "esp" } });
    await waitFor(() => expect(search).toHaveBeenCalledWith("esp", expect.arrayContaining([expect.stringContaining("espressif")])), { timeout: 2000 });
    await waitFor(() => expect(screen.getByText("esp32")).toBeInTheDocument());
  });
});
