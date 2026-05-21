import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LibrariesView } from "../../src/components/LibrariesView";
import { arduinoApi, type Library } from "../../src/ipc/arduino";
import {
  installedLibraries,
  librarySearchQuery,
  librarySearchResults,
  librarySearchPending,
  libraryInstalling,
  libraryInstallProgress,
} from "../../src/state/appState";

const NEOPIXEL: Library = {
  name: "Adafruit NeoPixel",
  author: "Adafruit",
  sentence: "Arduino library for controlling single-wire-based LED pixels.",
  installed_version: "1.15.5",
  update_available: false,
};

const ARDUINOJSON_OLD: Library = {
  name: "ArduinoJson",
  author: "Benoit Blanchon",
  sentence: "A simple and efficient JSON library for embedded C++.",
  installed_version: "6.20.0",
  latest_version: "7.4.3",
  update_available: true,
};

const FASTLED_REGISTRY: Library = {
  name: "FastLED",
  author: "Daniel Garcia",
  sentence: "Multi-platform library for controlling addressable LEDs.",
  latest_version: "3.10.3",
  update_available: false,
};

beforeEach(() => {
  installedLibraries.value = [];
  librarySearchQuery.value = "";
  librarySearchResults.value = [];
  librarySearchPending.value = false;
  libraryInstalling.value = null;
  libraryInstallProgress.value = [];
  vi.spyOn(arduinoApi, "libListInstalled").mockResolvedValue([]);
  vi.spyOn(arduinoApi, "libSearch").mockResolvedValue([]);
  vi.spyOn(arduinoApi, "onLibInstallOutput").mockResolvedValue(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("LibrariesView", () => {
  it("renders the header and an empty installed state", async () => {
    render(<LibrariesView />);
    expect(screen.getByText("Libraries")).toBeInTheDocument();
    await waitFor(() => expect(arduinoApi.libListInstalled).toHaveBeenCalled());
    expect(screen.getByText(/No libraries installed/)).toBeInTheDocument();
  });

  it("lists installed libraries returned by the backend", async () => {
    vi.spyOn(arduinoApi, "libListInstalled").mockResolvedValue([NEOPIXEL]);
    render(<LibrariesView />);
    expect(await screen.findByText("Adafruit NeoPixel")).toBeInTheDocument();
    expect(screen.getByText("1.15.5")).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("shows an update affordance only when a newer version exists", async () => {
    vi.spyOn(arduinoApi, "libListInstalled").mockResolvedValue([
      NEOPIXEL,
      ARDUINOJSON_OLD,
    ]);
    render(<LibrariesView />);
    await screen.findByText("ArduinoJson");
    // ArduinoJson is updatable — Update button + badge appear.
    expect(screen.getByText("Update")).toBeInTheDocument();
    expect(screen.getByText(/update → 7\.4\.3/)).toBeInTheDocument();
    // NeoPixel is current — exactly one Update button across the view.
    expect(screen.getAllByText("Update")).toHaveLength(1);
    // Header reflects the updatable count.
    expect(screen.getByText(/1 updatable/)).toBeInTheDocument();
  });

  it("debounces the registry search and renders results with an Install button", async () => {
    vi.useFakeTimers();
    vi.spyOn(arduinoApi, "libSearch").mockResolvedValue([FASTLED_REGISTRY]);
    render(<LibrariesView />);

    const input = screen.getByPlaceholderText(/Search the Arduino library registry/);
    fireEvent.input(input, { target: { value: "FastLED" } });

    // No search before the debounce window elapses.
    expect(arduinoApi.libSearch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(arduinoApi.libSearch).toHaveBeenCalledWith("FastLED");

    vi.useRealTimers();
    expect(await screen.findByText("FastLED")).toBeInTheDocument();
    expect(screen.getByText("Install")).toBeInTheDocument();
  });

  it("installs a library and refreshes the installed list", async () => {
    vi.spyOn(arduinoApi, "libSearch").mockResolvedValue([FASTLED_REGISTRY]);
    const installSpy = vi
      .spyOn(arduinoApi, "libInstall")
      .mockResolvedValue(0);
    // After install, the backend reports FastLED as installed.
    const listSpy = vi.spyOn(arduinoApi, "libListInstalled");
    listSpy.mockResolvedValueOnce([]); // mount
    listSpy.mockResolvedValueOnce([
      { ...FASTLED_REGISTRY, installed_version: "3.10.3" },
    ]); // post-install refresh

    render(<LibrariesView />);
    librarySearchQuery.value = "FastLED";
    librarySearchResults.value = [FASTLED_REGISTRY];

    const installBtn = await screen.findByText("Install");
    fireEvent.click(installBtn.closest("button")!);

    await waitFor(() => expect(installSpy).toHaveBeenCalledWith("FastLED"));
    await waitFor(() =>
      expect(installedLibraries.value.some((l) => l.name === "FastLED")).toBe(
        true,
      ),
    );
  });

  it("updates an outdated library by installing its latest version", async () => {
    vi.spyOn(arduinoApi, "libListInstalled").mockResolvedValue([
      ARDUINOJSON_OLD,
    ]);
    const installSpy = vi.spyOn(arduinoApi, "libInstall").mockResolvedValue(0);

    render(<LibrariesView />);
    const updateBtn = await screen.findByText("Update");
    fireEvent.click(updateBtn.closest("button")!);

    // Update pins the explicit latest version so arduino-cli upgrades in place.
    await waitFor(() =>
      expect(installSpy).toHaveBeenCalledWith("ArduinoJson@7.4.3"),
    );
  });

  it("removes an installed library", async () => {
    vi.spyOn(arduinoApi, "libListInstalled").mockResolvedValue([NEOPIXEL]);
    const uninstallSpy = vi
      .spyOn(arduinoApi, "libUninstall")
      .mockResolvedValue(0);

    render(<LibrariesView />);
    const removeBtn = await screen.findByText("Remove");
    fireEvent.click(removeBtn.closest("button")!);

    await waitFor(() =>
      expect(uninstallSpy).toHaveBeenCalledWith("Adafruit NeoPixel"),
    );
  });

  it("exposes an Install from ZIP button", async () => {
    render(<LibrariesView />);
    expect(screen.getByText("Install from ZIP…")).toBeInTheDocument();
  });
});
