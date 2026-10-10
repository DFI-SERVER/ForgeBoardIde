import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { TabBar } from "@/features/editor/components/TabBar";
import {
  openTabs,
  activeTabIndex,
  editorGroups,
  activeGroupIndex,
  saveState,
} from "@/features/editor/state";
import { _resetForTests } from "@/features/editor/editor-groups";
import { projectApi } from "@/ipc/project";

beforeEach(() => {
  _resetForTests();
  // closeTab now awaits flushSaveAsync() when removing a modified tab so the
  // last unsaved edits don't vanish; the autosave path calls projectApi.saveFile,
  // which the jsdom env can't satisfy. Mock it to a resolved no-op so the
  // tests that exercise close-on-modified don't hang on a real IPC call.
  vi.spyOn(projectApi, "saveFile").mockResolvedValue(undefined);
  // Seed via the mirror — the bookkeeping effect propagates this into
  // editorGroups[0].tabs so the TabBar (which reads from editorGroups)
  // sees the same data the legacy tests assumed.
  openTabs.value = [
    { path: "/sketches/demo/a.ino", name: "a.ino", modified: true },
    { path: "/sketches/demo/b.h", name: "b.h", modified: false },
  ];
  activeTabIndex.value = 0;
  // Reset saveState so flushSaveAsync sees nothing to flush by default;
  // tests that need the dirty path opt in explicitly.
  saveState.value = "saved";
});

describe("TabBar — single group (g0)", () => {
  it("renders all open tabs", () => {
    render(<TabBar groupId="g0" />);
    expect(screen.getByText("a.ino")).toBeInTheDocument();
    expect(screen.getByText("b.h")).toBeInTheDocument();
  });

  it("marks modified tabs with the .modified class so CSS swaps X for the dot", () => {
    render(<TabBar groupId="g0" />);
    const tabs = screen.getAllByRole("button");
    const aTab = tabs.find((t) => t.textContent?.includes("a.ino"))!;
    expect(aTab.classList.contains("modified")).toBe(true);
    // The dot is always rendered (its visibility is controlled purely by CSS
    // hover state) — assert the element exists inside the modified tab.
    expect(aTab.querySelector(".tab-dot")).toBeInTheDocument();
  });

  it("changes active tab on click", () => {
    render(<TabBar groupId="g0" />);
    fireEvent.click(screen.getByText("b.h"));
    expect(activeTabIndex.value).toBe(1);
    // The editorGroups source-of-truth also reflects the new index.
    expect(editorGroups.value[0].activeTabIndex).toBe(1);
  });

  it("closes tab on × click", async () => {
    render(<TabBar groupId="g0" />);
    const xs = document.querySelectorAll(".tab-x");
    fireEvent.click(xs[0]);
    // closeTab is async (awaits flushSaveAsync before discarding a modified
    // tab) — yield a microtask so the void-wrapped promise settles before
    // we read openTabs.
    await Promise.resolve();
    await Promise.resolve();
    expect(openTabs.value).toHaveLength(1);
    expect(openTabs.value[0].name).toBe("b.h");
  });

  it("does not render a pane-close button when only one group exists", () => {
    render(<TabBar groupId="g0" />);
    expect(document.querySelector(".tabbar-close-pane")).not.toBeInTheDocument();
  });
});

describe("TabBar — split layout", () => {
  beforeEach(() => {
    _resetForTests();
    editorGroups.value = [
      {
        id: "g0",
        tabs: [
          { path: "/s/a.ino", name: "a.ino", modified: false },
          { path: "/s/b.h", name: "b.h", modified: false },
        ],
        activeTabIndex: 0,
      },
      {
        id: "g1",
        tabs: [{ path: "/s/c.cpp", name: "c.cpp", modified: true }],
        activeTabIndex: 0,
      },
    ];
    activeGroupIndex.value = 0;
    // Manually sync mirrors to the active group; the mirror effect will
    // re-fire any way but doing it here keeps reads in the test deterministic.
    openTabs.value = editorGroups.value[0].tabs;
    activeTabIndex.value = 0;
  });

  it("renders only the named group's tabs", () => {
    render(<TabBar groupId="g1" />);
    expect(screen.getByText("c.cpp")).toBeInTheDocument();
    expect(screen.queryByText("a.ino")).not.toBeInTheDocument();
  });

  it("marks the inactive group's strip with .tabbar-inactive", () => {
    render(<TabBar groupId="g1" />);
    const strip = document.querySelector(".tabbar")!;
    expect(strip.classList.contains("tabbar-inactive")).toBe(true);
  });

  it("renders a pane-close button when more than one group exists", () => {
    render(<TabBar groupId="g0" />);
    expect(document.querySelector(".tabbar-close-pane")).toBeInTheDocument();
  });

  it("clicking a tab in an inactive group focuses that group", () => {
    render(<TabBar groupId="g1" />);
    fireEvent.click(screen.getByText("c.cpp"));
    expect(activeGroupIndex.value).toBe(1);
  });

  it("clicking the pane-close button closes that group", () => {
    render(<TabBar groupId="g1" />);
    fireEvent.click(document.querySelector(".tabbar-close-pane")!);
    expect(editorGroups.value).toHaveLength(1);
    expect(editorGroups.value[0].id).toBe("g0");
  });
});
