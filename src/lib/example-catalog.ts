/**
 * The curated starter examples — a small set of beginner ESP32-S3 sketches
 * bundled with the IDE as structured data so they are always available, even
 * on a fresh install with no libraries installed.
 *
 * Each example carries its full `.ino` source. Opening one copies the source
 * into a brand-new sketch in the sketchbook (see `openExample` in actions.ts);
 * the catalog entries themselves are immutable templates.
 *
 * All sketches target the ESP32-S3 and use `LED_BUILTIN` for the on-board LED
 * so they run unmodified on any ESP32-S3 dev board the IDE supports.
 */

/** One curated example sketch. */
export interface CuratedExample {
  /** Display name — also the basis for the new sketch's folder name. */
  name: string;
  /** One-line description shown under the name in the Examples list. */
  description: string;
  /** Grouping label (purely for display ordering within the starter set). */
  category: string;
  /** The complete, ready-to-compile `.ino` source. */
  source: string;
}

/* --------------------------------------------------------------- Blink --- */

const BLINK = `/*
 * Blink — the "hello world" of microcontrollers.
 *
 * Turns the on-board LED on for one second, then off for one second,
 * over and over. If this runs, your toolchain and board are working.
 *
 * Board: ESP32-S3 Dev Module
 */

void setup() {
  // Configure the built-in LED pin as an output so we can drive it.
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);  // LED on
  delay(1000);                      // wait 1000 ms (1 second)
  digitalWrite(LED_BUILTIN, LOW);   // LED off
  delay(1000);                      // wait another second
}
`;

/* -------------------------------------------------------------- Button --- */

const BUTTON = `/*
 * Button — read a digital input.
 *
 * Wire a push-button between GPIO 4 and GND. With INPUT_PULLUP the pin
 * idles HIGH and reads LOW only while the button is held down, so no
 * external resistor is needed. The on-board LED mirrors the button.
 *
 * Board: ESP32-S3 Dev Module
 */

const int BUTTON_PIN = 4;  // push-button to GND

void setup() {
  // INPUT_PULLUP enables the internal pull-up resistor: the pin reads
  // HIGH when the button is open, LOW when it is pressed.
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  // Pressed == LOW because the button pulls the pin down to GND.
  bool pressed = digitalRead(BUTTON_PIN) == LOW;
  digitalWrite(LED_BUILTIN, pressed ? HIGH : LOW);
}
`;

/* --------------------------------------------------------- Analog read --- */

const ANALOG_READ = `/*
 * Analog Read — measure a varying voltage.
 *
 * Reads an analog voltage on GPIO 1 and prints it to the Serial Monitor.
 * Connect the wiper of a 10k potentiometer to GPIO 1, and its outer
 * legs to 3V3 and GND. The ESP32-S3 ADC is 12-bit, so values run 0-4095.
 *
 * Board: ESP32-S3 Dev Module
 */

const int SENSOR_PIN = 1;  // ADC1 channel — potentiometer wiper

void setup() {
  Serial.begin(115200);
}

void loop() {
  int raw = analogRead(SENSOR_PIN);          // 0-4095 (12-bit ADC)
  float volts = raw * (3.3f / 4095.0f);      // convert to volts

  Serial.print("raw: ");
  Serial.print(raw);
  Serial.print("  voltage: ");
  Serial.print(volts, 2);                    // 2 decimal places
  Serial.println(" V");

  delay(200);  // 5 readings per second
}
`;

/* ---------------------------------------------------------------- Fade --- */

const FADE = `/*
 * Fade — smoothly dim the LED with PWM.
 *
 * The ESP32 has an LED-control (LEDC) peripheral for hardware PWM.
 * analogWrite() in the ESP32 core sets this up for you: a duty cycle of
 * 0 is fully off and 255 is fully on. This sketch ramps the duty up and
 * down so the on-board LED breathes.
 *
 * Board: ESP32-S3 Dev Module
 */

int brightness = 0;  // current LED duty cycle (0-255)
int step = 5;        // amount to change brightness each frame

void setup() {
  // analogWrite() on the ESP32 core attaches an LEDC PWM channel to the
  // pin automatically — no manual ledcSetup()/ledcAttach() needed.
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  analogWrite(LED_BUILTIN, brightness);

  // Advance the brightness, and reverse direction at either end.
  brightness += step;
  if (brightness <= 0 || brightness >= 255) {
    step = -step;
  }

  delay(20);  // ~50 frames per second — a smooth fade
}
`;

/* -------------------------------------------------------- Serial print --- */

const SERIAL_PRINT = `/*
 * Serial Print — send text to your computer.
 *
 * Opens the USB serial link and prints a counter once a second. Open the
 * Serial Monitor (set it to 115200 baud) to watch the numbers climb.
 * Serial output is the simplest way to see what your program is doing.
 *
 * Board: ESP32-S3 Dev Module
 */

unsigned long count = 0;

void setup() {
  Serial.begin(115200);   // 115200 baud — match this in the Serial Monitor
  Serial.println("ESP32-S3 is up. Counting...");
}

void loop() {
  count++;

  Serial.print("tick #");
  Serial.print(count);
  Serial.print("  uptime: ");
  Serial.print(millis() / 1000);   // seconds since boot
  Serial.println(" s");

  delay(1000);
}
`;

