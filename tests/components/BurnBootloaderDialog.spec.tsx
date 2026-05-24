import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  BurnBootloaderDialog,
  PROGRAMMERS,
  DEFAULT_PROGRAMMER,
} from "../../src/components/BurnBootloaderDialog";
import { arduinoApi } from "../../src/ipc/arduino";
import {
  burnBootloaderDialogOpen,
  connectedPort,
  selectedFqbn,
  buildOutput,
  buildPhase,
  bottomPanelOpen,
  bottomPanelTab,
  toast,
} from "../../src/state/appState";

beforeEach(() => {
  burnBootloaderDialogOpen.value = false;
  connectedPort.value = "COM7";
  selectedFqbn.value = "arduino:avr:uno";
  buildOutput.value = [];
  buildPhase.value = "idle";
  bottomPanelOpen.value = false;
  bottomPanelTab.value = "serial";
  toast.value = null;
  vi.spyOn(arduinoApi, "burnBootloader").mockResolvedValue({
    success: true,
    exit_code: 0,
    stderr: "",
  });
  vi.spyOn(arduinoApi, "onBurnBootloaderOutput").mockResolvedValue(
    (() => {}) as unknown as Awaited<
      ReturnType<typeof arduinoApi.onBurnBootloaderOutput>
    >,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BurnBootloaderDialog", () => {
  it("renders nothing when the dialog signal is false", () => {
    burnBootloaderDialogOpen.value = false;
    const { container } = render(<BurnBootloaderDialog />);
    expect(container.querySelector(".modal-panel")).not.toBeInTheDocument();
  });

  it("renders the title when open", () => {
    burnBootloaderDialogOpen.value = true;
    const { container } = render(<BurnBootloaderDialog />);
    expect(container.querySelector(".modal-title")?.textContent).toBe(
      "Burn Bootloader",
    );
  });

  it("shows the active board FQBN and selected port", () => {
    selectedFqbn.value = "arduino:avr:mega";
    connectedPort.value = "COM12";
    burnBootloaderDialogOpen.value = true;
    render(<BurnBootloaderDialog />);
    expect(screen.getByText("arduino:avr:mega")).toBeInTheDocument();
    expect(screen.getByText("COM12")).toBeInTheDocument();
  });

  it("shows a 'Not selected' placeholder when no port is connected", () => {
    connectedPort.value = null;
    burnBootloaderDialogOpen.value = true;
    render(<BurnBootloaderDialog />);
    expect(screen.getByText("Not selected")).toBeInTheDocument();
  });

  it("offers the static programmer list with the default pre-selected", () => {
    burnBootloaderDialogOpen.value = true;
    render(<BurnBootloaderDialog />);
    const select = screen.getByLabelText("Programmer") as HTMLSelectElement;
    expect(select.value).toBe(DEFAULT_PROGRAMMER);
    // every entry from the static list is in the dropdown
    for (const p of PROGRAMMERS) {
      const opt = select.querySelector(
        `option[value="${p.id}"]`,
      ) as HTMLOptionElement;
      expect(opt).not.toBeNull();
      expect(opt.textContent).toBe(p.label);
    }
  });

  it("updates the selected programmer when the user picks one", () => {
    burnBootloaderDialogOpen.value = true;
    render(<BurnBootloaderDialog />);
    const select = screen.getByLabelText("Programmer") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "usbasp" } });
    expect(select.value).toBe("usbasp");
  });

  it("closes the dialog on Cancel without invoking the backend", () => {
    burnBootloaderDialogOpen.value = true;
    render(<BurnBootloaderDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(burnBootloaderDialogOpen.value).toBe(false);
    expect(arduinoApi.burnBootloader).not.toHaveBeenCalled();
  });

  it("invokes the backend with the selected programmer on Confirm", async () => {
    selectedFqbn.value = "arduino:avr:uno";
    connectedPort.value = "COM7";
    burnBootloaderDialogOpen.value = true;
    render(<BurnBootloaderDialog />);

    const select = screen.getByLabelText("Programmer") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "usbasp" } });
    fireEvent.click(screen.getByRole("button", { name: "Burn Bootloader" }));

    await waitFor(() => {
      expect(arduinoApi.burnBootloader).toHaveBeenCalledWith(
        "arduino:avr:uno",
        "COM7",
        "usbasp",
        false,
      );
    });
  });

  it("opens the Output tab and clears prior output before burning", async () => {
    buildOutput.value = ["stale line"];
    bottomPanelOpen.value = false;
    bottomPanelTab.value = "serial";
    burnBootloaderDialogOpen.value = true;
    render(<BurnBootloaderDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Burn Bootloader" }));

    await waitFor(() => {
      expect(bottomPanelOpen.value).toBe(true);
      expect(bottomPanelTab.value).toBe("output");
    });
    // The button click clears output synchronously; assert it before the
    // backend promise resolves (the dialog also subscribes to streamed output
    // for the new run).
    expect(buildOutput.value).not.toContain("stale line");
  });

  it("shows a success toast and closes when the burn succeeds", async () => {
    burnBootloaderDialogOpen.value = true;
    render(<BurnBootloaderDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Burn Bootloader" }));

    await waitFor(() => {
      expect(toast.value?.kind).toBe("success");
      expect(burnBootloaderDialogOpen.value).toBe(false);
    });
    expect(buildPhase.value).toBe("success");
  });

  it("shows a warn toast and surfaces stderr when the burn fails", async () => {
    vi.spyOn(arduinoApi, "burnBootloader").mockResolvedValue({
      success: false,
      exit_code: 1,
      stderr: "avrdude: target unreachable",
    });
    burnBootloaderDialogOpen.value = true;
    render(<BurnBootloaderDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Burn Bootloader" }));

    await waitFor(() => {
      expect(toast.value?.kind).toBe("warn");
    });
    expect(buildPhase.value).toBe("error");
    expect(buildOutput.value.join("\n")).toContain(
      "avrdude: target unreachable",
    );
  });

  it("surfaces a thrown invoke error as a warn toast", async () => {
    vi.spyOn(arduinoApi, "burnBootloader").mockRejectedValue(
      new Error("boom"),
    );
    burnBootloaderDialogOpen.value = true;
    render(<BurnBootloaderDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Burn Bootloader" }));

    await waitFor(() => {
      expect(toast.value?.kind).toBe("warn");
    });
    expect(buildPhase.value).toBe("error");
  });

  it("passes null port when nothing is connected", async () => {
    connectedPort.value = null;
    burnBootloaderDialogOpen.value = true;
    render(<BurnBootloaderDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Burn Bootloader" }));

    await waitFor(() => {
      expect(arduinoApi.burnBootloader).toHaveBeenCalledWith(
        expect.any(String),
        null,
        expect.any(String),
        expect.any(Boolean),
      );
    });
  });
});
