// data.ts — content for the ForgeBoard mobile IDE.
// Arduino C++ (.ino) sketches, example library, serial log, boards, and a
// cheap line tokenizer for monochrome syntax highlighting.
//
// This is sample/demo content. When the real Android transport lands (LAN
// build server + USB-OTG / WiFi-OTA), these arrays get replaced by live data
// behind the same shapes.

export type TokenKind =
  | "plain"
  | "comment"
  | "pre"
  | "kw"
  | "fn"
  | "str"
  | "num"
  | "const"
  | "macro"
  | "ident"
  | "punct";

export interface Token {
  kind: TokenKind;
  text: string;
}

export interface CodeLine {
  n: number;
  /** rough role of the line — kept for parity with the design data */
  t: string;
  s: string;
}

export interface Sketch {
  id: string;
  name: string;
  board: string;
  edited: string;
  size: string;
  lines: number;
  /** the sketch's actual source — what the editor renders for THIS file */
  code: string;
  open?: boolean;
}

export interface Example {
  id: string;
  name: string;
  cat: string;
  desc: string;
  lines: number;
  size: string;
  board: string;
}

export interface SerialLine {
  t: string;
  tag: "BOOT" | "GPIO" | "USR" | "WIFI" | "TX";
  msg: string;
}

export interface Board {
  id: string;
  name: string;
  port: string;
  mcu: string;
  status: "connected" | "idle" | "offline";
}

// ── Starter sources — each sketch carries its own code (the editor renders THIS) ──
export const BLINK_CODE = `// blink.ino — status LED on GPIO16, ForgeBoard Sprint
// forged 2026-05-28

#include <Arduino.h>

#define LED_PIN   16
#define INTERVAL  500

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
  Serial.println("forge.boot");
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(INTERVAL);
  digitalWrite(LED_PIN, LOW);
  delay(INTERVAL);
}
`;

const DHT_CODE = `// dht_logger.ino — temp + humidity, ForgeBoard Sprint
#include <Arduino.h>
#include <DHT.h>

#define DHT_PIN  45
#define DHT_TYPE DHT11

DHT dht(DHT_PIN, DHT_TYPE);

void setup() {
  Serial.begin(115200);
  dht.begin();
}

void loop() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  Serial.print("temp ");
  Serial.print(t);
  Serial.print(" C  hum ");
  Serial.println(h);
  delay(1000);
}
`;

const BLE_CODE = `// ble_scan.ino — discover nearby BLE devices
#include <Arduino.h>
#include <NimBLEDevice.h>

NimBLEScan* scan;

void setup() {
  Serial.begin(115200);
  NimBLEDevice::init("");
  scan = NimBLEDevice::getScan();
  scan->setActiveScan(true);
}

void loop() {
  NimBLEScanResults r = scan->start(5);
  Serial.print("found ");
  Serial.println(r.getCount());
  scan->clearResults();
}
`;

const PIEZO_CODE = `// piezo_tones.ino — buzzer melody, ForgeBoard Sprint
#include <Arduino.h>

#define BUZZER 1
int notes[] = { 262, 294, 330, 349, 392 };

void setup() {
  pinMode(BUZZER, OUTPUT);
}

void loop() {
  for (int i = 0; i < 5; i++) {
    tone(BUZZER, notes[i], 200);
    delay(250);
  }
  noTone(BUZZER);
  delay(1000);
}
`;

const WIFI_CODE = `// wifi_post.ino — POST a reading over WiFi
#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>

const char* SSID = "forge-net";
const char* PASS = "********";

void setup() {
  Serial.begin(115200);
  WiFi.begin(SSID, PASS);
  while (WiFi.status() != WL_CONNECTED) delay(200);
  Serial.println("wifi up");
}

void loop() {
  HTTPClient http;
  http.begin("http://10.0.0.2/ingest");
  int code = http.POST("{\\"v\\":1}");
  Serial.println(code);
  http.end();
  delay(5000);
}
`;

const LDR_CODE = `// ldr_dawn.ino — wake the LED at dawn, ForgeBoard Sprint
#include <Arduino.h>

#define LDR 47
#define LED 16
#define DAWN 1800

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  int light = analogRead(LDR);
  digitalWrite(LED, light > DAWN ? HIGH : LOW);
  Serial.println(light);
  delay(500);
}
`;

const BLANK_CODE = `// {name}

void setup() {

}

void loop() {

}
`;

const SERIAL_CODE = `// {name} — serial at 115200

void setup() {
  Serial.begin(115200);
}

void loop() {
  Serial.println("hello");
  delay(1000);
}
`;

