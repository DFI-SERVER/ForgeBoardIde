import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, it, expect, beforeEach } from "vitest";
import { TabBar } from "../../src/components/TabBar";
import { openTabs, activeTabIndex } from "../../src/state/appState";

beforeEach(() => {
  openTabs.value = [
    { path: "a.ino", modified: true },
    { path: "b.h", modified: false },
  ];
  activeTabIndex.value = 0;
});

describe("TabBar", () => {
  it("renders all open tabs", () => {
    render(<TabBar />);
    expect(screen.getByText("a.ino")).toBeInTheDocument();
    expect(screen.getByText("b.h")).toBeInTheDocument();
  });

  it("marks modified tabs with a filled dot", () => {
    render(<TabBar />);
    const tabs = screen.getAllByRole("button");
    const aTab = tabs.find((t) => t.textContent?.includes("a.ino"))!;
    expect(aTab.querySelector(".modified")).toBeInTheDocument();
  });

  it("changes active tab on click", () => {
    render(<TabBar />);
    fireEvent.click(screen.getByText("b.h"));
    expect(activeTabIndex.value).toBe(1);
  });

  it("closes tab on × click", () => {
    render(<TabBar />);
    const xs = document.querySelectorAll(".tab-x");
    fireEvent.click(xs[0]);
    expect(openTabs.value).toHaveLength(1);
    expect(openTabs.value[0].path).toBe("b.h");
  });
});
