import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Stub the MonacoEditor and WelcomeScreen with lightweight placeholders so
 * the EditorArea layout can be exercised without spinning up Monaco's worker
 * (which jsdom does not implement). Also stub the recent-projects IPC the
 * real WelcomeScreen uses on mount; we never render it but the import path
 * still drags it in. The stub MUST be declared via vi.mock BEFORE the
 * EditorArea import so the mock takes effect.
 */
vi.mock("../../src/components/MonacoEditor", () => ({
  MonacoEditor: ({ groupId }: { groupId: string }) => (
    <div data-testid="monaco-stub" data-group-id={groupId}>
      Monaco({groupId})
    </div>
  ),
  // The autosave module imports getActiveEditor + withProgrammaticEdit from
  // here; expose harmless stand-ins so any transitive load still typechecks.
  getActiveEditor: () => null,
  withProgrammaticEdit: <T,>(fn: () => T): T => fn(),
}));
vi.mock("../../src/components/WelcomeScreen", () => ({
  WelcomeScreen: () => <div data-testid="welcome-stub">Welcome</div>,
}));

import { EditorArea } from "../../src/components/EditorArea";
import {
  openTabs,
  activeTabIndex,
  editorGroups,
  activeGroupIndex,
} from "../../src/state/appState";
import {
  splitEditorRight,
  _resetForTests,
} from "../../src/lib/editor-groups";

beforeEach(() => {
  _resetForTests();
});

describe("EditorArea — single group", () => {
  it("renders the WelcomeScreen stub when no tabs are open", () => {
    render(<EditorArea />);
    expect(screen.getByTestId("welcome-stub")).toBeInTheDocument();
    // No tab strip when there are no tabs.
    expect(document.querySelector(".tabbar")).not.toBeInTheDocument();
  });

  it("renders a single Monaco pane and TabBar when tabs are open", () => {
    openTabs.value = [
      { path: "/s/a.ino", name: "a.ino", modified: false },
      { path: "/s/b.h", name: "b.h", modified: false },
    ];
    activeTabIndex.value = 0;
    render(<EditorArea />);
    // Exactly one Monaco instance for the single-pane layout.
    const stubs = screen.getAllByTestId("monaco-stub");
    expect(stubs).toHaveLength(1);
    expect(stubs[0].getAttribute("data-group-id")).toBe("g0");
    expect(screen.getByText("a.ino")).toBeInTheDocument();
    expect(screen.queryByTestId("welcome-stub")).not.toBeInTheDocument();
  });

  it("has no editor-split wrapper when only one group exists", () => {
    openTabs.value = [{ path: "/s/a.ino", name: "a.ino", modified: false }];
    activeTabIndex.value = 0;
    render(<EditorArea />);
    expect(document.querySelector(".editor-split")).not.toBeInTheDocument();
    expect(document.querySelector(".editor-split-handle")).not.toBeInTheDocument();
  });
});

describe("EditorArea — split layout", () => {
  beforeEach(() => {
    openTabs.value = [
      { path: "/s/a.ino", name: "a.ino", modified: false },
      { path: "/s/b.h", name: "b.h", modified: false },
    ];
    activeTabIndex.value = 0;
    splitEditorRight();
    // After splitEditorRight, activeGroupIndex is 1.
  });

  it("renders two Monaco panes — one per group", () => {
    render(<EditorArea />);
    const stubs = screen.getAllByTestId("monaco-stub");
    expect(stubs).toHaveLength(2);
    expect(stubs[0].getAttribute("data-group-id")).toBe("g0");
    expect(stubs[1].getAttribute("data-group-id")).toBe(
      editorGroups.value[1].id,
    );
  });

  it("renders the editor-split wrapper and the splitter handle", () => {
    render(<EditorArea />);
    expect(document.querySelector(".editor-split")).toBeInTheDocument();
    expect(document.querySelector(".editor-split-handle")).toBeInTheDocument();
  });

  it("marks the active group with .editor-area-active and not the inactive one", () => {
    render(<EditorArea />);
    const panes = document.querySelectorAll(".editor-area");
    expect(panes).toHaveLength(2);
    // splitEditorRight focuses the new (right) group, so panes[1] is active.
    expect(panes[1].classList.contains("editor-area-active")).toBe(true);
    expect(panes[0].classList.contains("editor-area-active")).toBe(false);
  });

  it("clicking an inactive pane focuses it", () => {
    render(<EditorArea />);
    const panes = document.querySelectorAll(".editor-area");
    // Sanity: right pane is the active one after splitEditorRight.
    expect(activeGroupIndex.value).toBe(1);
    // Click the left pane (g0).
    fireEvent.mouseDown(panes[0]);
    expect(activeGroupIndex.value).toBe(0);
  });

  it("each pane carries its own TabBar with the group's tabs", () => {
    render(<EditorArea />);
    // Both groups carry the same tabs after a clone-split — assert the right
    // pane's tab strip has "a.ino" visible.
    const allTabs = screen.getAllByText("a.ino");
    expect(allTabs.length).toBe(2);
  });
});
