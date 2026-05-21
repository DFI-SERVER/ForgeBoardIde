import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { KeyboardShortcutsModal } from "../../src/components/KeyboardShortcutsModal";
import { keyboardShortcutsOpen } from "../../src/state/appState";
import { CATEGORY_ORDER } from "../../src/lib/keybindings";

beforeEach(() => {
  keyboardShortcutsOpen.value = true;
});

afterEach(() => {
  keyboardShortcutsOpen.value = false;
});

describe("KeyboardShortcutsModal", () => {
  it("renders nothing when keyboardShortcutsOpen is false", () => {
    keyboardShortcutsOpen.value = false;
    const { container } = render(<KeyboardShortcutsModal />);
    expect(container.querySelector(".modal-panel")).not.toBeInTheDocument();
  });

  it("renders the modal with its title when open", () => {
    const { container } = render(<KeyboardShortcutsModal />);
    expect(container.querySelector(".modal-title")?.textContent).toBe(
      "Keyboard Shortcuts",
    );
  });

  it("renders a category heading for every populated group", () => {
    render(<KeyboardShortcutsModal />);
    for (const category of CATEGORY_ORDER) {
      expect(screen.getByText(category)).toBeInTheDocument();
    }
  });

  it("lists representative shortcuts with their actions", () => {
    render(<KeyboardShortcutsModal />);
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Verify / Compile")).toBeInTheDocument();
    expect(screen.getByText("Find in Project")).toBeInTheDocument();
  });

  it("renders combos as split <kbd> keycaps", () => {
    render(<KeyboardShortcutsModal />);
    // Ctrl+Shift+F → three separate keycaps within the Find in Project row.
    const row = screen.getByText("Find in Project").closest(".kbd-row")!;
    const caps = row.querySelectorAll("kbd.kbd-cap");
    expect(caps).toHaveLength(3);
    expect([...caps].map((c) => c.textContent)).toEqual(["Ctrl", "Shift", "F"]);
  });

  it("autofocuses the filter input", () => {
    render(<KeyboardShortcutsModal />);
    expect(screen.getByPlaceholderText("Filter shortcuts…")).toHaveFocus();
  });

  it("narrows the list as the filter query changes", () => {
    render(<KeyboardShortcutsModal />);
    const input = screen.getByPlaceholderText("Filter shortcuts…");
    fireEvent.input(input, { target: { value: "upload" } });
    expect(screen.getByText("Upload")).toBeInTheDocument();
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
  });

  it("hides a whole category group when the filter excludes all its rows", () => {
    render(<KeyboardShortcutsModal />);
    const input = screen.getByPlaceholderText("Filter shortcuts…");
    // "upload" only matches a Sketch entry — the File group should disappear.
    fireEvent.input(input, { target: { value: "upload" } });
    expect(screen.queryByText("File")).not.toBeInTheDocument();
    expect(screen.getByText("Sketch")).toBeInTheDocument();
  });

  it("filters by label case-insensitively", () => {
    render(<KeyboardShortcutsModal />);
    const input = screen.getByPlaceholderText("Filter shortcuts…");
    fireEvent.input(input, { target: { value: "SAVE" } });
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("shows an empty state when nothing matches the filter", () => {
    render(<KeyboardShortcutsModal />);
    const input = screen.getByPlaceholderText("Filter shortcuts…");
    fireEvent.input(input, { target: { value: "zzzznope" } });
    expect(screen.getByText("No matching shortcuts")).toBeInTheDocument();
  });

  it("closes on an overlay click", () => {
    render(<KeyboardShortcutsModal />);
    fireEvent.click(document.querySelector(".modal-overlay")!);
    expect(keyboardShortcutsOpen.value).toBe(false);
  });

  it("closes on Escape", () => {
    render(<KeyboardShortcutsModal />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(keyboardShortcutsOpen.value).toBe(false);
  });
});
