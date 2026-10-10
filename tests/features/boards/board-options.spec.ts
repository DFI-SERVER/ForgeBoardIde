import { describe, it, expect, beforeEach } from "vitest";
import {
  baseFqbn,
  parseFqbnOptions,
  composeFqbn,
  effectiveOptionValue,
  changedCount,
  setBoardOption,
  clearBoardOptions,
  loadBoardOptions,
  boardOptions,
} from "@/features/boards/board-options";
import type { BoardOption } from "@/ipc/arduino";

const CDC: BoardOption = {
  option: "CDCOnBoot",
  label: "USB CDC On Boot",
  values: [
    { value: "default", label: "Disabled", selected: true },
    { value: "cdc", label: "Enabled", selected: false },
  ],
};
const PART: BoardOption = {
  option: "PartitionScheme",
  label: "Partition Scheme",
  values: [
    { value: "default", label: "Default 4MB", selected: true },
    { value: "huge_app", label: "Huge APP", selected: false },
  ],
};

beforeEach(() => {
  boardOptions.value = {};
});

describe("FQBN composition", () => {
  it("strips and parses option suffixes", () => {
    expect(baseFqbn("esp32:esp32:esp32s3:CDCOnBoot=cdc")).toBe("esp32:esp32:esp32s3");
    expect(baseFqbn("arduino:avr:uno")).toBe("arduino:avr:uno");
    expect(parseFqbnOptions("esp32:esp32:esp32s3:CDCOnBoot=cdc,PartitionScheme=huge_app")).toEqual({
      CDCOnBoot: "cdc",
      PartitionScheme: "huge_app",
    });
    expect(parseFqbnOptions("arduino:avr:uno")).toEqual({});
  });

  it("composes sorted, stable option suffixes and drops empties", () => {
    expect(composeFqbn("esp32:esp32:esp32s3", { PartitionScheme: "huge_app", CDCOnBoot: "cdc", X: "" })).toBe(
      "esp32:esp32:esp32s3:CDCOnBoot=cdc,PartitionScheme=huge_app",
    );
    expect(composeFqbn("esp32:esp32:esp32s3", undefined)).toBe("esp32:esp32:esp32s3");
    expect(composeFqbn("esp32:esp32:esp32s3", {})).toBe("esp32:esp32:esp32s3");
  });
});

describe("effective option value", () => {
  it("prefers the user's choice", () => {
    expect(effectiveOptionValue("esp32:esp32:esp32s3", PART, { PartitionScheme: "huge_app" })).toBe("huge_app");
  });
  it("mirrors the backend's ESP32-S3 CDC rule when nothing is chosen", () => {
    expect(effectiveOptionValue("esp32:esp32:esp32s3", CDC, undefined)).toBe("cdc");
    expect(effectiveOptionValue("esp32:esp32:esp32", CDC, undefined)).toBe("default");
  });
  it("falls back to the platform default", () => {
    expect(effectiveOptionValue("esp32:esp32:esp32", PART, {})).toBe("default");
  });
});

describe("choices", () => {
  it("counts only non-default choices", () => {
    expect(changedCount([CDC, PART], { CDCOnBoot: "cdc", PartitionScheme: "default" })).toBe(1);
    expect(changedCount([CDC, PART], undefined)).toBe(0);
  });

  it("sets, replaces, clears per board", () => {
    setBoardOption("esp32:esp32:esp32s3", "CDCOnBoot", "cdc");
    setBoardOption("esp32:esp32:esp32s3", "PartitionScheme", "huge_app");
    expect(boardOptions.value).toEqual({ "esp32:esp32:esp32s3": { CDCOnBoot: "cdc", PartitionScheme: "huge_app" } });
    setBoardOption("esp32:esp32:esp32s3", "CDCOnBoot", "");
    expect(boardOptions.value["esp32:esp32:esp32s3"]).toEqual({ PartitionScheme: "huge_app" });
    clearBoardOptions("esp32:esp32:esp32s3");
    expect(boardOptions.value).toEqual({});
  });

  it("loads only well-formed stored data", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null };
    expect(loadBoardOptions(storage)).toEqual({});
    store.set("forgeboard.board-options", JSON.stringify({ "a:b:c": { X: "1" }, bad: { Y: 2 } }));
    expect(loadBoardOptions(storage)).toEqual({ "a:b:c": { X: "1" } });
    store.set("forgeboard.board-options", "{{{");
    expect(loadBoardOptions(storage)).toEqual({});
  });
});
