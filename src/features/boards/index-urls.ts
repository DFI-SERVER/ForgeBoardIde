/**
 * Board-manager index URLs: the curated vendor list ForgeBoard ships, plus
 * whatever the user added in Settings. Every core command (search, list,
 * install, update-index) gets the merged list as `--additional-urls`, so a
 * vendor core resolves whether it came from the Popular list or a search.
 */
import { settings } from "@/features/settings/settings";

export interface CuratedCore {
  id: string;
  name: string;
  platform: string;
  /** Vendor package index — REQUIRED outside Arduino's default index. */
  url?: string;
}

/** Cores offered for one-click install. `arduino:avr` ships in the default
 *  index, so it carries no URL. */
export const CURATED_CATALOG: CuratedCore[] = [
  {
    id: "esp32:esp32",
    name: "ESP32 (incl. ForgeBoard, S3, WROOM)",
    platform: "Espressif",
    url: "https://espressif.github.io/arduino-esp32/package_esp32_index.json",
  },
  {
    id: "esp8266:esp8266",
    name: "ESP8266 (NodeMCU, Wemos D1)",
    platform: "Espressif",
    url: "https://arduino.esp8266.com/stable/package_esp8266com_index.json",
  },
  { id: "arduino:avr", name: "Arduino AVR (Uno, Nano, Mega)", platform: "Arduino" },
  {
    id: "rp2040:rp2040",
    name: "Raspberry Pi Pico (RP2040)",
    platform: "earlephilhower",
    url: "https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json",
  },
  {
    id: "STMicroelectronics:stm32",
    name: "STM32 (Nucleo, Black Pill)",
    platform: "STMicroelectronics",
    url: "https://github.com/stm32duino/BoardManagerFiles/raw/main/package_stmicroelectronics_index.json",
  },
  {
    id: "teensy:avr",
    name: "Teensy 2.0 / 3.x / 4.x / LC",
    platform: "PJRC",
    url: "https://www.pjrc.com/teensy/package_teensy_index.json",
  },
  {
    id: "Seeeduino:xiao_samd",
    name: "Seeed XIAO SAMD21 / M0",
    platform: "Seeed",
    url: "https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json",
  },
];

/** Curated URLs followed by the user's, de-duplicated, order preserved. */
export function mergeIndexUrls(curated: CuratedCore[], user: string[]): string[] {
  const out: string[] = [];
  for (const u of [...curated.map((c) => c.url ?? ""), ...user]) {
    const t = u.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** The merged list to pass to arduino-cli right now. */
export function boardIndexUrls(): string[] {
  return mergeIndexUrls(CURATED_CATALOG, settings.value.additionalBoardUrls);
}
