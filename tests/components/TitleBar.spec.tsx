import { render, screen } from "@testing-library/preact";
import { describe, it, expect, beforeEach } from "vitest";
import { TitleBar } from "../../src/components/TitleBar";
import { openTabs, activeTabIndex } from "../../src/state/appState";

beforeEach(() => {
  openTabs.value = [
    { path: "/sketches/led-chase/led-chase.ino", name: "led-chase.ino", modified: false },
  ];
  activeTabIndex.value = 0;
});

describe("TitleBar", () => {
  it("renders the ForgeBoard IDE brand", () => {
    render(<TitleBar />);
    expect(screen.getByText("ForgeBoard")).toBeInTheDocument();
    expect(screen.getByText("IDE")).toBeInTheDocument();
  });

  it("shows the active file name", () => {
    render(<TitleBar />);
    expect(screen.getByText("led-chase.ino")).toBeInTheDocument();
  });
});
