/**
 * Compile/upload lifecycle, streamed build output, diagnostics, and size history.
 */
import { signal, computed } from "@preact/signals";
import { countDiagnostics, type Diagnostic } from "./diagnostics";

/**
 * Structured compiler diagnostics from the most recent compile (see
 * lib/diagnostics.ts). Replaced wholesale after each compile — empty until
 * the first compile runs, and reset to empty at the start of every compile.
 */
export const diagnostics = signal<Diagnostic[]>([]);

/** Error / warning tallies derived from `diagnostics`. */
export const diagnosticCounts = computed(() => countDiagnostics(diagnostics.value));

/** Total problem count — the badge on the Problems tab. */
export const problemsCount = computed(
  () => diagnosticCounts.value.errors + diagnosticCounts.value.warnings,
);

/** Compile / upload lifecycle phase — drives the ActionBar buttons and Output panel. */
export type BuildPhase = "idle" | "compiling" | "uploading" | "success" | "error";

export const buildPhase = signal<BuildPhase>("idle");

/** arduino-cli output lines for the current build, in order. */
export const buildOutput = signal<string[]>([]);

/**
 * Most recent parsed compile sizes (flash + RAM, used + total) from arduino-cli's
 * size summary. Null until the first successful compile produces a parseable
 * report; reset to null at the start of every compile so the MemoryBar does
 * not show stale numbers while a build is in flight.
 */
export const lastCompileSize = signal<{
  flashUsed: number;
  flashTotal: number;
  ramUsed: number;
  ramTotal: number;
} | null>(null);

/**
 * Per-FQBN history of flash-usage percentages from the last N successful
 * compiles. Persisted via lib/compile-history.ts; keyed by FQBN so the
 * sparkline tracks a particular board's drift over time. Capped at 10 per
 * FQBN — older entries fall off the front when a new one is pushed.
 */
export const compileSizeHistory = signal<Map<string, number[]>>(new Map());

/**
 * Live stage + percentage of the running build, or null when idle. Driven
 * by `progress.ts` from the streamed output; the action bar renders it as a
 * determinate bar with a label instead of a looping animation.
 */
export const buildProgress = signal<{ stage: string; percent: number | null } | null>(null);
