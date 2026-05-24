import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MenuBar } from "../../src/components/MenuBar";
import { projectApi } from "../../src/ipc/project";
import {
  bottomPanelOpen,
  newSketchDialogOpen,
  keyboardShortcutsOpen,
  paletteOpen,
} from "../../src/state/appState";

beforeEach(() => {
  bottomPanelOpen.value = true;
  newSketchDialogOpen.value = false;
  keyboardShortcutsOpen.value = false;
  paletteOpen.value = false;
  vi.spyOn(projectApi, "listRecent").mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MenuBar", () => {
  it("renders the six top-level menus", () => {
    render(<MenuBar />);
    for (const name of ["File", "Edit", "Sketch", "Tools", "View", "Help"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("opens the Tools menu and shows its items", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByText("Tools"));
    expect(screen.getByText("Auto Format")).toBeInTheDocument();
    expect(screen.getByText("Archive Sketch…")).toBeInTheDocument();
    expect(screen.getByText("Serial Monitor")).toBeInTheDocument();
    expect(screen.getByText("Get Board Info")).toBeInTheDocument();
  });

  it("opens a dropdown on click and shows its items", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByText("File"));
    expect(screen.getByText("New Sketch")).toBeInTheDocument();
    expect(screen.getByText("Open Sketch…")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Close Window")).toBeInTheDocument();
  });

  it("shows keyboard-shortcut hints on items", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByText("File"));
    expect(screen.getByText("Ctrl+N")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+O")).toBeInTheDocument();
  });

  it("toggles the same menu closed on a second click", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByText("File"));
    expect(screen.getByText("New Sketch")).toBeInTheDocument();
    fireEvent.click(screen.getByText("File"));
    expect(screen.queryByText("New Sketch")).not.toBeInTheDocument();
  });

  it("switches menus when hovering another top-level item while open", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByText("File"));
    expect(screen.getByText("New Sketch")).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByText("Edit"));
    expect(screen.queryByText("New Sketch")).not.toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
  });

  it("does not open a menu on hover when nothing is open", () => {
    render(<MenuBar />);
    fireEvent.mouseEnter(screen.getByText("Edit"));
    expect(screen.queryByText("Undo")).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByText("File"));
    expect(screen.getByText("New Sketch")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("New Sketch")).not.toBeInTheDocument();
  });

  it("New Sketch opens the global new-sketch dialog and closes the menu", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByText("File"));
    fireEvent.click(screen.getByText("New Sketch"));
    expect(newSketchDialogOpen.value).toBe(true);
    expect(screen.queryByText("New Sketch")).not.toBeInTheDocument();
  });

  it("View → Toggle Bottom Panel flips the bottomPanelOpen signal", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByText("View"));
    fireEvent.click(screen.getByText("Toggle Bottom Panel"));
    expect(bottomPanelOpen.value).toBe(false);
  });

  it("shows a disabled placeholder when there are no recent sketches", async () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByText("File"));
    await waitFor(() =>
      expect(projectApi.listRecent).toHaveBeenCalled(),
    );
    // mouseEnter does not bubble — fire it on the submenu host element.
    const host = screen.getByText("Open Recent").closest(".menu-submenu-host")!;
    fireEvent.mouseEnter(host);
    const placeholder = await screen.findByText("No recent sketches");
    expect(placeholder).toBeInTheDocument();
    expect(placeholder.closest("button")).toBeDisabled();
  });

  it("lists recent sketches in the Open Recent submenu", async () => {
    vi.spyOn(projectApi, "listRecent").mockResolvedValue([
      { name: "blink", path: "/sketches/blink", last_opened: 2 },
      { name: "hello", path: "/sketches/hello", last_opened: 1 },
    ]);
    render(<MenuBar />);
    fireEvent.click(screen.getByText("File"));
    await waitFor(() =>
      expect(projectApi.listRecent).toHaveBeenCalled(),
    );
    const host = screen.getByText("Open Recent").closest(".menu-submenu-host")!;
    fireEvent.mouseEnter(host);
    expect(await screen.findByText("blink")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("Help → About ForgeBoard opens the About modal", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByText("Help"));
    fireEvent.click(screen.getByText("About ForgeBoard"));
    expect(screen.getByText("About ForgeBoard IDE")).toBeInTheDocument();
    expect(screen.getByText(/Version 0\.1\.0/)).toBeInTheDocument();
  });

  it("Help → Keyboard Shortcuts opens the shortcuts modal", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByText("Help"));
    fireEvent.click(screen.getByText("Keyboard Shortcuts"));
    // The modal is the app-global, signal-driven KeyboardShortcutsModal
    // (mounted in App.tsx) — the menu item raises its open signal.
    expect(keyboardShortcutsOpen.value).toBe(true);
  });

  it("View → Command Palette opens the palette", () => {
    render(<MenuBar />);
    fireEvent.click(screen.getByText("View"));
    fireEvent.click(screen.getByText("Command Palette"));
    expect(paletteOpen.value).toBe(true);
  });
});
