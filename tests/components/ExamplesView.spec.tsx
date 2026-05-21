import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ExamplesView } from "../../src/components/ExamplesView";
import { arduinoApi, type LibraryExample } from "../../src/ipc/arduino";
import { projectApi, type Sketch } from "../../src/ipc/project";
import {
  libraryExamples,
  exampleSearchQuery,
  exampleScanPending,
  exampleOpening,
  currentSketch,
} from "../../src/state/appState";
import { CURATED_EXAMPLES } from "../../src/lib/example-catalog";

/** A library example as the Rust scan would report it. */
const STRANDTEST: LibraryExample = {
  name: "Strandtest",
  library: "Adafruit NeoPixel",
  ino_path: "C:\\ForgeBoard\\libraries\\Adafruit NeoPixel\\examples\\Strandtest\\Strandtest.ino",
  folder_path: "C:\\ForgeBoard\\libraries\\Adafruit NeoPixel\\examples\\Strandtest",
};

/** A created sketch as project_create would return it. */
function createdSketch(name: string): Sketch {
  const path = `C:\\ForgeBoard\\sketches\\${name}`;
  return {
    name,
    path,
    files: [{ name: `${name}.ino`, path: `${path}\\${name}.ino`, is_main: true }],
  };
}

beforeEach(() => {
  libraryExamples.value = [];
  exampleSearchQuery.value = "";
  exampleScanPending.value = false;
  exampleOpening.value = null;
  currentSketch.value = null;
  vi.spyOn(arduinoApi, "listLibraryExamples").mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  currentSketch.value = null;
});

describe("ExamplesView", () => {
  it("renders the header and the curated starter examples", async () => {
    render(<ExamplesView />);
    expect(screen.getByText("Examples")).toBeInTheDocument();
    // The starter group and every curated example are listed.
    expect(screen.getByText("Starter examples")).toBeInTheDocument();
    for (const ex of CURATED_EXAMPLES) {
      expect(screen.getByText(ex.name)).toBeInTheDocument();
    }
    await waitFor(() =>
      expect(arduinoApi.listLibraryExamples).toHaveBeenCalled(),
    );
  });

  it("shows a starter count in the header", () => {
    render(<ExamplesView />);
    expect(
      screen.getByText(`${CURATED_EXAMPLES.length} starters`),
    ).toBeInTheDocument();
  });

  it("scans installed-library examples on mount and groups them", async () => {
    vi.spyOn(arduinoApi, "listLibraryExamples").mockResolvedValue([STRANDTEST]);
    render(<ExamplesView />);
    // The library name heads its own group; the example appears under it.
    expect(await screen.findByText("Adafruit NeoPixel")).toBeInTheDocument();
    expect(screen.getByText("Strandtest")).toBeInTheDocument();
  });

  it("hints to install a library when none provide examples", async () => {
    render(<ExamplesView />);
    expect(
      await screen.findByText(/Install a library to see its examples/),
    ).toBeInTheDocument();
  });

  it("filters examples by name as the user types", async () => {
    render(<ExamplesView />);
    const input = screen.getByPlaceholderText("Search examples…");
    fireEvent.input(input, { target: { value: "blink" } });

    // Blink survives the filter; an unrelated example does not.
    expect(screen.getByText("Blink")).toBeInTheDocument();
    expect(screen.queryByText("WiFi Scan")).not.toBeInTheDocument();
  });

  it("shows a no-results state when the filter matches nothing", () => {
    render(<ExamplesView />);
    const input = screen.getByPlaceholderText("Search examples…");
    fireEvent.input(input, { target: { value: "zzzznope" } });
    expect(screen.getByText("No examples found")).toBeInTheDocument();
  });

  it("filters library examples too", async () => {
    vi.spyOn(arduinoApi, "listLibraryExamples").mockResolvedValue([STRANDTEST]);
    render(<ExamplesView />);
    await screen.findByText("Strandtest");

    const input = screen.getByPlaceholderText("Search examples…");
    fireEvent.input(input, { target: { value: "strand" } });
    // The library example matches; curated ones are filtered out.
    expect(screen.getByText("Strandtest")).toBeInTheDocument();
    expect(screen.queryByText("Blink")).not.toBeInTheDocument();
  });

  it("opens a curated example as a new sketch on click", async () => {
    const createSpy = vi
      .spyOn(projectApi, "create")
      .mockResolvedValue(createdSketch("Blink"));
    const saveSpy = vi.spyOn(projectApi, "saveFile").mockResolvedValue();
    vi.spyOn(projectApi, "open").mockResolvedValue(createdSketch("Blink"));
    vi.spyOn(projectApi, "readFile").mockResolvedValue("");

    render(<ExamplesView />);
    fireEvent.click(screen.getByText("Blink").closest("button")!);

    // A new sketch is created and seeded with the example's source.
    await waitFor(() => expect(createSpy).toHaveBeenCalledWith("Blink", null));
    const blink = CURATED_EXAMPLES.find((e) => e.name === "Blink")!;
    await waitFor(() =>
      expect(saveSpy).toHaveBeenCalledWith(expect.any(String), blink.source),
    );
  });

  it("retries with a numeric suffix when the sketch name is taken", async () => {
    // First create collides; second (suffixed) succeeds.
    const createSpy = vi.spyOn(projectApi, "create");
    createSpy.mockRejectedValueOnce({ type: "AlreadyExists", message: "Blink" });
    createSpy.mockResolvedValueOnce(createdSketch("Blink 2"));
    vi.spyOn(projectApi, "saveFile").mockResolvedValue();
    vi.spyOn(projectApi, "open").mockResolvedValue(createdSketch("Blink 2"));
    vi.spyOn(projectApi, "readFile").mockResolvedValue("");

    render(<ExamplesView />);
    fireEvent.click(screen.getByText("Blink").closest("button")!);

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(2));
    expect(createSpy).toHaveBeenNthCalledWith(1, "Blink", null);
    expect(createSpy).toHaveBeenNthCalledWith(2, "Blink 2", null);
  });

  it("opens a library example by reading its .ino from disk", async () => {
    vi.spyOn(arduinoApi, "listLibraryExamples").mockResolvedValue([STRANDTEST]);
    const readSpy = vi
      .spyOn(projectApi, "readFile")
      .mockResolvedValue("void setup(){}\nvoid loop(){}");
    const createSpy = vi
      .spyOn(projectApi, "create")
      .mockResolvedValue(createdSketch("Strandtest"));
    vi.spyOn(projectApi, "saveFile").mockResolvedValue();
    vi.spyOn(projectApi, "open").mockResolvedValue(createdSketch("Strandtest"));

    render(<ExamplesView />);
    fireEvent.click((await screen.findByText("Strandtest")).closest("button")!);

    // The example's source is read from its on-disk path, then branched.
    await waitFor(() =>
      expect(readSpy).toHaveBeenCalledWith(STRANDTEST.ino_path),
    );
    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith("Strandtest", null),
    );
  });
});
