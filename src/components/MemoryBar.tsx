import "./MemoryBar.css";
import {
  lastCompileSize,
  compileSizeHistory,
} from "../state/appState";
import { effectiveFqbn } from "../lib/effective-fqbn";

/** Threshold above which a usage zone counts as "warning" (amber). */
const WARNING_PCT = 80;
/** Threshold above which a usage zone counts as "error" (red). */
const ERROR_PCT = 90;

/**
 * Format `n` bytes for compact display. Above 1 KiB the value rounds to one
 * decimal KB; under that it's reported as raw bytes. (1024-based — matches the
 * binary kibibyte the toolchain reports as KB in its own size summary.)
 */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  // One decimal under 100 KB; whole-KB after that — keeps the column tidy.
  if (kb < 100) return `${kb.toFixed(1)} KB`;
  return `${Math.round(kb)} KB`;
}

/** Map a percentage to the meaning-bearing CSS-token name for the bar fill. */
function zoneClass(pct: number): string {
  if (pct >= ERROR_PCT) return "memory-bar-fill-error";
  if (pct >= WARNING_PCT) return "memory-bar-fill-warning";
  return "memory-bar-fill-success";
}

interface BarRowProps {
  label: string;
  used: number;
  total: number;
}

/**
 * One bar row — left-aligned label, a fixed-width meter, then the
 * `(used X bytes from Y bytes)` summary the PlatformIO analyser uses. The
 * meter colour shifts through success → warning → error as the percentage
 * climbs through the WARNING_PCT / ERROR_PCT thresholds.
 */
function BarRow({ label, used, total }: BarRowProps) {
  // total === 0 is filtered by the parser, but guard anyway so a bad build
  // can never produce Infinity or NaN in the rendered width.
  const safeTotal = total > 0 ? total : 1;
  const rawPct = (used / safeTotal) * 100;
  const pct = Math.max(0, Math.min(100, rawPct));
  // Round to one decimal so the displayed percent matches the bar width and
  // can't drift between renders due to float jitter.
  const displayPct = Math.round(pct * 10) / 10;
  return (
    <div class="memory-bar-row">
      <span class="memory-bar-label">{label}</span>
      <div class="memory-bar-track">
        <div
          class={`memory-bar-fill ${zoneClass(pct)}`}
          style={`width: ${pct.toFixed(2)}%`}
        />
      </div>
      <span class="memory-bar-pct">{displayPct}%</span>
      <span class="memory-bar-bytes">
        {formatBytes(used)} / {formatBytes(total)}
      </span>
    </div>
  );
}

interface SparklineProps {
  history: number[];
}

/**
 * The flash-usage history strip — one tiny vertical bar per past compile,
 * height proportional to that compile's flash usage percentage. Renders
 * nothing when there is no history to draw; the parent decides whether to
 * reserve space for the row.
 */
function Sparkline({ history }: SparklineProps) {
  if (history.length === 0) return null;
  return (
    <div class="memory-bar-sparkline" title="Flash usage over the last compiles (this board)">
      {history.map((pct, i) => {
        // A minimum height of 2% gives a visible tick even for empty sketches,
        // so the row never reads as missing data.
        const h = Math.max(2, Math.min(100, pct));
        return (
          <div
            key={i}
            class={`memory-bar-spark-bar ${zoneClass(pct)}`}
            style={`height: ${h}%`}
          />
        );
      })}
    </div>
  );
}

/**
 * Compact memory-usage summary for the Output tab, shown after a successful
 * compile. Renders nothing until the size parser has produced its first result
 * — the bottom of an empty Output tab should stay empty.
 */
export function MemoryBar() {
  const size = lastCompileSize.value;
  if (!size) return null;

  // Mirror the bucket recordCompileSize wrote into — when a sketch.yaml
  // profile is active, the history sits under the profile's FQBN, not the
  // global selector's. Reading the wrong key shows an empty sparkline.
  const fqbn = effectiveFqbn();
  const history = compileSizeHistory.value.get(fqbn) ?? [];

  return (
    <div class="memory-bar" role="region" aria-label="Sketch memory usage">
      <BarRow label="Flash" used={size.flashUsed} total={size.flashTotal} />
      <BarRow label="RAM" used={size.ramUsed} total={size.ramTotal} />
      <Sparkline history={history} />
    </div>
  );
}
