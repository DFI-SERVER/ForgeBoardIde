/**
 * Humanised build errors — turns cryptic gcc / arduino-cli diagnostics into
 * plain-English explanations beginners can act on.
 *
 * Raw compiler messages assume you already know C++. A first-time Arduino user
 * sees `'X' was not declared in this scope` and has no idea that means a typo.
 * This module maps the common cases onto a short, friendly explanation plus a
 * concrete suggested fix.
 *
 * It is a pure, UI-free module — a list of pattern rules, each matching a
 * diagnostic's `message` by regex. The Problems panel feeds every diagnostic
 * through `humanizeDiagnostic` and, when a rule matches, shows the hint inline
 * beneath the raw error. The raw error always stays visible too.
 *
 * Like `diagnostics.ts`, this is free of signals, Tauri and Monaco so it can be
 * unit-tested in isolation.
 */

import type { Diagnostic } from "./diagnostics";

/** A plain-English explanation of an error plus a concrete suggested fix. */
export interface HumanizedHint {
  /** What the error actually means, in beginner-friendly terms. */
  explanation: string;
  /** A concrete next step to resolve it. */
  fix: string;
}

/**
 * One humanisation rule. `test` matches a diagnostic's message; `build`
 * produces the hint. `build` receives the regex match so a rule can quote the
 * offending name (e.g. the missing header, the undeclared identifier).
 */
interface HumanizeRule {
  /** Short identifier — handy for tests and debugging. */
  id: string;
  /** Matches against the diagnostic's `message`. */
  test: RegExp;
  /** Turn a successful match into a hint. */
  build: (match: RegExpMatchArray, diagnostic: Diagnostic) => HumanizedHint;
}

/**
 * The rule set, in priority order. The first rule whose `test` matches wins,
 * so more specific patterns are listed before broader ones.
 *
 * Covers the errors a beginner hits most: a forgotten semicolon, a typo'd
 * name, an unknown type, unbalanced braces, a missing library header, a
 * redefinition, a wrong struct/object member, and the upload failures that
 * come from a flaky cable or an ESP32 that is not in download mode.
 */
