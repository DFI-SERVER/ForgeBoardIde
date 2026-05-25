/**
 * Curated Arduino snippets — Monaco completion provider.
 *
 * Each snippet expands when the user types its prefix and triggers
 * completion (Ctrl+Space) or hits Tab on the matching suggestion.
 * Placeholders use Monaco's textmate-style syntax (`$1`, `${1:default}`)
 * so Tab cycles through fields and Esc commits the expansion.
 *
 * Snippets are registered against BOTH the `arduino` and `cpp` languages so
 * the curated pack reaches every kind of file the IDE opens: `.ino` / `.pde`
 * use the arduino language (registered in `monaco-setup.ts`); `.cpp`, `.c`,
 * `.h` and `.hpp` use Monaco's bundled `cpp` (assigned by
 * `MonacoEditor.getOrCreateModel`). Registering once per language is
 * idempotent — Monaco accumulates providers and the same pack appears in
 * both completion lists.
 */
import * as monaco from "monaco-editor";

export interface ArduinoSnippet {
  /** Trigger word the user types to summon the snippet. */
  prefix: string;
  /** One-line summary shown next to the prefix in the completion list. */
  description: string;
  /** Body lines; joined with `\n`. Monaco placeholder syntax allowed. */
  body: string[];
}

export const SNIPPETS: readonly ArduinoSnippet[] = [
  {
    prefix: "setup",
    description: "Empty setup() + loop() scaffold",
    body: [
      "void setup() {",
      "  ${1:// init}",
      "}",
      "",
      "void loop() {",
      "  ${2:// loop body}",
      "}",
    ],
  },
  {
    prefix: "serial_begin",
    description: "Serial.begin with a configurable baud rate",
    body: ["Serial.begin(${1:115200});"],
  },
  {
    prefix: "blink",
    description: "Non-blocking LED blink using millis()",
    body: [
      "const int ${1:LED_PIN} = ${2:LED_BUILTIN};",
      "const unsigned long ${3:BLINK_INTERVAL_MS} = ${4:500};",
      "unsigned long lastToggle = 0;",
      "bool ledState = false;",
      "",
      "void setup() {",
      "  pinMode($1, OUTPUT);",
      "}",
      "",
      "void loop() {",
      "  if (millis() - lastToggle >= $3) {",
      "    lastToggle = millis();",
      "    ledState = !ledState;",
      "    digitalWrite($1, ledState ? HIGH : LOW);",
      "  }",
      "}",
    ],
  },
  {
    prefix: "wifi_connect",
    description: "ESP32 WiFi.begin + wait-for-connected",
    body: [
      "#include <WiFi.h>",
      "",
      "const char* ssid = \"${1:YOUR_SSID}\";",
      "const char* password = \"${2:YOUR_PASSWORD}\";",
      "",
      "void connectWiFi() {",
      "  WiFi.mode(WIFI_STA);",
      "  WiFi.begin(ssid, password);",
      "  Serial.print(\"Connecting to \");",
      "  Serial.println(ssid);",
      "  while (WiFi.status() != WL_CONNECTED) {",
      "    delay(250);",
      "    Serial.print(\".\");",
      "  }",
      "  Serial.println();",
      "  Serial.print(\"Connected. IP: \");",
      "  Serial.println(WiFi.localIP());",
      "}",
    ],
  },
  {
    prefix: "i2c_scanner",
    description: "Scan the I²C bus and print every responding address",
    body: [
      "#include <Wire.h>",
      "",
      "void setup() {",
      "  Serial.begin(115200);",
      "  Wire.begin(${1:SDA_PIN}, ${2:SCL_PIN});",
      "  Serial.println(\"I2C scanner ready\");",
      "}",
      "",
      "void loop() {",
      "  byte count = 0;",
      "  for (byte addr = 1; addr < 127; addr++) {",
      "    Wire.beginTransmission(addr);",
      "    if (Wire.endTransmission() == 0) {",
      "      Serial.print(\"  found 0x\");",
      "      if (addr < 16) Serial.print('0');",
      "      Serial.println(addr, HEX);",
      "      count++;",
      "    }",
      "  }",
      "  Serial.print(count); Serial.println(\" device(s)\");",
      "  delay(5000);",
      "}",
    ],
  },
  {
    prefix: "pwm_fade",
    description: "ESP32 PWM fade loop using ledcWrite",
    body: [
      "const int ${1:PWM_PIN} = ${2:5};",
      "const int ${3:PWM_CHANNEL} = 0;",
      "const int ${4:PWM_FREQ_HZ} = 5000;",
      "const int ${5:PWM_RES_BITS} = 8;",
      "",
      "void setup() {",
      "  ledcSetup($3, $4, $5);",
      "  ledcAttachPin($1, $3);",
      "}",
      "",
      "void loop() {",
      "  for (int v = 0; v <= 255; v++) { ledcWrite($3, v); delay(8); }",
      "  for (int v = 255; v >= 0; v--) { ledcWrite($3, v); delay(8); }",
      "}",
    ],
  },
  {
    prefix: "interrupt",
    description: "attachInterrupt with IRAM_ATTR ISR template",
    body: [
      "const int ${1:BUTTON_PIN} = ${2:0};",
      "volatile bool ${3:buttonPressed} = false;",
      "",
      "void IRAM_ATTR ${4:onButton}() {",
      "  $3 = true;",
      "}",
      "",
      "void setup() {",
      "  Serial.begin(115200);",
      "  pinMode($1, INPUT_PULLUP);",
      "  attachInterrupt(digitalPinToInterrupt($1), $4, ${5:FALLING});",
      "}",
      "",
      "void loop() {",
      "  if ($3) {",
      "    $3 = false;",
      "    Serial.println(\"button!\");",
      "  }",
      "}",
    ],
  },
  {
    prefix: "millis_delay",
    description: "Non-blocking delay pattern using millis()",
    body: [
      "unsigned long ${1:lastRun} = 0;",
      "const unsigned long ${2:INTERVAL_MS} = ${3:1000};",
      "",
      "void loop() {",
      "  if (millis() - $1 >= $2) {",
      "    $1 = millis();",
      "    ${4:// run the periodic task here}",
      "  }",
      "}",
    ],
  },
  {
    prefix: "ble_peripheral",
    description: "Minimal ESP32 BLE peripheral that advertises a service",
    body: [
      "#include <BLEDevice.h>",
      "#include <BLEServer.h>",
      "#include <BLEUtils.h>",
      "",
      "#define SERVICE_UUID        \"${1:4fafc201-1fb5-459e-8fcc-c5c9c331914b}\"",
      "#define CHARACTERISTIC_UUID \"${2:beb5483e-36e1-4688-b7f5-ea07361b26a8}\"",
      "",
      "void setup() {",
      "  Serial.begin(115200);",
      "  BLEDevice::init(\"${3:ForgeBoard}\");",
      "  BLEServer* server = BLEDevice::createServer();",
      "  BLEService* service = server->createService(SERVICE_UUID);",
      "  service->createCharacteristic(",
      "    CHARACTERISTIC_UUID,",
      "    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY",
      "  );",
      "  service->start();",
      "  server->getAdvertising()->start();",
      "  Serial.println(\"BLE advertising\");",
      "}",
      "",
      "void loop() { delay(2000); }",
    ],
  },
  {
    prefix: "debug_print",
    description: "Serial debug print: label + value on one line",
    body: ["Serial.print(F(\"${1:var} = \")); Serial.println(${2:value});"],
  },
];

/** Register the snippet pack as a Monaco completion provider for both the
 *  `arduino` and `cpp` languages. Idempotent — calling twice is harmless
 *  because we use a module-scoped guard. Registering against `cpp` too
 *  catches `.cpp`, `.c`, `.h`, `.hpp` files (which `MonacoEditor` assigns
 *  the `cpp` language id by extension), so the curated pack appears in
 *  every source file the IDE opens, not just `.ino`. */
let registered = false;
export function registerArduinoSnippets(): void {
  if (registered) return;
  registered = true;

  const provider: monaco.languages.CompletionItemProvider = {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      return {
        suggestions: SNIPPETS.map((s) => ({
          label: s.prefix,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: s.body.join("\n"),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: s.description,
          detail: "Arduino snippet",
          range,
        })),
      };
    },
  };

  monaco.languages.registerCompletionItemProvider("arduino", provider);
  monaco.languages.registerCompletionItemProvider("cpp", provider);
}
