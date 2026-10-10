import { render, screen } from "@testing-library/preact";
import { describe, it, expect } from "vitest";
import { TitleBar } from "@/app/components/TitleBar";

describe("TitleBar", () => {
  it("renders the ForgeBoard IDE brand", () => {
    render(<TitleBar />);
    expect(screen.getByText("ForgeBoard")).toBeInTheDocument();
    expect(screen.getByText("IDE")).toBeInTheDocument();
  });

  it("renders the window controls", () => {
    render(<TitleBar />);
    expect(screen.getByTitle("Minimize")).toBeInTheDocument();
    expect(screen.getByTitle("Maximize")).toBeInTheDocument();
    expect(screen.getByTitle("Close")).toBeInTheDocument();
  });
});
