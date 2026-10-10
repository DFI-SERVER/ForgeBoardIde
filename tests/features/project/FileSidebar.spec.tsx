import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FileSidebar } from "@/features/project/components/FileSidebar";
import { activeRail } from "@/app/state";
import { currentSketch } from "@/features/project/state";
import { openTabs, activeTabIndex } from "@/features/editor/state";
import type { Sketch } from "@/ipc/project";

/** A two-file sketch fixture, as the backend would return it. */
const sketch: Sketch = {
  name: "blink",
  path: "C:\\sketches\\blink",
  files: [
    { name: "blink.ino", path: "C:\\sketches\\blink\\blink.ino", is_main: true },
    { name: "pins.h", path: "C:\\sketches\\blink\\pins.h", is_main: false },
  ],
};

beforeEach(() => {
  activeRail.value = "files";
  currentSketch.value = sketch;
  openTabs.value = [];
  activeTabIndex.value = 0;
});

afterEach(() => {
  currentSketch.value = null;
  vi.restoreAllMocks();
});

/** Right-click a file row by its visible name. */
function rightClickFile(name: string) {
  const row = screen.getByText(name).closest(".sb-file")!;
  fireEvent.contextMenu(row);
}

describe("FileSidebar — Files context menu", () => {
  it("renders the sketch's files in the tree", () => {
    render(<FileSidebar />);
    expect(screen.getByText("blink.ino")).toBeInTheDocument();
    expect(screen.getByText("pins.h")).toBeInTheDocument();
  });

  it("opens a context menu on right-clicking a file row", () => {
    render(<FileSidebar />);
    expect(document.querySelector(".context-menu")).not.toBeInTheDocument();
    rightClickFile("pins.h");
    const menu = document.querySelector(".context-menu");
    expect(menu).toBeInTheDocument();
    // The file menu offers the full action set.
    for (const label of [
      "New File",
      "New Folder",
      "Rename…",
      "Delete",
      "Reveal in File Explorer",
      "Copy Path",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("offers only New File / New Folder when the empty area is right-clicked", () => {
    render(<FileSidebar />);
    fireEvent.contextMenu(document.querySelector(".sb-body")!);
    expect(document.querySelector(".context-menu")).toBeInTheDocument();
    expect(screen.getByText("New File")).toBeInTheDocument();
    expect(screen.getByText("New Folder")).toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    expect(screen.queryByText("Rename…")).not.toBeInTheDocument();
  });

  it("opens the Rename dialog prefilled with the file's name", () => {
    render(<FileSidebar />);
    rightClickFile("pins.h");
    fireEvent.click(screen.getByText("Rename…"));
    const input = document.getElementById("file-name-input") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("pins.h");
  });

  it("opens a delete confirmation that names the file and mentions the recycle bin", () => {
    render(<FileSidebar />);
    rightClickFile("pins.h");
    fireEvent.click(screen.getByText("Delete"));
    // The dialog names the target (in its own .dlg-confirm-name span) and
    // notes that the file is recoverable from the recycle bin.
    const named = document.querySelector(".dlg-confirm-name");
    expect(named?.textContent).toBe("pins.h");
    expect(screen.getByText(/recycle bin/i)).toBeInTheDocument();
  });

  it("opens the New File dialog from the menu", () => {
    render(<FileSidebar />);
    rightClickFile("blink.ino");
    fireEvent.click(screen.getByText("New File"));
    expect(screen.getByText("New file")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create file" }),
    ).toBeInTheDocument();
  });

  it("dismisses the context menu on Escape", () => {
    render(<FileSidebar />);
    rightClickFile("pins.h");
    expect(document.querySelector(".context-menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.querySelector(".context-menu")).not.toBeInTheDocument();
  });

  it("copies the absolute path to the clipboard via Copy Path", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<FileSidebar />);
    rightClickFile("pins.h");
    fireEvent.click(screen.getByText("Copy Path"));
    expect(writeText).toHaveBeenCalledWith("C:\\sketches\\blink\\pins.h");
  });
});
