import { signal, computed } from "@preact/signals";

export type RailIcon =
  | "home"
  | "files"
  | "examples"
  | "search"
  | "libraries"
  | "boards"
  | "walkthrough"
  | "settings";

export const activeRail = signal<RailIcon>("files");

export const connectedBoard = signal<string | null>("ForgeBoard Beginner");
export const connectedPort = signal<string | null>("COM3");

export const bottomPanelOpen = signal<boolean>(true);
export const bottomPanelTab = signal<"serial" | "output" | "plotter" | "problems">("serial");

export const problemsCount = computed(() => 0);

export const openTabs = signal<{ path: string; modified: boolean }[]>([
  { path: "led-chase.ino", modified: true },
  { path: "pins.h", modified: false },
  { path: "config.h", modified: false },
]);

export const activeTabIndex = signal<number>(0);

export const saveState = signal<"saved" | "saving" | "unsaved">("saved");

/** Per-file contents, keyed by path. Source of truth for editor. */
export const fileContents = signal<Map<string, string>>(
  new Map<string, string>([
    ["led-chase.ino", `// ForgeBoard — LED chase demo
#include <FastLED.h>

#define NUM_LEDS 16
#define DATA_PIN 5

CRGB leds[NUM_LEDS];

void setup() {
  FastLED.addLeds<WS2812B, DATA_PIN>(leds, NUM_LEDS);
  Serial.begin(115200);
}

void loop() {
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = CRGB::OrangeRed;
    FastLED.show();
    delay(50);
    leds[i] = CRGB::Black;
  }
}
`],
    ["pins.h", `#pragma once\n\n#define PIN_LED 2\n#define PIN_BUTTON 3\n`],
    ["config.h", `#pragma once\n\n#define NUM_LEDS 16\n#define BRIGHTNESS 200\n`],
  ])
);
