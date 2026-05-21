import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, it, expect, vi } from "vitest";
import { Trash2 } from "lucide-preact";
import {
  ContextMenu,
  menuSeparator,
  type ContextMenuItem,
} from "../../src/components/ContextMenu";

/** A small menu fixture; `onSelect`/`onClose` spies are passed per-test. */
function items(onSelect: () => void): ContextMenuItem[] {
  return [
    { label: "New File", onSelect },
    menuSeparator,
    { label: "Rename", onSelect, shortcut: "F2" },
    { label: "Delete", icon: Trash2, danger: true, onSelect },
    { label: "Disabled Row", disabled: true, onSelect },
  ];
}

describe("ContextMenu", () => {
  it("renders every item label and a separator", () => {
    render(
      <ContextMenu x={10} y={10} items={items(vi.fn())} onClose={vi.fn()} />,
    );
    expect(screen.getByText("New File")).toBeInTheDocument();
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(
      document.querySelector(".context-menu-separator"),
    ).toBeInTheDocument();
  });

  it("shows a shortcut hint when one is given", () => {
    render(
      <ContextMenu x={0} y={0} items={items(vi.fn())} onClose={vi.fn()} />,
    );
    expect(screen.getByText("F2")).toBeInTheDocument();
  });

  it("marks the danger item with the danger class", () => {
    render(
      <ContextMenu x={0} y={0} items={items(vi.fn())} onClose={vi.fn()} />,
    );
    const row = screen.getByText("Delete").closest("button")!;
    expect(row).toHaveClass("danger");
  });

  it("runs an item's handler and closes when the item is clicked", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu x={0} y={0} items={items(onSelect)} onClose={onClose} />,
    );
    fireEvent.click(screen.getByText("New File"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not run a disabled item, and the button is disabled", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu x={0} y={0} items={items(onSelect)} onClose={onClose} />,
    );
    const row = screen.getByText("Disabled Row").closest("button")!;
    expect(row).toBeDisabled();
    fireEvent.click(row);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu x={0} y={0} items={items(vi.fn())} onClose={onClose} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on an outside click (mousedown)", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu x={0} y={0} items={items(vi.fn())} onClose={onClose} />,
    );
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on an outside right-click", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu x={0} y={0} items={items(vi.fn())} onClose={onClose} />,
    );
    fireEvent.contextMenu(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when the menu itself is pressed", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu x={0} y={0} items={items(vi.fn())} onClose={onClose} />,
    );
    fireEvent.mouseDown(document.querySelector(".context-menu")!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("positions itself at the cursor via inline coordinates when it fits", () => {
    render(
      <ContextMenu x={42} y={84} items={items(vi.fn())} onClose={vi.fn()} />,
    );
    const el = document.querySelector(".context-menu") as HTMLElement;
    // jsdom reports a 0x0 rect inside a default 1024x768 window, so the menu
    // fits at the cursor and is not shifted.
    expect(el.style.left).toBe("42px");
    expect(el.style.top).toBe("84px");
  });
});
