import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LibrariesView } from "@/features/libraries/components/LibrariesView";
import { arduinoApi, type Library } from "@/ipc/arduino";
import {
  installedLibraries,
  librarySearchQuery,
  libraryRegistry,
  libraryRegistryStatus,
  librarySearchResults,
  librarySearchPending,
  libraryFilterMode,
  libraryInstalling,
  libraryInstallProgress,
} from "@/features/libraries/state";

/**
 * LibrariesView — the full-registry-browse Library Manager.
 *
 * The view fetches the entire registry once (`libListAll`), caches it, and
 * filters it in memory; `libSearch` is only the offline fallback. These tests
 * exercise that contract. The pure filter/windowing maths is unit-tested
 * separately in src/lib/library-filter.test.ts.
 */

/* --- fixtures --- */

const NEOPIXEL: Library = {
  name: "Adafruit NeoPixel",
  author: "Adafruit",
  sentence: "Arduino library for controlling single-wire-based LED pixels.",
  latest_version: "1.15.5",
  update_available: false,
};

const FASTLED: Library = {
  name: "FastLED",
  author: "Daniel Garcia",
  sentence: "Multi-platform library for controlling addressable LEDs.",
  latest_version: "3.10.3",
  update_available: false,
};

const ARDUINOJSON: Library = {
  name: "ArduinoJson",
  author: "Benoit Blanchon",
  sentence: "A simple and efficient JSON library for embedded C++.",
  latest_version: "7.4.3",
  update_available: false,
};

const SERVO: Library = {
  name: "Servo",
  author: "Arduino",
  sentence: "Allows Arduino boards to control servo motors.",
  latest_version: "1.2.1",
  update_available: false,
};

/** The full registry the backend's `libListAll` returns. Kept small so the
 *  virtualized list mounts every row under jsdom's zero-height viewport. */
const REGISTRY: Library[] = [NEOPIXEL, FASTLED, ARDUINOJSON, SERVO];

/** An installed FastLED, current. */
const FASTLED_INSTALLED: Library = {
  ...FASTLED,
  installed_version: "3.10.3",
  update_available: false,
};

/** An installed NeoPixel with a newer version waiting. */
const NEOPIXEL_OUTDATED: Library = {
  ...NEOPIXEL,
  installed_version: "1.14.0",
  latest_version: "1.15.5",
  update_available: true,
};

