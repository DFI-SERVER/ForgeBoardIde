/**
 * Real build progress — stage and percentage — derived from what arduino-cli
 * and esptool actually print, instead of a looping animation.
 *
 * Compile: arduino-cli prints stage markers only in verbose mode
 * ("Detecting libraries used...", "Compiling sketch...", "Compiling core...",
 * "Linking everything together...", "Sketch uses …"), so the IDE always runs
 * the compiler verbose and filters the noise for the Output panel itself.
 * The toolchain gives no percentage, so within the long stages the bar
 * advances by counting compiler invocations against the previous build of
 * the same board — an honest estimate, labelled as the stage it is in.
 *
 * Upload: esptool prints real percentages ("Writing at 0x… (42 %)"), which
 * map onto the upload part of the bar directly.
 *
 * Pure module — no signals, no Tauri — so it is unit-tested in isolation.
 */

export interface BuildProgress {
  /** Short stage label shown next to the bar, e.g. "Compiling core". */
  stage: string;
  /** 0–100, or null when the stage has no meaningful percentage yet. */
  percent: number | null;
}

/** Compile stages in order, with the percentage each one starts at. */
const COMPILE_STAGES: { test: RegExp; label: string; at: number }[] = [
  { test: /^Detecting libraries used/i, label: "Checking libraries", at: 8 },
  { test: /^Generating function prototypes/i, label: "Preparing sketch", at: 14 },
  { test: /^Compiling sketch/i, label: "Compiling sketch", at: 20 },
  { test: /^Compiling librar/i, label: "Compiling libraries", at: 40 },
  { test: /^Compiling core/i, label: "Compiling core", at: 55 },
  { test: /^Linking everything together/i, label: "Linking", at: 86 },
  { test: /^(Creating .* image|Building .*|Generating .*bin)/i, label: "Creating firmware image", at: 93 },
  { test: /^Sketch uses \d+ bytes/i, label: "Compiled", at: 100 },
];

/** Upload stages (esptool / avrdude / dfu-util wording). */
const UPLOAD_STAGES: { test: RegExp; label: string; at: number }[] = [
  { test: /^(Serial port|esptool v|Connecting)/i, label: "Connecting to board", at: 5 },
  { test: /^Chip is/i, label: "Board found", at: 10 },
  { test: /^(Uploading stub|Running stub|Stub (is )?running|Changing baud)/i, label: "Preparing upload", at: 14 },
  { test: /^Configuring flash/i, label: "Preparing upload", at: 16 },
  { test: /^(Flash will be erased|Compressed|Erasing)/i, label: "Erasing", at: 18 },
  { test: /^Writing at/i, label: "Writing firmware", at: 20 },
  { test: /^Wrote \d+ bytes/i, label: "Written", at: 92 },
  { test: /^Hash of data verified/i, label: "Verifying", at: 95 },
  { test: /^(Leaving|Hard resetting|Resetting)/i, label: "Restarting board", at: 99 },
  { test: /^(avrdude: writing|Writing \|)/i, label: "Writing firmware", at: 40 },
  { test: /^(avrdude: verifying|Reading \|)/i, label: "Verifying", at: 85 },
  { test: /^(Download done|File downloaded successfully|dfu-util: .*done)/i, label: "Written", at: 95 },
];

/** Is this a raw tool invocation (a path to a compiler/tool plus flags)? Such
 *  lines are hidden from the Output panel unless verbose output is on. */
export function isCommandLine(line: string): boolean {
  const l = line.trim();
  if (!l) return false;
  // Absolute path (unix or Windows drive) at the start, followed by more.
  if (/^(\/|[A-Za-z]:\\|"[A-Za-z]:\\|"\/)/.test(l) && /\s/.test(l)) return true;
  // "Using board / core / library …" and "Multiple libraries were found" are
  // informational chatter from -v.
  if (/^(Using (board|core|library|cached|precompiled)|Multiple libraries were found|Not used:|Used:)/i.test(l)) return true;
  return false;
}

