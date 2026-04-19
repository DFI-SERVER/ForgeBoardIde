import { render, screen } from "@testing-library/preact";
import { describe, it, expect } from "vitest";
import { TitleBar } from "../../src/components/TitleBar";

describe("TitleBar", () => {
  it("renders the ForgeBoard IDE brand", () => {
    render(<TitleBar />);
    expect(screen.getByText(/ForgeBoard IDE/i)).toBeInTheDocument();
  });

  it("shows the active file name", () => {
    render(<TitleBar />);
    expect(screen.getByText(/led-chase.ino/i)).toBeInTheDocument();
  });
});