const RULES: HumanizeRule[] = [
  /* ---------------------------------------------------------- syntax --- */

  {
    // gcc: `expected ';' before '}' token`, `expected ';' before 'return'`
    id: "missing-semicolon",
    test: /expected ['"]?;['"]? before/i,
    build: () => ({
      explanation:
        "Every C++ statement ends with a semicolon, and the compiler reached " +
        "the end of one without finding it.",
      fix:
        "Add a ; to the end of the line above where this error points — the " +
        "problem is usually on the previous line.",
    }),
  },
  {
    // gcc: `expected '}' at end of input`, `expected '}' before …`
    id: "expected-closing-brace",
    test: /expected ['"]?\}['"]?/i,
    build: () => ({
      explanation:
        "A block was opened with { but never closed — the braces don't " +
        "balance.",
      fix:
        "Add the missing closing } . Check that every { in setup(), loop() " +
        "and your functions has a matching } .",
    }),
  },
  {
    // gcc: `expected '{' before …`, `expected primary-expression …`
    id: "expected-opening-brace",
    test: /expected ['"]?\{['"]?/i,
    build: () => ({
      explanation:
        "The compiler expected a { to start a block of code here but found " +
        "something else.",
      fix:
        "Add a { after the function header or control statement (if, for, " +
        "while), and make sure it has a matching } .",
    }),
  },

  /* ----------------------------------------------------- missing header --- */

  {
    // gcc fatal error: `WiFi.h: No such file or directory`
    id: "missing-header",
    test: /([\w./+-]+\.h)\s*:\s*No such file or directory/i,
    build: (m) => ({
      explanation:
        `The compiler can't find "${m[1]}". This header belongs to a ` +
        "library that isn't installed yet.",
      fix:
        `Open the Library Manager and install the library that provides ` +
        `"${m[1]}". If it's already installed, check the #include spelling.`,
    }),
  },

  /* ------------------------------------------------------ names & types --- */

  {
    // gcc: `'digtalWrite' was not declared in this scope`
    id: "not-declared",
    test: /['"]([^'"]+)['"] was not declared in this scope/i,
    build: (m) => ({
      explanation:
        `The name "${m[1]}" hasn't been defined before it's used here. ` +
        "This is almost always a typo, or a variable used outside the {} " +
        "block it was declared in.",
      fix:
        `Check the spelling and capitalisation of "${m[1]}" — Arduino names ` +
        "are case-sensitive (digitalWrite, not digtalWrite). If it's your " +
        "own variable, declare it before this line.",
    }),
  },
  {
    // gcc: `'Srvo' does not name a type`
    id: "does-not-name-a-type",
    test: /['"]([^'"]+)['"] does not name a type/i,
    build: (m) => ({
      explanation:
        `"${m[1]}" was used as a type, but the compiler doesn't know it. ` +
        "The type's name may be misspelled, or the library that defines it " +
        "hasn't been included.",
      fix:
        `Check the spelling of "${m[1]}", and add the #include for the ` +
        "library that provides it at the top of your sketch.",
    }),
  },
  {
    // gcc: `'class Servo' has no member named 'wrte'`
    id: "no-member-named",
    test: /['"]?([^'"]+)['"]? has no member named ['"]([^'"]+)['"]/i,
    build: (m) => ({
      explanation:
        `"${m[2]}" isn't a function or property of ${m[1]}. The member ` +
        "name is probably misspelled, or it belongs to a different object.",
      fix:
        `Check the spelling of "${m[2]}" and the library's documentation ` +
        "for the correct member names — they are case-sensitive.",
    }),
  },

  /* ------------------------------------------------------- redefinition --- */

  {
    // gcc: `redefinition of 'int x'`, `'x' redeclared as different kind`
    id: "redefinition",
    test: /redefinition of|redeclared as|redeclaration of/i,
    build: () => ({
      explanation:
        "The same name is defined more than once. C++ only allows a name to " +
        "be defined a single time.",
      fix:
        "Remove the duplicate declaration, or rename one of them so each " +
        "name is unique. Watch for a variable declared both globally and " +
        "again inside a function.",
    }),
  },

  /* --------------------------------------------------- upload failures --- */

  {
    // arduino-cli / esptool: `Failed to connect to ESP32`
    id: "esp32-connect-failed",
    test: /Failed to connect to ESP(?:32|8266|-?[A-Z0-9]+)?|Wrong boot mode detected|No serial data received/i,
    build: () => ({
      explanation:
        "The board was found but didn't answer when the IDE tried to flash " +
        "it. ESP32 boards have to be in download mode to accept new code.",
      fix:
        "Hold the BOOT button on the board, press and release EN/RST, then " +
        "release BOOT — and click Upload again. A short or data-capable USB " +
        "cable helps.",
    }),
  },
  {
    // arduino-cli: `could not open port 'COM5'`, `Error opening serial port`
    id: "could-not-open-port",
    test: /could not open port|error opening serial port|access is denied|resource busy/i,
    build: () => ({
      explanation:
        "The IDE couldn't open the board's serial port. Usually another " +
        "program is already using it, or the board just disconnected.",
      fix:
        "Close the Serial Monitor and any other IDE or terminal using the " +
        "port, then try again. Unplugging and replugging the board also " +
        "frees a stuck port.",
    }),
  },
  {
    // arduino-cli: `no upload port provided`, `port not found`, `no device`
    id: "port-not-found",
    test: /no (?:upload )?port (?:provided|found)|port .* not found|no such (?:file or )?device|no device found on/i,
    build: () => ({
      explanation:
        "No board was found to upload to — the IDE has no serial port to " +
        "send the program over.",
      fix:
        "Plug the board in over USB and wait a moment for it to be detected, " +
        "then pick it in the board selector. If nothing appears, try another " +
        "USB cable — some are charge-only and carry no data.",
    }),
  },
];

/**
 * Return a plain-English hint for a diagnostic, or `null` when no rule
 * recognises it.
 *
 * Rules are tried in order; the first match wins. An unrecognised message
 * yields `null` so the caller can simply show the raw error on its own.
 */
export function humanizeDiagnostic(
  diagnostic: Diagnostic,
): HumanizedHint | null {
  const message = diagnostic.message;
  for (const rule of RULES) {
    const match = message.match(rule.test);
    if (match) return rule.build(match, diagnostic);
  }
  return null;
}
