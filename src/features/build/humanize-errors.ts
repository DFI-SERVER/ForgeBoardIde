/**
 * Humanised build errors — turns cryptic gcc / arduino-cli / esptool output
 * into plain-English explanations beginners can act on.
 *
 * Every failure follows one flow (Check → Debug → Solution): the IDE says
 * what kind of problem it is — in the **code**, in the **connection** to the
 * board, or in the **system** setup — explains it in one or two sentences,
 * and lists numbered steps to fix it, worded for the student's own OS.
 *
 * It is a pure, UI-free module — a list of pattern rules, each matching a
 * diagnostic's `message` by regex. The Problems panel feeds every diagnostic
 * through `humanizeDiagnostic` and, when a rule matches, shows the hint inline
 * beneath the raw error. The raw error always stays visible too.
 */

import type { Diagnostic } from "./diagnostics";

/** Where the problem is. Drives the badge in the Problems panel. */
export type ProblemKind = "code" | "connection" | "system";

/** The OS the steps are written for. */
export type HintOs = "mac" | "windows" | "linux";

/** A plain-English explanation of an error plus a concrete suggested fix. */
export interface HumanizedHint {
  /** Code, connection or system — the first thing a student needs to know. */
  kind: ProblemKind;
  /** What the error actually means, in beginner-friendly terms. */
  explanation: string;
  /** A concrete next step to resolve it (one line). */
  fix: string;
  /** Numbered steps, in order, for this OS. Optional for one-step fixes. */
  steps?: string[];
  /** Optional one-click follow-up the UI can offer. */
  action?: HintAction;
}

/** A follow-up action a hint can offer the user. */
export type HintAction =
  | { kind: "search-library"; query: string; label: string }
  | { kind: "open-setup-check"; label: string }
  | { kind: "open-boards"; label: string };

interface HumanizeRule {
  id: string;
  test: RegExp;
  build: (match: RegExpMatchArray, diagnostic: Diagnostic, os: HintOs) => HumanizedHint;
}

/** What the OS calls its serial port and how to find it. */
function portWord(os: HintOs): string {
  return os === "windows" ? "COM port" : "serial port";
}

