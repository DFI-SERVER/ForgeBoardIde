import { describe, it, expect } from "vitest";
import { forgeBoardForFqbn, displayBoardName, FORGE_BOARDS } from "@/features/boards/forge-boards";

describe("Forge board identity", () => {
  it("maps each chip to exactly one Forge board", () => {
    expect(forgeBoardForFqbn("esp32:esp32:esp32s3")?.name).toBe("Spark");
    expect(forgeBoardForFqbn("esp32:esp32:esp32s3:CDCOnBoot=cdc")?.name).toBe("Spark");
    expect(forgeBoardForFqbn("esp8266:esp8266:nodemcuv2")?.name).toBe("Flint");
    expect(forgeBoardForFqbn("STMicroelectronics:stm32:GenG4")?.name).toBe("Indus");
    expect(forgeBoardForFqbn("esp32:esp32:esp32")).toBeNull();
    expect(forgeBoardForFqbn("arduino:avr:uno")).toBeNull();
    expect(forgeBoardForFqbn(null)).toBeNull();
  });

  it("falls back to the toolchain's name for other boards", () => {
    expect(displayBoardName("esp32:esp32:esp32s3", "ESP32-S3 Dev Module")).toBe("Spark");
    expect(displayBoardName("arduino:avr:uno", "Arduino Uno")).toBe("Arduino Uno");
    expect(displayBoardName("arduino:avr:uno", null)).toBe("Unknown board");
  });

  it("every board has a datasheet link and a pinout path", () => {
    for (const b of FORGE_BOARDS) {
      expect(b.datasheet).toMatch(/^https:\/\/forgeboard\.in\//);
      expect(b.pinout).toMatch(/^\/boards\/.+-pinout\.svg$/);
    }
  });
});