/** Source for a freshly created sketch from a template. */
export function starterCode(template: string, name: string): string {
  const base = template === "blink" ? BLINK_CODE : template === "serial" ? SERIAL_CODE : BLANK_CODE;
  return base.replace("{name}", name);
}

/** A reasonable starting source when opening a bundled example. */
export function exampleCode(name: string): string {
  return `// ${name}\n// ForgeBoard example — a starting point\n\nvoid setup() {\n\n}\n\nvoid loop() {\n\n}\n`;
}

/** Line count of a source buffer (used by the sketch card + editor footer). */
export function countLines(code: string): number {
  return code.replace(/\n+$/, "").split("\n").length;
}

/** Human byte size of a source buffer. */
export function byteSize(code: string): string {
  const b = new TextEncoder().encode(code).length;
  return b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;
}

// Token-based tokenization for syntax highlight — keeps the editor cheap.
export function tokenize(line: string): Token[] {
  const out: Token[] = [];
  const src = line;
  if (!src.trim()) return [{ kind: "plain", text: " " }];
  // whole-line comment
  if (/^\s*\/\//.test(src)) return [{ kind: "comment", text: src }];
  // preprocessor
  if (/^\s*#/.test(src)) return [{ kind: "pre", text: src }];
  // generic split — handles strings, char literals, hex/float/int, keywords, fns
  const re =
    /(\s+|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|0[xX][0-9A-Fa-f]+[uUlL]*|\d*\.\d+[fFlL]*|\b\d+[uUlLfF]*\b|\b(?:void|int|bool|char|float|double|long|short|unsigned|const|static|return|if|else|for|while|do|switch|case|break|continue|true|false|HIGH|LOW|OUTPUT|INPUT|INPUT_PULLUP)\b|\b(?:setup|loop|pinMode|digitalWrite|digitalRead|analogRead|analogWrite|delay|delayMicroseconds|tone|noTone|millis|Serial|begin|println|print|available|read|write|map|constrain)\b|[A-Z_][A-Z0-9_]+|[A-Za-z_][A-Za-z0-9_]*|[{}()[\];,.=<>+\-*/&|!?:]+|.)/g;
  const KW = /^(?:void|int|bool|char|float|double|long|short|unsigned|const|static|return|if|else|for|while|do|switch|case|break|continue|true|false)$/;
  const CONSTS = /^(?:HIGH|LOW|OUTPUT|INPUT|INPUT_PULLUP)$/;
  const FN = /^(?:setup|loop|pinMode|digitalWrite|digitalRead|analogRead|analogWrite|delay|delayMicroseconds|tone|noTone|millis|Serial|begin|println|print|available|read|write|map|constrain)$/;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const t = m[0];
    if (/^\s+$/.test(t)) out.push({ kind: "plain", text: t });
    else if (/^\/\//.test(t)) out.push({ kind: "comment", text: t });
    else if (/^["']/.test(t)) out.push({ kind: "str", text: t });
    else if (/^(?:0[xX][0-9A-Fa-f]|\d|\.\d)/.test(t)) out.push({ kind: "num", text: t });
    else if (KW.test(t)) out.push({ kind: "kw", text: t });
    else if (CONSTS.test(t)) out.push({ kind: "const", text: t });
    else if (FN.test(t)) out.push({ kind: "fn", text: t });
    else if (/^[A-Z_][A-Z0-9_]+$/.test(t)) out.push({ kind: "macro", text: t });
    else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) out.push({ kind: "ident", text: t });
    else out.push({ kind: "punct", text: t });
  }
  return out;
}

// The ForgeBoard family — both are ESP32-S3-WROOM-1.
//   Spark  (entry)        — 32 user GPIO, RGB LED + status LED, USB-C, no sensors/battery.
//   Sprint (intermediate) — 19 user GPIO + onboard sensors, 1S Li-Po + charging, USB-C auto-reset.
function mk(id: string, name: string, board: string, edited: string, code: string, open?: boolean): Sketch {
  return { id, name, board, edited, code, lines: countLines(code), size: byteSize(code), open };
}

export const SKETCHES: Sketch[] = [
  mk("blink", "blink.ino", "Sprint", "2m", BLINK_CODE, true),
  mk("dht", "dht_logger.ino", "Sprint", "1h", DHT_CODE),
  mk("ble", "ble_scan.ino", "Spark", "Yday", BLE_CODE),
  mk("piezo", "piezo_tones.ino", "Sprint", "3d", PIEZO_CODE),
  mk("wifi", "wifi_post.ino", "Spark", "6d", WIFI_CODE),
  mk("ldr", "ldr_dawn.ino", "Sprint", "2w", LDR_CODE),
];

export const SERIAL_LOG: SerialLine[] = [
  { t: "09:30:01.024", tag: "BOOT", msg: "esp32-s3 forgeboard.sprint · rev 1.0" },
  { t: "09:30:01.041", tag: "BOOT", msg: "wroom-1 · flash 8 MB · psram 2 MB · cpu 240 MHz" },
  { t: "09:30:01.118", tag: "USR", msg: "forge.boot" },
  { t: "09:30:01.620", tag: "GPIO", msg: "pin 16 → HIGH" },
  { t: "09:30:02.122", tag: "GPIO", msg: "pin 16 → LOW" },
  { t: "09:30:02.624", tag: "GPIO", msg: "pin 16 → HIGH" },
  { t: "09:30:03.126", tag: "GPIO", msg: "pin 16 → LOW" },
  { t: "09:30:03.628", tag: "GPIO", msg: "pin 16 → HIGH" },
  { t: "09:30:04.130", tag: "GPIO", msg: "pin 16 → LOW" },
  { t: "09:30:04.632", tag: "GPIO", msg: "pin 16 → HIGH" },
  { t: "09:30:05.134", tag: "GPIO", msg: "pin 16 → LOW" },
  { t: "09:30:05.402", tag: "WIFI", msg: "station start · scanning" },
  { t: "09:30:05.636", tag: "GPIO", msg: "pin 16 → HIGH" },
  { t: "09:30:05.788", tag: "WIFI", msg: "found 4 networks" },
  { t: "09:30:06.138", tag: "GPIO", msg: "pin 16 → LOW" },
];

export const BOARDS: Board[] = [
  { id: "fb-sprint", name: "ForgeBoard Sprint", port: "/dev/ttyACM0", mcu: "ESP32-S3", status: "connected" },
  { id: "fb-spark", name: "ForgeBoard Spark", port: "/dev/ttyACM1", mcu: "ESP32-S3", status: "idle" },
  { id: "esp", name: "ESP32-DevKitC", port: "—", mcu: "ESP32", status: "offline" },
];

// ── Board family metadata (real ForgeBoard datasheets, Rev 1.0) ──────────────
export interface BoardModel {
  id: "spark" | "sprint";
  name: string;
  tier: string;
  module: string;
  userGpio: number;
  flash: string;
  psram: string;
  cpu: string;
  usb: string;
  power: string;
  blurb: string;
}

export const BOARD_MODELS: Record<"Spark" | "Sprint", BoardModel> = {
  Spark: {
    id: "spark",
    name: "ForgeBoard Spark",
    tier: "Entry",
    module: "ESP32-S3-WROOM-1",
    userGpio: 32,
    flash: "8 MB",
    psram: "2 MB",
    cpu: "240 MHz",
    usb: "USB-C 2.0 · OTG 1.1",
    power: "USB-C 5 V",
    blurb: "32 free GPIO · RGB + status LED · no onboard sensors",
  },
  Sprint: {
    id: "sprint",
    name: "ForgeBoard Sprint",
    tier: "Intermediate",
    module: "ESP32-S3-WROOM-1",
    userGpio: 19,
    flash: "8 MB",
    psram: "2 MB",
    cpu: "240 MHz",
    usb: "USB-C 2.0 · OTG 1.1 · auto-reset",
    power: "USB-C 5 V · 1S Li-Po + charge",
    blurb: "19 free GPIO · onboard sensor suite · battery management",
  },
};

// ── Pin maps — feed a future live "Pinout / Probe" surface ───────────────────
export interface PinDef {
  gpio: number;
  label: string;
  /** peripheral / role — empty for plain user IO */
  role?: string;
  /** reserved | strapping | usb | flash | peripheral | power */
  flag?: "reserved" | "strapping" | "peripheral";
}

// ForgeBoard Sprint — 13 GPIO dedicated to onboard peripherals.
export const SPRINT_PERIPHERALS: PinDef[] = [
  { gpio: 16, label: "Status LED", role: "GPIO-controlled", flag: "peripheral" },
  { gpio: 3, label: "RGB LED", role: "WS2812 · RMT", flag: "peripheral" },
  { gpio: 1, label: "Buzzer", role: "Piezo · PWM", flag: "peripheral" },
  { gpio: 46, label: "IR proximity", role: "analog + digital", flag: "peripheral" },
  { gpio: 21, label: "LDR (digital)", role: "comparator", flag: "peripheral" },
  { gpio: 47, label: "LDR (analog)", role: "ambient light", flag: "peripheral" },
  { gpio: 45, label: "Temp / Humidity", role: "0–50 °C · 20–90 %RH", flag: "peripheral" },
];

// ForgeBoard Spark — only the two LEDs are onboard; everything else is free.
export const SPARK_PERIPHERALS: PinDef[] = [
  { gpio: 48, label: "RGB LED", role: "WS2812 · RMT", flag: "peripheral" },
];

// Strapping / reserved pins shared by both WROOM-1 boards.
export const RESERVED_PINS: PinDef[] = [
  { gpio: 0, label: "IO0", role: "strapping (boot mode)", flag: "strapping" },
  { gpio: 45, label: "IO45", role: "strapping", flag: "strapping" },
  { gpio: 46, label: "IO46", role: "strapping", flag: "strapping" },
  { gpio: 19, label: "IO19 (D−)", role: "USB data", flag: "reserved" },
  { gpio: 20, label: "IO20 (D+)", role: "USB data", flag: "reserved" },
];

export const PINMAP: Record<"Spark" | "Sprint", PinDef[]> = {
  Spark: SPARK_PERIPHERALS,
  Sprint: SPRINT_PERIPHERALS,
};

// ── Arduino library manager (mobile mock of the registry) ────────────────────
export interface Library {
  id: string;
  name: string;
  author: string;
  version: string;
  desc: string;
  installed: boolean;
  /** an upgrade is available for an installed library */
  update?: string;
}

export const LIBRARIES: Library[] = [
  // installed
  { id: "neopixel", name: "Adafruit NeoPixel", author: "Adafruit", version: "1.12.3", desc: "Drive WS2812 / RGB LEDs", installed: true },
  { id: "dht", name: "DHT sensor library", author: "Adafruit", version: "1.4.6", desc: "Temperature + humidity sensors", installed: true, update: "1.4.7" },
  { id: "json", name: "ArduinoJson", author: "Benoît Blanchon", version: "7.2.1", desc: "Parse & build JSON", installed: true },
  // available / popular
  { id: "fastled", name: "FastLED", author: "Daniel Garcia", version: "3.9.7", desc: "High-performance LED control", installed: false },
  { id: "pubsub", name: "PubSubClient", author: "Nick O'Leary", version: "2.8.0", desc: "MQTT publish / subscribe", installed: false },
  { id: "gfx", name: "Adafruit GFX Library", author: "Adafruit", version: "1.11.11", desc: "Graphics core for displays", installed: false },
  { id: "ir", name: "IRremote", author: "shirriff, z3t0", version: "4.4.1", desc: "Send & receive IR signals", installed: false },
  { id: "wifimgr", name: "WiFiManager", author: "tzapu", version: "2.0.17", desc: "On-device WiFi config portal", installed: false },
  { id: "ble", name: "NimBLE-Arduino", author: "h2zero", version: "1.4.3", desc: "Lightweight BLE stack for ESP32", installed: false },
];

// Bundled example sketches — Arduino-style starter library, grouped by category.
export const EXAMPLE_CATS = ["Basics", "Digital I/O", "Sensors", "Wireless", "Audio"];

export const EXAMPLES: Example[] = [
  { id: "ex-blink", name: "Blink.ino", cat: "Basics", desc: "Toggle the onboard LED", lines: 20, size: "0.4 KB", board: "Example" },
  { id: "ex-fade", name: "Fade.ino", cat: "Basics", desc: "Ramp brightness with PWM", lines: 28, size: "0.6 KB", board: "Example" },
  { id: "ex-hello", name: "SerialHello.ino", cat: "Basics", desc: "Print to the serial monitor", lines: 16, size: "0.3 KB", board: "Example" },
  { id: "ex-button", name: "Button.ino", cat: "Digital I/O", desc: "Read a momentary switch", lines: 24, size: "0.5 KB", board: "Example" },
  { id: "ex-debounce", name: "Debounce.ino", cat: "Digital I/O", desc: "Clean up a noisy input", lines: 46, size: "1.1 KB", board: "Example" },
  { id: "ex-dht", name: "DHT_Read.ino", cat: "Sensors", desc: "Temperature + humidity", lines: 52, size: "1.3 KB", board: "Example" },
  { id: "ex-ldr", name: "LDR_Analog.ino", cat: "Sensors", desc: "Light-dependent resistor", lines: 30, size: "0.7 KB", board: "Example" },
  { id: "ex-ble", name: "BLE_Scan.ino", cat: "Wireless", desc: "Discover nearby BLE devices", lines: 88, size: "2.4 KB", board: "Example" },
  { id: "ex-wifi", name: "WiFi_Scan.ino", cat: "Wireless", desc: "List access points", lines: 64, size: "1.8 KB", board: "Example" },
  { id: "ex-tone", name: "Tone_Melody.ino", cat: "Audio", desc: "Play notes on the buzzer", lines: 58, size: "1.5 KB", board: "Example" },
];
