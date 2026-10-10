/**
 * Serial-plotter line parser — pure, UI-free, and unit-tested.
 *
 * The Serial Plotter reads numeric data printed by a sketch and graphs it.
 * It accepts the same loose formats the Arduino IDE plotter does:
 *
 *   - several numbers on one line, separated by spaces, commas or tabs
 *       `12 34 56`   `12,34,56`   `12\t34\t56`
 *   - `label:value` pairs, where the label names the series
 *       `temp:23.5 humidity:60`
 *   - a mix of the two on one line
 *       `temp:23.5 60 onboard:1`
 *
 * Each value position (or label) is a separate data series. A line with no
 * parseable number contributes nothing and is ignored (log banners, prose).
 *
 * This module is deliberately free of signals, Tauri and the DOM so it can be
 * exercised in isolation; the plotter component feeds raw `rx` lines through
 * `parsePlotterLine` and folds the result into its rolling sample buffer.
 */

/** One named numeric reading parsed from a serial line. */
export interface PlotterSample {
  /**
   * Series name. For a `label:value` pair this is the label; for a bare
   * number it is positional — `Series 1`, `Series 2`, … by 1-based order.
   */
  label: string;
  /** The finite numeric value. */
  value: number;
}

/**
 * A number token: optional sign, integers, decimals, leading-dot decimals,
 * and scientific notation. Anchored so the *entire* token must be numeric —
 * `12v` or `1.2.3` are rejected rather than partially consumed.
 */
const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * A `label:value` token. The label is any run of non-colon characters; the
 * value is validated separately against NUMBER_RE. Group 1 is the label,
 * group 2 the value text.
 */
const LABELLED_RE = /^([^:]+):(.+)$/;

/**
 * Parse one serial line into its numeric samples.
 *
 * Tokens are split on spaces, commas and tabs (any run thereof). Each token
 * is either a `label:value` pair or a bare number; anything else is dropped.
 * Bare numbers are named positionally as `Series N`, where N counts *every*
 * token slot on the line (1-based) so a value keeps a stable series across
 * lines even when an earlier slot is labelled or, on one line, unparseable.
 *
 * Returns an empty array when the line carries no number at all.
 */
export function parsePlotterLine(raw: string): PlotterSample[] {
  const samples: PlotterSample[] = [];

  // Split on any run of comma / whitespace (covers space, tab and the CR a
  // CRLF leaves behind). Empty tokens from leading/trailing separators drop.
  const tokens = raw.split(/[,\s]+/).filter((t) => t.length > 0);

  tokens.forEach((token, index) => {
    const labelled = LABELLED_RE.exec(token);
    if (labelled) {
      const label = labelled[1].trim();
      const valueText = labelled[2].trim();
      if (label.length > 0 && NUMBER_RE.test(valueText)) {
        const value = Number(valueText);
        if (Number.isFinite(value)) samples.push({ label, value });
      }
      return;
    }

    if (NUMBER_RE.test(token)) {
      const value = Number(token);
      if (Number.isFinite(value)) {
        // 1-based, positional — keyed to the token slot, not to how many
        // numbers we have accepted so far, so series stay aligned.
        samples.push({ label: `Series ${index + 1}`, value });
      }
    }
  });

  return samples;
}

/**
 * True when a line yields at least one numeric sample — a cheap predicate for
 * deciding whether incoming serial data is plottable at all.
 */
export function hasPlottableData(raw: string): boolean {
  return parsePlotterLine(raw).length > 0;
}