/* --------------------------------------------------------- Serial echo --- */

const SERIAL_ECHO = `/*
 * Serial Echo — read input and send it back.
 *
 * Reads whole lines you type into the Serial Monitor and echoes them.
 * Shows the receive side of serial: checking Serial.available() and
 * reading characters until a newline arrives. Type something, press
 * Enter, and watch it come back.
 *
 * Board: ESP32-S3 Dev Module
 */

String line = "";  // accumulates characters until a full line arrives

void setup() {
  Serial.begin(115200);
  Serial.println("Type a line and press Enter — I'll echo it back.");
}

void loop() {
  // Process every byte that has arrived since the last loop pass.
  while (Serial.available() > 0) {
    char c = Serial.read();

    if (c == '\\n') {
      // End of a line — echo it, then reset the buffer.
      Serial.print("you said: ");
      Serial.println(line);
      line = "";
    } else if (c != '\\r') {
      // Ignore carriage returns; collect everything else.
      line += c;
    }
  }
}
`;

/* ----------------------------------------------------------- WiFi scan --- */

const WIFI_SCAN = `/*
 * WiFi Scan — list nearby networks.
 *
 * Scans for Wi-Fi access points and prints each network's name (SSID),
 * signal strength (RSSI, in dBm — closer to 0 is stronger) and whether
 * it is encrypted. <WiFi.h> is part of the ESP32 core, so nothing extra
 * needs to be installed.
 *
 * Board: ESP32-S3 Dev Module
 */

#include <WiFi.h>

void setup() {
  Serial.begin(115200);

  // Station mode (a client of access points), and make sure we are not
  // associated with any network before scanning.
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);

  Serial.println("WiFi scan starting...");
}

void loop() {
  int found = WiFi.scanNetworks();  // blocks until the scan completes

  if (found == 0) {
    Serial.println("No networks found.");
  } else {
    Serial.print(found);
    Serial.println(" networks found:");

    for (int i = 0; i < found; i++) {
      Serial.print("  ");
      Serial.print(i + 1);
      Serial.print(": ");
      Serial.print(WiFi.SSID(i));            // network name
      Serial.print("  (");
      Serial.print(WiFi.RSSI(i));            // signal strength, dBm
      Serial.print(" dBm) ");
      // OPEN networks need no password; anything else is encrypted.
      bool open = WiFi.encryptionType(i) == WIFI_AUTH_OPEN;
      Serial.println(open ? "[open]" : "[encrypted]");
    }
  }

  // Free the memory the scan results used, then wait before scanning again.
  WiFi.scanDelete();
  Serial.println();
  delay(5000);
}
`;

/* --------------------------------------------------- Peripheral test --- */

