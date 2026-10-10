/**
 * The Forge Board family. Each board maps to exactly one chip, so the chip
 * the IDE already detects identifies the board: ESP32-S3 is a Spark,
 * ESP8266 is a Flint, STM32G484 is an Indus.
 *
 * `datasheet` and `pinout` are the board-context links the Flow State
 * requirement asks for. The pinout images live in `public/boards/`; until an
 * image is shipped the UI shows a placeholder.
 */
export interface ForgeBoard {
  id: "spark" | "flint" | "indus";
  name: string;
  chip: string;
  /** FQBN prefixes that mean this board. */
  fqbnPrefixes: string[];
  datasheet: string;
  /** Relative URL of the pin diagram image, served from `public/`. */
  pinout: string;
}

export const FORGE_BOARDS: ForgeBoard[] = [
  {
    id: "spark",
    name: "Spark",
    chip: "ESP32-S3",
    fqbnPrefixes: ["esp32:esp32:esp32s3"],
    datasheet: "https://forgeboard.in/spark",
    pinout: "/boards/spark-pinout.svg",
  },
  {
    id: "flint",
    name: "Flint",
    chip: "ESP8266",
    fqbnPrefixes: ["esp8266:esp8266:"],
    datasheet: "https://forgeboard.in/flint",
    pinout: "/boards/flint-pinout.svg",
  },
  {
    id: "indus",
    name: "Indus",
    chip: "STM32G484",
    fqbnPrefixes: ["STMicroelectronics:stm32:"],
    datasheet: "https://forgeboard.in/indus",
    pinout: "/boards/indus-pinout.svg",
  },
];

/** The Forge board a FQBN belongs to, or null for any other board. */
export function forgeBoardForFqbn(fqbn: string | null | undefined): ForgeBoard | null {
  if (!fqbn) return null;
  return FORGE_BOARDS.find((b) => b.fqbnPrefixes.some((p) => fqbn.startsWith(p))) ?? null;
}

/** "Spark" for a Forge board, else the name the toolchain gave. */
export function displayBoardName(fqbn: string | null | undefined, fallback: string | null): string {
  return forgeBoardForFqbn(fqbn)?.name ?? fallback ?? "Unknown board";
}