const RULES: HumanizeRule[] = [
  /* ---------------------------------------------------------- syntax --- */
  {
    id: "missing-semicolon",
    test: /expected ['"]?;['"]? before/i,
    build: () => ({
      kind: "code",
      explanation:
        "Every C++ statement ends with a semicolon, and the compiler reached the end of one without finding it.",
      fix: "Add a ; to the end of the line above where this error points — the problem is usually on the previous line.",
      steps: [
        "Click this problem to jump to the line.",
        "Look at the line just above it and add the missing ; at its end.",
        "Click Check Code again.",
      ],
    }),
  },
  {
    id: "expected-closing-brace",
    test: /expected ['"]?\}['"]?/i,
    build: () => ({
      kind: "code",
      explanation: "A block was opened with { but never closed — the braces don't balance.",
      fix: "Add the missing closing } . Check that every { in setup(), loop() and your functions has a matching } .",
      steps: [
        "Click this problem to jump to the line.",
        "Count the { and } in the function above; add the missing } .",
        "Click Check Code again.",
      ],
    }),
  },
  {
    id: "expected-opening-brace",
    test: /expected ['"]?\{['"]?/i,
    build: () => ({
      kind: "code",
      explanation: "The compiler expected a { to start a block of code here but found something else.",
      fix: "Add a { after the function header or control statement (if, for, while), and make sure it has a matching } .",
    }),
  },

  /* ----------------------------------------------------- missing header --- */
  {
    id: "missing-header",
    test: /([\w./+-]+\.h)\s*:\s*No such file or directory/i,
    build: (m) => {
      const header = m[1];
      const stem = header.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, "");
      const query = stem.replace(/_+/g, " ").trim() || stem;
      return {
        kind: "code",
        explanation: `The compiler can't find "${header}". This header belongs to a library that isn't installed yet.`,
        fix: `Search the library registry for "${query}" and install the match. If it should be a local file, check the #include spelling.`,
        steps: [
          `Open Libraries and search for "${query}".`,
          "Click Install on the matching library.",
          "Click Check Code again.",
        ],
        action: { kind: "search-library", query, label: `Find "${query}" in libraries` },
      };
    },
  },

  /* ------------------------------------------------------ names & types --- */
  {
    id: "not-declared",
    test: /['"]([^'"]+)['"] was not declared in this scope/i,
    build: (m) => ({
      kind: "code",
      explanation:
        `The name "${m[1]}" hasn't been defined before it's used here. This is almost always a typo, or a variable used outside the {} block it was declared in.`,
      fix: `Check the spelling and capitalisation of "${m[1]}" — Arduino names are case-sensitive (digitalWrite, not digtalWrite). If it's your own variable, declare it before this line.`,
      steps: [
        "Click this problem to jump to the line.",
        `Compare "${m[1]}" letter by letter with the name you meant (capital letters matter).`,
        "If it is your own variable, declare it above this line or outside the function.",
        "Click Check Code again.",
      ],
    }),
  },
  {
    id: "does-not-name-a-type",
    test: /['"]([^'"]+)['"] does not name a type/i,
    build: (m) => ({
      kind: "code",
      explanation:
        `"${m[1]}" was used as a type, but the compiler doesn't know it. The type's name may be misspelled, or the library that defines it hasn't been included.`,
      fix: `Check the spelling of "${m[1]}", and add the #include for the library that provides it at the top of your sketch.`,
    }),
  },
  {
    id: "no-member-named",
    test: /['"]?([^'"]+)['"]? has no member named ['"]([^'"]+)['"]/i,
    build: (m) => ({
      kind: "code",
      explanation: `"${m[2]}" isn't a function or property of ${m[1]}. The member name is probably misspelled, or it belongs to a different object.`,
      fix: `Check the spelling of "${m[2]}" and the library's documentation for the correct member names — they are case-sensitive.`,
    }),
  },

  /* ------------------------------------------------------- redefinition --- */
  {
    id: "redefinition",
    test: /redefinition of|redeclared as|redeclaration of/i,
    build: () => ({
      kind: "code",
      explanation: "The same name is defined more than once. C++ only allows a name to be defined a single time.",
      fix: "Remove the duplicate declaration, or rename one of them so each name is unique. Watch for a variable declared both globally and again inside a function.",
    }),
  },

  /* ------------------------------------------------------ system setup --- */
  {
    // macOS on Apple Silicon without Rosetta: Intel-only build tools.
    id: "rosetta-missing",
    test: /Bad CPU type in executable|Exec format error|cannot execute binary file/i,
    build: () => ({
      kind: "system",
      explanation:
        "A build tool could not start because this Mac has no Rosetta. Arduino's compiler helpers are Intel programs and need Rosetta on Apple Silicon.",
      fix: "Install Rosetta once from the Setup check, then build again.",
      steps: [
        "Open Help → Setup check.",
        "Click Install Rosetta and wait for it to finish (about a minute).",
        "Click Check Code again.",
      ],
      action: { kind: "open-setup-check", label: "Open Setup check" },
    }),
  },
  {
    // arduino-cli: Platform 'esp32:esp32' not found / not installed.
    id: "platform-not-installed",
    test: /platform ['"]?([\w:.-]+)['"]? (?:is )?not (?:installed|found)/i,
    build: (m) => ({
      kind: "system",
      explanation: `The board support package "${m[1]}" is not installed on this computer, so nothing can be compiled for this board yet.`,
      fix: "Install the board core from the Boards view (one time, about 1.3 GB for ESP32).",
      steps: [
        "Open Boards.",
        "Click Install next to the board's core (ESP32 for Spark, ESP8266 for Flint, STM32 for Indus).",
        "Wait for the install to finish, then click Check Code again.",
      ],
      action: { kind: "open-boards", label: "Open Boards" },
    }),
  },
  {
    // Linux: user not in the dialout group.
    id: "port-permission-denied",
    test: /permission denied.*(?:\/dev\/tty|serial)|\/dev\/tty\S*.*permission denied/i,
    build: (_m, _d, os) => ({
      kind: "system",
      explanation:
        os === "linux"
          ? "Linux is refusing to let your user open the board's serial port. Your user is not in the dialout group."
          : "The system refused to open the board's serial port.",
      fix: os === "linux" ? "Add your user to the dialout group, then log out and back in." : "Check the Setup check for the exact fix.",
      steps:
        os === "linux"
          ? [
              "Open a terminal and run: sudo usermod -aG dialout $USER",
              "Log out and log back in (or restart).",
              "Plug the board in again and click Upload.",
            ]
          : ["Open Help → Setup check and follow the serial-port item."],
      action: { kind: "open-setup-check", label: "Open Setup check" },
    }),
  },

  /* --------------------------------------------------- upload failures --- */
  {
    id: "port-busy",
    test: /could not open port|error opening serial port|access is denied|resource busy|port is busy/i,
    build: (_m, _d, os) => ({
      kind: "connection",
      explanation:
        `The IDE couldn't open the board's ${portWord(os)}. Another program is already using it — usually a Serial Monitor in another IDE — or the board was just unplugged.`,
      fix: "Close whatever else is using the port, then click Upload again.",
      steps: [
        "Close the Serial Monitor in any other program (Arduino IDE, PlatformIO, a terminal).",
        os === "windows"
          ? "If it still fails, unplug the board, wait 3 seconds, plug it back in."
          : "If it still fails, unplug the board, wait 3 seconds, plug it back in.",
        "Click Upload again.",
      ],
    }),
  },
  {
    id: "esp32-connect-failed",
    test: /Failed to connect to ESP(?:32|8266|-?[A-Z0-9]+)?|Wrong boot mode detected|No serial data received|Timed out waiting for packet header/i,
    build: () => ({
      kind: "connection",
      explanation:
        "The board was found but didn't answer when the IDE tried to flash it. ESP32 boards have to be in download mode to accept new code, and a charge-only cable also causes this.",
      fix: "Hold BOOT, press and release RST, release BOOT — then click Upload again. A data-capable USB cable helps.",
      steps: [
        "Hold the BOOT button on the board.",
        "While holding BOOT, press and release RST (EN).",
        "Release BOOT.",
        "Click Upload again within a few seconds.",
        "Still failing? Try a different USB cable — many are charge-only.",
      ],
    }),
  },
  {
    id: "invalid-header",
    test: /invalid header: 0x/i,
    build: () => ({
      kind: "connection",
      explanation:
        "The last upload stopped part-way, so the chip has an incomplete program and keeps restarting. Nothing is broken; it needs a complete upload.",
      fix: "Upload again in download mode.",
      steps: [
        "Hold BOOT, press and release RST, release BOOT.",
        "Click Upload again and keep the cable still until it finishes.",
      ],
    }),
  },
  {
    id: "port-not-found",
    test: /no (?:upload )?port (?:provided|found)|port .* not found|no such (?:file or )?device|no device found on|doesn't exist/i,
    build: (_m, _d, os) => ({
      kind: "connection",
      explanation: `No board was found to upload to — the IDE has no ${portWord(os)} to send the program over.`,
      fix: "Plug the board in over USB, wait for it to appear in the toolbar, then upload. A charge-only cable is the usual cause — try another cable.",
      steps: [
        "Plug the board into a USB port directly on the computer, not through a hub.",
        "Wait until the toolbar shows the board name.",
        os === "windows"
          ? "If it never appears, open Help → Setup check: Windows may be missing a USB driver."
          : os === "mac"
            ? "If it never appears, check for an \"Allow accessory to connect\" notification and allow it."
            : "If it never appears, open Help → Setup check for the serial-port permission.",
        "Try another USB cable — many are charge-only.",
      ],
      action: { kind: "open-setup-check", label: "Open Setup check" },
    }),
  },
  {
    // Anything else esptool calls fatal.
    id: "flasher-fatal",
    test: /A fatal error occurred|Failed uploading|uploading error/i,
    build: () => ({
      kind: "connection",
      explanation: "The flashing tool stopped before the program reached the board.",
      fix: "Reconnect the board and try again; if it repeats, use download mode.",
      steps: [
        "Unplug the board, wait 3 seconds, plug it back in.",
        "Click Upload again.",
        "Still failing? Hold BOOT, press and release RST, release BOOT, then Upload.",
      ],
    }),
  },
];

/** The OS this IDE is running on, for step wording. */
export function currentOs(): HintOs {
  if (typeof navigator === "undefined") return "linux";
  const ua = navigator.userAgent;
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  if (/Windows/i.test(ua)) return "windows";
  return "linux";
}

/**
 * Return a plain-English hint for a diagnostic, or `null` when no rule
 * recognises it. Rules are tried in order; the first match wins.
 */
export function humanizeDiagnostic(diagnostic: Diagnostic, os: HintOs = currentOs()): HumanizedHint | null {
  const message = diagnostic.message;
  for (const rule of RULES) {
    const match = message.match(rule.test);
    if (match) return rule.build(match, diagnostic, os);
  }
  return null;
}

/** Label for the kind badge. */
export function kindLabel(kind: ProblemKind): string {
  return kind === "code" ? "In your code" : kind === "connection" ? "Board connection" : "Computer setup";
}
