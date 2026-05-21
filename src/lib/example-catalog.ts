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
];

/** The display label for the curated-examples group in the Examples view. */
export const STARTER_GROUP_LABEL = "Starter examples";