/** Match a compile-output line to a stage, if it marks one. */
export function compileStageFor(line: string): { label: string; at: number } | null {
  const l = line.replace(/\x1b\[[0-9;]*m/g, "").trim();
  for (const s of COMPILE_STAGES) if (s.test.test(l)) return { label: s.label, at: s.at };
  return null;
}

/** Match an upload-output line to a stage and, for esptool, a percentage. */
export function uploadStageFor(line: string): { label: string; at: number } | null {
  const l = line.replace(/\x1b\[[0-9;]*m/g, "").trim();
  const w = l.match(/^Writing at 0x[0-9a-f]+.*?\((\d+)\s*%\)/i);
  if (w) {
    const pct = Math.min(100, Math.max(0, parseInt(w[1], 10)));
    return { label: "Writing firmware", at: 20 + Math.round(pct * 0.72) };
  }
  for (const s of UPLOAD_STAGES) if (s.test.test(l)) return { label: s.label, at: s.at };
  return null;
}

/** Is this a compiler invocation we can count toward the stage estimate? */
export function isCompilerInvocation(line: string): boolean {
  return /(-g\+\+|-gcc|-cc|clang\+\+|clang)(\.exe)?["']?\s.*\s-c\s/.test(line) || /\s-c\s.*\.(cpp|c|ino\.cpp|S)\b/.test(line);
}

/**
 * Tracks one build: feeds lines in, yields the current progress. The
 * `expected` compiler-invocation count from the previous build of this board
 * turns "Compiling core" from a stuck bar into a moving estimate.
 */
export class ProgressTracker {
  private stage: { label: string; at: number } | null = null;
  private nextAt = 100;
  private invocations = 0;
  private mode: "compile" | "upload" = "compile";

  constructor(private expected: number | null) {}

  /** Feed one output line. Returns the new progress, or null if unchanged. */
  feed(line: string): BuildProgress | null {
    if (this.mode === "compile") {
      const s = compileStageFor(line);
      if (s) {
        this.stage = s;
        const idx = COMPILE_STAGES.findIndex((c) => c.label === s.label);
        this.nextAt = COMPILE_STAGES[idx + 1]?.at ?? 100;
        return this.current();
      }
      if (isCompilerInvocation(line)) {
        this.invocations++;
        return this.stage ? this.current() : null;
      }
      const u = uploadStageFor(line);
      if (u) {
        // The compile part is over; the same stream now carries the flasher.
        this.mode = "upload";
        this.stage = u;
        return this.current();
      }
      return null;
    }
    const u = uploadStageFor(line);
    if (!u) return null;
    this.stage = u;
    return this.current();
  }

  /** How many compiler invocations this build made — remember it for next time. */
  get invocationCount(): number {
    return this.invocations;
  }

  current(): BuildProgress {
    if (!this.stage) return { stage: "Starting", percent: 0 };
    if (this.mode === "upload") return { stage: this.stage.label, percent: this.stage.at };
    // Inside a compile stage, advance toward the next stage by the share of
    // expected invocations done so far; without an expectation, hold the
    // stage's base percentage (honest, if less lively).
    let pct = this.stage.at;
    if (this.expected && this.expected > 0 && this.nextAt > this.stage.at) {
      const share = Math.min(1, this.invocations / this.expected);
      pct = Math.round(this.stage.at + share * (this.nextAt - this.stage.at - 1));
    }
    return { stage: this.stage.label, percent: Math.min(100, pct) };
  }
}

/* ---- memory of the previous build's size, per board ---------------- */

const KEY = "forgeboard.compile-invocations";

export function loadExpectedInvocations(fqbn: string, storage: Pick<Storage, "getItem"> = localStorage): number | null {
  try {
    const raw = storage.getItem(KEY);
    const map: unknown = raw ? JSON.parse(raw) : {};
    const v = (map as Record<string, unknown>)[fqbn];
    return typeof v === "number" && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveExpectedInvocations(fqbn: string, count: number, storage: Pick<Storage, "getItem" | "setItem"> = localStorage): void {
  if (count <= 0) return;
  try {
    const raw = storage.getItem(KEY);
    const map = (raw ? JSON.parse(raw) : {}) as Record<string, number>;
    map[fqbn] = count;
    storage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* best effort */
  }
}
