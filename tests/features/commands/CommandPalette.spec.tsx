import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CommandPalette } from "@/features/commands/components/CommandPalette";
import { paletteOpen, paletteMode } from "@/features/commands/state";
import { activeRail, bottomPanelOpen } from "@/app/state";
import { currentSketch } from "@/features/project/state";
import { fileContents, recentFilePaths, openTabs, activeTabIndex } from "@/features/editor/state";

beforeEach(() => {
  paletteOpen.value = true;
  activeRail.value = "files";
  bottomPanelOpen.value = true;
});

afterEach(() => {
  paletteOpen.value = false;
});

describe("CommandPalette", () => {
  it("renders nothing when paletteOpen is false", () => {
    paletteOpen.value = false;
    const { container } = render(<CommandPalette />);
    expect(container.querySelector(".palette-panel")).not.toBeInTheDocument();
  });

  it("renders an autofocused search input when open", () => {
    render(<CommandPalette />);
    const input = screen.getByPlaceholderText("Type a command…");
    expect(input).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("lists all commands before any query is typed", () => {
    render(<CommandPalette />);
    expect(screen.getByText("New Sketch")).toBeInTheDocument();
    expect(screen.getByText("Verify / Compile")).toBeInTheDocument();
    expect(screen.getByText("Go to Boards")).toBeInTheDocument();
  });

  it("fuzzy-filters the list as the query changes", () => {
    render(<CommandPalette />);
    const input = screen.getByPlaceholderText("Type a command…");
    fireEvent.input(input, { target: { value: "boards" } });
    expect(screen.getByText("Go to Boards")).toBeInTheDocument();
    expect(screen.queryByText("New Sketch")).not.toBeInTheDocument();
  });

  it("shows a tasteful empty state when nothing matches", () => {
    render(<CommandPalette />);
    const input = screen.getByPlaceholderText("Type a command…");
    fireEvent.input(input, { target: { value: "zzzznope" } });
    expect(screen.getByText("No matching commands")).toBeInTheDocument();
  });

  it("highlights the first result by default", () => {
    render(<CommandPalette />);
    const rows = document.querySelectorAll(".palette-row");
    expect(rows[0]).toHaveClass("active");
  });

  it("moves the highlight with ArrowDown", () => {
    render(<CommandPalette />);
    const input = screen.getByPlaceholderText("Type a command…");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const rows = document.querySelectorAll(".palette-row");
    expect(rows[0]).not.toHaveClass("active");
    expect(rows[1]).toHaveClass("active");
  });

  it("wraps the highlight from first to last with ArrowUp", () => {
    render(<CommandPalette />);
    const input = screen.getByPlaceholderText("Type a command…");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    const rows = document.querySelectorAll(".palette-row");
    expect(rows[rows.length - 1]).toHaveClass("active");
  });

  it("runs the selected command on Enter and closes the palette", () => {
    render(<CommandPalette />);
    const input = screen.getByPlaceholderText("Type a command…");
    fireEvent.input(input, { target: { value: "go to boards" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(activeRail.value).toBe("boards");
    expect(paletteOpen.value).toBe(false);
  });

  it("runs a command on row click", () => {
    render(<CommandPalette />);
    const input = screen.getByPlaceholderText("Type a command…");
    fireEvent.input(input, { target: { value: "toggle bottom panel" } });
    fireEvent.click(screen.getByText("Toggle Bottom Panel"));
    expect(bottomPanelOpen.value).toBe(false);
    expect(paletteOpen.value).toBe(false);
  });

  it("closes on Escape", () => {
    render(<CommandPalette />);
    const input = screen.getByPlaceholderText("Type a command…");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(paletteOpen.value).toBe(false);
  });

  it("closes on an overlay click", () => {
    render(<CommandPalette />);
    fireEvent.mouseDown(document.querySelector(".palette-overlay")!);
    expect(paletteOpen.value).toBe(false);
  });

  it("does not close when the panel itself is clicked", () => {
    render(<CommandPalette />);
    fireEvent.mouseDown(document.querySelector(".palette-panel")!);
    expect(paletteOpen.value).toBe(true);
  });

  it("shows category and shortcut hints on rows", () => {
    render(<CommandPalette />);
    const input = screen.getByPlaceholderText("Type a command…");
    fireEvent.input(input, { target: { value: "save" } });
    const row = screen.getByText("Save").closest(".palette-row")!;
    expect(row.querySelector(".palette-row-category")?.textContent).toBe("File");
    expect(row.querySelector(".palette-row-shortcut")?.textContent).toBe("Ctrl+S");
  });
});

describe("CommandPalette — file mode", () => {
  beforeEach(() => {
    paletteOpen.value = false;
    paletteMode.value = "command";
    openTabs.value = [];
    activeTabIndex.value = 0;
    fileContents.value = new Map();
    recentFilePaths.value = [];
    currentSketch.value = {
      name: "demo",
      path: "/s/demo",
      files: [
        { path: "/s/demo/blink.ino", name: "blink.ino", is_main: true },
        { path: "/s/demo/secrets.h", name: "secrets.h", is_main: false },
        { path: "/s/demo/util.cpp", name: "util.cpp", is_main: false },
      ],
    } as any;
  });

  it("renders the sketch's files when opened in file mode with empty query", () => {
    paletteMode.value = "file";
    paletteOpen.value = true;
    render(<CommandPalette />);
    expect(screen.getByText("blink.ino")).toBeInTheDocument();
    expect(screen.getByText("secrets.h")).toBeInTheDocument();
    expect(screen.getByText("util.cpp")).toBeInTheDocument();
  });

  it("filters files as the user types", () => {
    paletteMode.value = "file";
    paletteOpen.value = true;
    render(<CommandPalette />);
    const input = screen.getByLabelText(/search/i) as HTMLInputElement;
    fireEvent.input(input, { target: { value: "secr" } });
    expect(screen.getByText("secrets.h")).toBeInTheDocument();
    expect(screen.queryByText("blink.ino")).not.toBeInTheDocument();
  });

  it("placeholder copy reflects the active mode", () => {
    paletteMode.value = "file";
    paletteOpen.value = true;
    render(<CommandPalette />);
    const input = screen.getByLabelText(/search/i) as HTMLInputElement;
    expect(input.placeholder).toBe("Go to file…");
    fireEvent.input(input, { target: { value: ">" } });
    expect(input.placeholder).toBe("Type a command…");
  });

  it("shows the no-matches state when query doesn't match", () => {
    paletteMode.value = "file";
    paletteOpen.value = true;
    render(<CommandPalette />);
    const input = screen.getByLabelText(/search/i) as HTMLInputElement;
    fireEvent.input(input, { target: { value: "xyz" } });
    expect(screen.getByText("No matching files.")).toBeInTheDocument();
  });
});