beforeEach(() => {
  // Reset every module-level signal the view reads or writes.
  installedLibraries.value = [];
  librarySearchQuery.value = "";
  libraryRegistry.value = null;
  libraryRegistryStatus.value = "idle";
  librarySearchResults.value = [];
  librarySearchPending.value = false;
  libraryFilterMode.value = "all";
  libraryInstalling.value = null;
  libraryInstallProgress.value = [];
  // Default backend: the registry loads fine, nothing installed.
  vi.spyOn(arduinoApi, "libListAll").mockResolvedValue(REGISTRY);
  vi.spyOn(arduinoApi, "libListInstalled").mockResolvedValue([]);
  vi.spyOn(arduinoApi, "onLibInstallOutput").mockResolvedValue(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LibrariesView", () => {
  it("renders the header", async () => {
    render(<LibrariesView />);
    expect(screen.getByText("Libraries")).toBeInTheDocument();
    await waitFor(() => expect(arduinoApi.libListAll).toHaveBeenCalled());
  });

  it("loads the full registry once and lists every library under All", async () => {
    render(<LibrariesView />);
    expect(await screen.findByText("Adafruit NeoPixel")).toBeInTheDocument();
    expect(screen.getByText("FastLED")).toBeInTheDocument();
    expect(screen.getByText("ArduinoJson")).toBeInTheDocument();
    expect(screen.getByText("Servo")).toBeInTheDocument();
    // The registry is fetched exactly once — not per keystroke.
    expect(arduinoApi.libListAll).toHaveBeenCalledTimes(1);
  });

  it("filters the cached registry in memory as the user types", async () => {
    render(<LibrariesView />);
    await screen.findByText("FastLED");

    const input = screen.getByPlaceholderText(
      /Filter the Arduino library registry/,
    );
    fireEvent.input(input, { target: { value: "servo" } });

    // Only Servo survives the filter; the others drop out of the list.
    await waitFor(() => {
      expect(screen.getByText("Servo")).toBeInTheDocument();
      expect(screen.queryByText("FastLED")).not.toBeInTheDocument();
      expect(screen.queryByText("Adafruit NeoPixel")).not.toBeInTheDocument();
    });
    // Filtering is in memory — no extra backend round-trips.
    expect(arduinoApi.libListAll).toHaveBeenCalledTimes(1);
  });

  it("shows the installed set under the Installed tab", async () => {
    vi.spyOn(arduinoApi, "libListInstalled").mockResolvedValue([
      FASTLED_INSTALLED,
    ]);
    render(<LibrariesView />);
    await screen.findByText("Adafruit NeoPixel"); // the All list has rendered

    fireEvent.click(screen.getByRole("tab", { name: /Installed/ }));

    expect(await screen.findByText("FastLED")).toBeInTheDocument();
    expect(screen.getByText("3.10.3")).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
    // A registry-only library is not part of the installed view.
    expect(screen.queryByText("Servo")).not.toBeInTheDocument();
  });

  it("installs a library from the registry and refreshes the installed list", async () => {
    const installSpy = vi.spyOn(arduinoApi, "libInstall").mockResolvedValue(0);
    const listSpy = vi.spyOn(arduinoApi, "libListInstalled");
    listSpy.mockResolvedValueOnce([]); // initial mount
    listSpy.mockResolvedValueOnce([FASTLED_INSTALLED]); // post-install refresh

    render(<LibrariesView />);
    await screen.findByText("FastLED");

    // Narrow to FastLED so exactly one Install button is on screen.
    fireEvent.input(
      screen.getByPlaceholderText(/Filter the Arduino library registry/),
      { target: { value: "fastled" } },
    );
    await waitFor(() =>
      expect(screen.queryByText("Servo")).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText("Install").closest("button")!);

    await waitFor(() => expect(installSpy).toHaveBeenCalledWith("FastLED"));
    await waitFor(() =>
      expect(
        installedLibraries.value.some((l) => l.name === "FastLED"),
      ).toBe(true),
    );
  });

  it("updates an outdated installed library to its latest version", async () => {
    vi.spyOn(arduinoApi, "libListInstalled").mockResolvedValue([
      NEOPIXEL_OUTDATED,
    ]);
    const installSpy = vi.spyOn(arduinoApi, "libInstall").mockResolvedValue(0);

    render(<LibrariesView />);
    await screen.findByText("Adafruit NeoPixel");
    fireEvent.click(screen.getByRole("tab", { name: /Installed/ }));

    const updateBtn = await screen.findByText("Update");
    fireEvent.click(updateBtn.closest("button")!);

    // Update pins the explicit latest version so arduino-cli upgrades in place.
    await waitFor(() =>
      expect(installSpy).toHaveBeenCalledWith("Adafruit NeoPixel@1.15.5"),
    );
  });

  it("removes an installed library", async () => {
    vi.spyOn(arduinoApi, "libListInstalled").mockResolvedValue([
      FASTLED_INSTALLED,
    ]);
    const uninstallSpy = vi
      .spyOn(arduinoApi, "libUninstall")
      .mockResolvedValue(0);

    render(<LibrariesView />);
    await screen.findByText("Adafruit NeoPixel");
    fireEvent.click(screen.getByRole("tab", { name: /Installed/ }));

    const removeBtn = await screen.findByText("Remove");
    fireEvent.click(removeBtn.closest("button")!);

    await waitFor(() => expect(uninstallSpy).toHaveBeenCalledWith("FastLED"));
  });

  it("falls back to a backend search when the registry fails to load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // expected log
    vi.spyOn(arduinoApi, "libListAll").mockRejectedValue(new Error("offline"));
    const searchSpy = vi
      .spyOn(arduinoApi, "libSearch")
      .mockResolvedValue([FASTLED]);

    render(<LibrariesView />);

    // The offline notice replaces the registry browser.
    expect(
      await screen.findByText(/Couldn't load the full registry/),
    ).toBeInTheDocument();

    // The search box now drives a real per-query backend search.
    fireEvent.input(
      screen.getByPlaceholderText(/Search the Arduino library registry/),
      { target: { value: "fastled" } },
    );

    await waitFor(() => expect(searchSpy).toHaveBeenCalledWith("fastled"));
    expect(await screen.findByText("FastLED")).toBeInTheDocument();
  });

  it("exposes an Install from ZIP button", async () => {
    render(<LibrariesView />);
    expect(
      screen.getByTitle("Install a library from a local .zip archive"),
    ).toBeInTheDocument();
    await waitFor(() => expect(arduinoApi.libListAll).toHaveBeenCalled());
  });

  it("releases the install lock when onLibInstallOutput itself rejects", async () => {
    // Pre-fix bug: libraryInstalling.value was set BEFORE awaiting the
    // listener subscription. If that await rejected, the throw escaped the
    // function without entering the try, and the lock stayed permanently set.
    vi.spyOn(console, "error").mockImplementation(() => {}); // expected log
    vi.spyOn(arduinoApi, "onLibInstallOutput").mockRejectedValue(
      new Error("listener attach failed"),
    );
    const installSpy = vi.spyOn(arduinoApi, "libInstall").mockResolvedValue(0);

    render(<LibrariesView />);
    await screen.findByText("FastLED");

    // Narrow to FastLED so exactly one Install button is on screen.
    fireEvent.input(
      screen.getByPlaceholderText(/Filter the Arduino library registry/),
      { target: { value: "fastled" } },
    );
    await waitFor(() =>
      expect(screen.queryByText("Servo")).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText("Install").closest("button")!);

    // The install lock must clear even though the listener attach rejected.
    // Before the fix, libraryInstalling stayed pinned to "FastLED" forever.
    await waitFor(() => expect(libraryInstalling.value).toBeNull());
    // And the actual op is never attempted, since the throw aborts the
    // happy path before libInstall is called.
    expect(installSpy).not.toHaveBeenCalled();
  });
});

describe("LibrariesView — Arduino IDE parity additions", () => {
  it("has an Updatable tab with an Update all button that updates each outdated library", async () => {
    const outdatedServo: Library = { ...SERVO, installed_version: "1.1.0", update_available: true };
    vi.spyOn(arduinoApi, "libListInstalled").mockResolvedValue([NEOPIXEL_OUTDATED, outdatedServo, FASTLED_INSTALLED]);
    const installSpy = vi.spyOn(arduinoApi, "libInstall").mockResolvedValue(0);
    render(<LibrariesView />);
    await screen.findByText("Adafruit NeoPixel");
    fireEvent.click(screen.getByRole("tab", { name: /Updatable/ }));
    expect(await screen.findByText(/Updatable · 2/)).toBeInTheDocument();
    expect(screen.queryByText("FastLED")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Update all").closest("button")!);
    await waitFor(() => expect(installSpy).toHaveBeenCalledTimes(2));
    expect(installSpy).toHaveBeenCalledWith("Adafruit NeoPixel@1.15.5");
    expect(installSpy).toHaveBeenCalledWith("Servo@1.2.1");
  });

  it("filters by Type and Topic facets", async () => {
    vi.spyOn(arduinoApi, "libListAll").mockResolvedValue([
      { ...NEOPIXEL, category: "Display", types: ["Contributed"] },
      { ...SERVO, category: "Device Control", types: ["Arduino"] },
    ]);
    render(<LibrariesView />);
    await screen.findByText("Servo");
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "Arduino" } });
    await waitFor(() => expect(screen.queryByText("Adafruit NeoPixel")).not.toBeInTheDocument());
    expect(screen.getByText("Servo")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Display" } });
    await waitFor(() => expect(screen.queryByText("Servo")).not.toBeInTheDocument());
    fireEvent.click(screen.getByText("clear"));
    expect(await screen.findByText("Servo")).toBeInTheDocument();
  });

  it("installs a chosen older version and links to the library website", async () => {
    vi.spyOn(arduinoApi, "libListAll").mockResolvedValue([
      { ...ARDUINOJSON, available_versions: ["6.21.5", "7.4.2", "7.4.3"], website: "https://arduinojson.org" },
    ]);
    const installSpy = vi.spyOn(arduinoApi, "libInstall").mockResolvedValue(0);
    render(<LibrariesView />);
    await screen.findByText("ArduinoJson");
    expect(screen.getByText("more info")).toBeInTheDocument();
    const picker = screen.getByLabelText("ArduinoJson version") as HTMLSelectElement;
    expect(picker.options[0].value).toBe("7.4.3");
    fireEvent.change(picker, { target: { value: "6.21.5" } });
    fireEvent.click(screen.getByText("Install").closest("button")!);
    await waitFor(() => expect(installSpy).toHaveBeenCalledWith("ArduinoJson@6.21.5"));
  });
});