const PERIPHERAL_TEST = `/*
 * ============================================================
 *  FORGE BOARDS - ESP32-S3 PERIPHERAL TEST (SAMPLE CODE)
 * ============================================================
 *  This is a SAMPLE test sketch made by Forge Boards.
 *  It checks each onboard peripheral one by one and prints
 *  the result to the Serial Monitor (115200 baud).
 *
 *  Peripherals tested:
 *    - LED      on GPIO16  (simple on/off LED)
 *    - RGB      on GPIO3   (WS2812B addressable LED)
 *    - DHT11    on GPIO45  (temperature + humidity)
 *    - LDR      on GPIO21  (light sensor, digital out)
 *    - BUZZER   on GPIO48  (beeper)
 *    - IR       on GPIO46  (LM393 obstacle sensor, digital out)
 *
 *  Board   : ESP32-S3 (Forge Boards)
 *  Author  : Forge Boards
 *  Note    : Sample / demo code for hardware bring-up testing.
 * ============================================================
 */

#define LED_PIN     16
#define RGB_PIN     3
#define DHT_PIN     45
#define LDR_PIN     21
#define BUZZER_PIN  48
#define IR_PIN      46

// ---------- minimal dependency-free DHT11 reader ----------
// Returns true on success, fills temperature (C) and humidity (%).
bool readDHT11(uint8_t pin, float &temperature, float &humidity) {
  uint8_t data[5] = {0, 0, 0, 0, 0};

  // start signal: pull low >18ms, then release
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
  delay(20);
  digitalWrite(pin, HIGH);
  delayMicroseconds(40);
  pinMode(pin, INPUT_PULLUP);

  // wait for DHT response (low ~80us, high ~80us)
  unsigned long t = micros();
  while (digitalRead(pin) == HIGH) if (micros() - t > 100) return false;
  t = micros();
  while (digitalRead(pin) == LOW)  if (micros() - t > 100) return false;
  t = micros();
  while (digitalRead(pin) == HIGH) if (micros() - t > 100) return false;

  // read 40 bits
  for (int i = 0; i < 40; i++) {
    t = micros();
    while (digitalRead(pin) == LOW)  if (micros() - t > 100) return false; // 50us low
    t = micros();
    while (digitalRead(pin) == HIGH) if (micros() - t > 100) break;        // 26us=0 / 70us=1
    if (micros() - t > 45) data[i / 8] |= (1 << (7 - (i % 8)));
  }

  // checksum
  if (data[4] != ((data[0] + data[1] + data[2] + data[3]) & 0xFF)) return false;

  humidity    = data[0] + data[1] * 0.1f;
  temperature = data[2] + data[3] * 0.1f;
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(800);

  pinMode(LED_PIN, OUTPUT);
  pinMode(LDR_PIN, INPUT);
  pinMode(IR_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  Serial.println("===========================================");
  Serial.println(" FORGE BOARDS - ESP32-S3 PERIPHERAL TEST");
  Serial.println(" Sample code by Forge Boards");
  Serial.println("===========================================");
}

void loop() {
  // ---------- TEST 1: LED on GPIO16 ----------
  Serial.println("\\n[1] LED test (GPIO16) - blinking 3 times");
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, HIGH);
    Serial.println("    LED ON");
    delay(300);
    digitalWrite(LED_PIN, LOW);
    Serial.println("    LED OFF");
    delay(300);
  }

  // ---------- TEST 2: RGB (WS2812B) on GPIO3 ----------
  Serial.println("[2] RGB test (GPIO3) - Red, Green, Blue");
  neopixelWrite(RGB_PIN, 64, 0, 0);  Serial.println("    RED");   delay(500);
  neopixelWrite(RGB_PIN, 0, 64, 0);  Serial.println("    GREEN"); delay(500);
  neopixelWrite(RGB_PIN, 0, 0, 64);  Serial.println("    BLUE");  delay(500);
  neopixelWrite(RGB_PIN, 0, 0, 0);   Serial.println("    OFF");   delay(300);

  // ---------- TEST 3: DHT11 on GPIO45 ----------
  Serial.println("[3] DHT11 test (GPIO45)");
  float tC, rh;
  if (readDHT11(DHT_PIN, tC, rh)) {
    Serial.printf("    OK  -> Temp: %.1f C   Humidity: %.1f %%\\n", tC, rh);
  } else {
    Serial.println("    FAIL -> no valid data (check wiring / DHT11)");
  }

  // ---------- TEST 4: LDR on GPIO21 ----------
  Serial.println("[4] LDR test (GPIO21) - digital light state");
  int ldr = digitalRead(LDR_PIN);
  Serial.printf("    LDR raw = %d  -> %s\\n", ldr, (ldr == LOW) ? "DARK" : "LIGHT");

  // ---------- TEST 5: BUZZER on GPIO48 ----------
  Serial.println("[5] Buzzer test (GPIO48) - 2 beeps");
  for (int i = 0; i < 2; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    Serial.println("    BEEP");
    delay(200);
    digitalWrite(BUZZER_PIN, LOW);
    delay(200);
  }

  // ---------- TEST 6: IR sensor on GPIO46 ----------
  Serial.println("[6] IR test (GPIO46) - obstacle detection");
  int ir = digitalRead(IR_PIN);
  Serial.printf("    IR raw = %d  -> %s\\n", ir, (ir == LOW) ? "OBJECT DETECTED" : "clear");

  Serial.println("--- cycle complete, repeating in 3s ---");
  delay(3000);
}
`;

/**
 * The bundled starter examples, in the order they appear in the Examples view.
 */
export const CURATED_EXAMPLES: readonly CuratedExample[] = [
  {
    name: "Blink",
    description: "Flash the on-board LED on and off — the classic first sketch.",
    category: "Basics",
    source: BLINK,
  },
  {
    name: "Button",
    description: "Read a push-button with digitalRead and an internal pull-up.",
    category: "Digital I/O",
    source: BUTTON,
  },
  {
    name: "Analog Read",
    description: "Measure a voltage on an ADC pin and print it over serial.",
    category: "Analog I/O",
    source: ANALOG_READ,
  },
  {
    name: "Fade",
    description: "Breathe the LED smoothly using hardware PWM (analogWrite).",
    category: "Analog I/O",
    source: FADE,
  },
  {
    name: "Serial Print",
    description: "Send a counter to the Serial Monitor once a second.",
    category: "Communication",
    source: SERIAL_PRINT,
  },
  {
    name: "Serial Echo",
    description: "Read lines from the Serial Monitor and echo them back.",
    category: "Communication",
    source: SERIAL_ECHO,
  },
  {
    name: "WiFi Scan",
    description: "List nearby Wi-Fi networks with signal strength.",
    category: "WiFi",
    source: WIFI_SCAN,
  },
  {
    name: "Peripheral Test",
    description: "ForgeBoard bring-up sweep: LED, RGB, DHT11, LDR, buzzer, IR.",
    category: "ForgeBoard",
    source: PERIPHERAL_TEST,
  },
];

/** The display label for the curated-examples group in the Examples view. */
export const STARTER_GROUP_LABEL = "Starter examples";
