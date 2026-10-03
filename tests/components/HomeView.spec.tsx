import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// HomeView's quick-start buttons delegate to the shared action handlers;
// mock the module so the test asserts the wiring without real side effects.
vi.mock("../../src/lib/actions", () => ({
  newSketch: vi.fn(),
  openSketch: vi.fn().mockResolvedValue(undefined),
  openRecentSketch: vi.fn().mockResolvedValue(undefined),
}));

import { HomeView } from "../../src/components/HomeView";
import { newSketch, openSketch, openRecentSketch } from "../../src/lib/actions";
import { projectApi, type RecentProject } from "../../src/ipc/project";
import {
  connectedPort,
  connectedBoard,
  identifyInProgress,
} from "../../src/state/appState";

const RECENT: RecentProject[] = [
  { name: "blink", path: "C:\\sketches\\blink" },
  { name: "wifi-scan", path: "C:\\sketches\\wifi-scan" },
];

beforeEach(() => {
  vi.clearAllMocks();
  connectedPort.value = null;
  connectedBoard.value = null;
  identifyInProgress.value = false;
  vi.spyOn(projectApi, "listRecent").mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HomeView", () => {
  it("renders the Quick start section header", async () => {
    render(<HomeView />);
    expect(screen.getByText("$ QUICK START")).toBeInTheDocument();
    await waitFor(() => expect(projectApi.listRecent).toHaveBeenCalled());
  });

  it("starts a new sketch when New sketch is clicked", () => {
    render(<HomeView />);
    fireEvent.click(screen.getByText("NEW SKETCH").closest("button")!);
    expect(newSketch).toHaveBeenCalled();
  });

  it("opens a sketch when Open sketch is clicked", () => {
    render(<HomeView />);
    fireEvent.click(screen.getByText("OPEN SKETCH").closest("button")!);
    expect(openSketch).toHaveBeenCalled();
  });

  it("lists recent sketches and opens one when clicked", async () => {
    vi.spyOn(projectApi, "listRecent").mockResolvedValue(RECENT);
    render(<HomeView />);

    // File names render uppercase per Direction C's mono-uppercase rule.
    const row = await screen.findByText("WIFI-SCAN");
    fireEvent.click(row.closest("button")!);

    expect(openRecentSketch).toHaveBeenCalledWith("C:\\sketches\\wifi-scan");
  });

  it("shows an empty state when there are no recent sketches", async () => {
    render(<HomeView />);
    expect(
      await screen.findByText(/no recent sketches/i),
    ).toBeInTheDocument();
  });

  it("shows the connected board and its port", () => {
    connectedPort.value = "COM4";
    connectedBoard.value = "ESP32-S3 Dev Module";
    render(<HomeView />);
    expect(screen.getByText("ESP32-S3 DEV MODULE")).toBeInTheDocument();
    expect(screen.getByText(/COM4/)).toBeInTheDocument();
  });

  it("shows a no-board state when nothing is connected", () => {
    render(<HomeView />);
    expect(screen.getByText(/no board/i)).toBeInTheDocument();
  });
});
