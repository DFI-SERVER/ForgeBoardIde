import { render, screen, fireEvent, waitFor } from "@testing-library/preact";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { BoardOptionsMenu } from "@/features/boards/components/BoardOptionsMenu";
import { selectedFqbn, activeProfile } from "@/features/boards/state";
import { boardOptions, boardOptionCatalog } from "@/features/boards/board-options";
import { arduinoApi } from "@/ipc/arduino";

const DETAILS = {
  fqbn: "esp32:esp32:esp32s3",
  name: "ESP32S3 Dev Module",
  programmers: [],
  options: [
    {
      option: "CDCOnBoot",
      label: "USB CDC On Boot",
      values: [
        { value: "default", label: "Disabled", selected: true },
        { value: "cdc", label: "Enabled", selected: false },
      ],
    },
    {
      option: "PartitionScheme",
      label: "Partition Scheme",
      values: [
        { value: "default", label: "Default 4MB", selected: true },
        { value: "huge_app", label: "Huge APP", selected: false },
      ],
    },
  ],
};

beforeEach(() => {
  selectedFqbn.value = "esp32:esp32:esp32s3";
  activeProfile.value = null;
  boardOptions.value = {};
  boardOptionCatalog.value = {};
  vi.spyOn(arduinoApi, "boardDetails").mockResolvedValue(DETAILS);
});

describe("BoardOptionsMenu", () => {
  it("loads the board's options and shows the S3 CDC rule as current", async () => {
    render(<BoardOptionsMenu />);
    await waitFor(() => expect(screen.getByLabelText("Board options")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Board options"));
    expect(screen.getByText("USB CDC On Boot")).toBeInTheDocument();
    const cdc = screen.getAllByRole("combobox")[0] as HTMLSelectElement;
    expect(cdc.value).toBe("cdc");
  });

  it("stores a non-default choice and shows the badge", async () => {
    render(<BoardOptionsMenu />);
    await waitFor(() => expect(screen.getByLabelText("Board options")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Board options"));
    const part = screen.getAllByRole("combobox")[1] as HTMLSelectElement;
    fireEvent.change(part, { target: { value: "huge_app" } });
    expect(boardOptions.value["esp32:esp32:esp32s3"]).toEqual({ PartitionScheme: "huge_app" });
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders nothing for a board without options", async () => {
    vi.spyOn(arduinoApi, "boardDetails").mockResolvedValue({ ...DETAILS, options: [] });
    const { container } = render(<BoardOptionsMenu />);
    await waitFor(() => expect(arduinoApi.boardDetails).toHaveBeenCalled());
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });
});
