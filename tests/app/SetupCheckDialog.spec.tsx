import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { SetupCheckDialog } from "@/app/components/SetupCheckDialog";
import { setupChecks, setupCheckOpen } from "@/app/setup-check";
import { activeRail } from "@/app/state";
import { setupApi } from "@/ipc/setup";

beforeEach(() => {
  setupCheckOpen.value = true;
  activeRail.value = "home";
  vi.spyOn(setupApi, "check").mockResolvedValue([]);
});

describe("SetupCheckDialog", () => {
  it("shows a blocked item with its terminal command and a copy button", () => {
    setupChecks.value = [
      {
        id: "serial-group",
        title: "Serial port permission",
        status: "fail",
        detail: "Not in dialout.",
        fix: { kind: "command", label: "Add your user to dialout", command: "sudo usermod -aG dialout $USER", url: null },
      },
    ];
    render(<SetupCheckDialog />);
    expect(screen.getByText("Serial port permission")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByText("sudo usermod -aG dialout $USER")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
    expect(screen.getByText(/1 item blocks/)).toBeInTheDocument();
  });

  it("offers a one-click install for an auto fix", () => {
    setupChecks.value = [
      {
        id: "rosetta",
        title: "Rosetta 2",
        status: "fail",
        detail: "Not installed.",
        fix: { kind: "auto", label: "Install Rosetta", command: "softwareupdate --install-rosetta --agree-to-license", url: null },
      },
    ];
    render(<SetupCheckDialog />);
    expect(screen.getByRole("button", { name: "Install Rosetta" })).toBeInTheDocument();
  });

  it("jumps to the Boards view when no core is installed", () => {
    setupChecks.value = [
      {
        id: "core",
        title: "Board core",
        status: "warn",
        detail: "None installed.",
        fix: { kind: "install-core", label: "Open Boards", command: null, url: null },
      },
    ];
    render(<SetupCheckDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Open Boards" }));
    expect(activeRail.value).toBe("boards");
    expect(setupCheckOpen.value).toBe(false);
  });

  it("says all is well when every check is ok", () => {
    setupChecks.value = [
      { id: "internet", title: "Internet access", status: "ok", detail: "Reachable.", fix: null },
    ];
    render(<SetupCheckDialog />);
    expect(screen.getByText(/Everything this computer needs/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    setupCheckOpen.value = false;
    const { container } = render(<SetupCheckDialog />);
    expect(container.innerHTML).toBe("");
  });
});
