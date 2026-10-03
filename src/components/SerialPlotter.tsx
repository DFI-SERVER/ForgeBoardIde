import { useEffect, useRef, useState } from "preact/hooks";
import { Pause, Play, Trash2, Activity } from "lucide-preact";
import { ensureSerialListeners } from "../ipc/serial";
import {
  serialLog,
  serialLogTotal,
  serialConnected,
  connectedPort,
} from "../state/appState";
import { parsePlotterLine } from "../lib/plotter-parse";
import "./SerialPlotter.css";

/**
 * Earned-colour palette for the data series — the one place colour is allowed
 * in this otherwise-monochrome panel, because telling series apart is
 * functional. Blue is deliberately excluded — the chrome is monochrome and
 * the editor no longer tints functions blue, so the plotter follows suit.
 */
const SERIES_COLORS = [
  "#e3e4ea", // near-white  — primary series, mono accent
  "#7fbdbf", // teal        — number / type
  "#9ec293", // sage        — string
  "#ab9fe0", // violet      — keyword
  "#e8b24a", // amber       — warning / contrast
] as const;

/** Window-size options — the count of most-recent samples kept on screen. */
const WINDOW_SIZES = [100, 250, 500] as const;
type WindowSize = (typeof WINDOW_SIZES)[number];

/** One series: a name, its colour, and a ring of recent values. */
interface Series {
  label: string;
  color: string;
  /** Values oldest→newest; trimmed to the active window size. */
  values: number[];
}

/** Device-pixel-aware canvas sizing — keeps lines crisp on HiDPI displays. */
function fitCanvas(canvas: HTMLCanvasElement): { w: number; h: number } {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}

/** Read a CSS custom property off the chart root — keeps chrome token-driven. */
function token(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

/** A "nice" axis step (1/2/5 × 10ⁿ) at or just above `rough`. */
function niceStep(rough: number): number {
  if (rough <= 0 || !Number.isFinite(rough)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * pow;
}

/** Compact tick label — trims needless decimals without losing small values. */
function fmtTick(v: number): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1000 || abs < 0.01) return v.toExponential(1);
  return Number(v.toFixed(2)).toString();
}

export function SerialPlotter() {
  const [paused, setPaused] = useState(false);
  const [windowSize, setWindowSize] = useState<WindowSize>(250);
  // Series live in a ref, not state: the data stream is high-frequency and a
  // re-render per sample would thrash. The canvas is repainted on a rAF tick;
  // `legendTick` nudges Preact only when the legend's numbers need refreshing.
  const seriesRef = useRef<Map<string, Series>>(new Map());
  const seriesOrderRef = useRef<string[]>([]);
  const [legendTick, setLegendTick] = useState(0);
  const [hasData, setHasData] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  // How much of the serial stream the plotter has consumed, as an ABSOLUTE
  // count over the life of the app (`serialLogTotal`), not an index into the
  // array — the log drops its head once it hits the retention cap, so array
  // indices shift under us while the total only ever grows.
  const consumedRef = useRef(0);
  const pausedRef = useRef(paused);
  const windowRef = useRef<WindowSize>(windowSize);
  pausedRef.current = paused;
  windowRef.current = windowSize;

  // Share the app-wide serial listeners (idempotent) so the plotter works
  // even if the Serial Monitor tab was never opened.
  useEffect(() => {
    ensureSerialListeners();
  }, []);

  // Ingest new received lines whenever the shared serial log grows. This reads
  // the *same* serialLog the Serial Monitor does — no second connection.
  useEffect(() => {
    const log = serialLog.value;
    const total = serialLogTotal.peek();
    if (consumedRef.current > total) consumedRef.current = 0; // defensive
    if (pausedRef.current) {
      consumedRef.current = total; // skip — don't backfill on resume
      return;
    }

    // The unseen tail of the stream. If more arrived than the log retains
    // (cap trimmed the head before we ran), the dropped lines are simply
    // gone — read what's still there.
    let unseen = total - consumedRef.current;
    if (unseen > log.length) unseen = log.length;

    let appended = false;
    for (let i = log.length - unseen; i < log.length; i++) {
      const entry = log[i];
      if (entry.kind !== "rx") continue; // only device output, not tx/info
      const samples = parsePlotterLine(entry.text);
      if (samples.length === 0) continue;
      for (const s of samples) {
        let series = seriesRef.current.get(s.label);
        if (!series) {
          const color =
            SERIES_COLORS[seriesOrderRef.current.length % SERIES_COLORS.length];
          series = { label: s.label, color, values: [] };
          seriesRef.current.set(s.label, series);
          seriesOrderRef.current.push(s.label);
        }
        series.values.push(s.value);
        appended = true;
      }
    }
    consumedRef.current = total;

    if (appended) {
      // Trim every series to the active window and ask for a repaint.
      const cap = windowRef.current;
      for (const series of seriesRef.current.values()) {
        if (series.values.length > cap) {
          series.values.splice(0, series.values.length - cap);
        }
      }
      // Idempotent — Preact bails out of the re-render when already true.
      setHasData(true);
      scheduleDraw();
    }
  }, [serialLog.value]);

  // Re-trim and repaint when the window size shrinks.
  useEffect(() => {
    for (const series of seriesRef.current.values()) {
      if (series.values.length > windowSize) {
        series.values.splice(0, series.values.length - windowSize);
      }
    }
    scheduleDraw();
  }, [windowSize]);

  // Repaint on resize so the chart tracks the panel.
  useEffect(() => {
    const ro = new ResizeObserver(() => scheduleDraw());
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => {
      ro.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /** Coalesce repaints onto a single animation frame. */
  function scheduleDraw() {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      draw();
    });
  }

  /** Paint the chart: chrome in tokens, series lines in the cool palette. */
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = fitCanvas(canvas);

    const root = canvas.parentElement ?? canvas;
    const cBg = token(root, "--editor-bg", "#181a23");
    const cGrid = token(root, "--border-subtle", "#1c1e25");
    const cGridStrong = token(root, "--border", "#262a33");
    const cAxisText = token(root, "--fg-subtle", "#61667a");

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = cBg;
    ctx.fillRect(0, 0, w, h);

    // Plot area — leave a gutter for the Y tick labels.
    const padL = 46;
    const padR = 8;
    const padT = 8;
    const padB = 18;
    const plotW = Math.max(1, w - padL - padR);
    const plotH = Math.max(1, h - padT - padB);

    const seriesList = seriesOrderRef.current
      .map((label) => seriesRef.current.get(label))
      .filter((s): s is Series => !!s && s.values.length > 0);

    // Y range across every series, padded; falls back to 0..1 when flat/empty.
    let min = Infinity;
    let max = -Infinity;
    let maxLen = 0;
    for (const s of seriesList) {
      maxLen = Math.max(maxLen, s.values.length);
      for (const v of s.values) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0;
      max = 1;
    } else if (min === max) {
      min -= 1;
      max += 1;
    } else {
      const margin = (max - min) * 0.08;
      min -= margin;
      max += margin;
    }

    // Nice gridline steps over the padded range (~4 horizontal lines).
    const step = niceStep((max - min) / 4);
    const gridStart = Math.ceil(min / step) * step;

    const xAt = (i: number) =>
      padL + (maxLen <= 1 ? 0 : (i / (maxLen - 1)) * plotW);
    const yAt = (v: number) =>
      padT + plotH - ((v - min) / (max - min)) * plotH;

    // Horizontal gridlines + Y tick labels. Canvas `font` takes a concrete
    // font string (no CSS var()); mirror --font-mono's stack literally.
    ctx.font =
      '10px "Cascadia Code", "Cascadia Mono", "Consolas", monospace';
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    for (let v = gridStart; v <= max; v += step) {
      const y = yAt(v);
      ctx.strokeStyle = Math.abs(v) < step / 2 ? cGridStrong : cGrid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, Math.round(y) + 0.5);
      ctx.lineTo(w - padR, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.fillStyle = cAxisText;
      ctx.fillText(fmtTick(v), padL - 6, y);
    }

    // Plot frame (left + bottom axis).
    ctx.strokeStyle = cGridStrong;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL + 0.5, padT);
    ctx.lineTo(padL + 0.5, padT + plotH);
    ctx.lineTo(w - padR, padT + plotH);
    ctx.stroke();

    // X axis caption — the moving sample window.
    ctx.fillStyle = cAxisText;
    ctx.textAlign = "left";
    ctx.fillText("0", padL, h - padB + 9);
    ctx.textAlign = "right";
    ctx.fillText(`${maxLen} samples`, w - padR, h - padB + 9);

    // Series lines — the only coloured ink on the canvas.
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const s of seriesList) {
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      for (let i = 0; i < s.values.length; i++) {
        const x = xAt(i);
        const y = yAt(s.values[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // Bump the legend ~5×/s so its current-value readout stays live without a
  // re-render per sample. Only runs while receiving and unpaused.
  useEffect(() => {
    if (paused || !hasData) return;
    const id = window.setInterval(() => setLegendTick((n) => n + 1), 200);
    return () => window.clearInterval(id);
  }, [paused, hasData]);

  function clear() {
    seriesRef.current.clear();
    seriesOrderRef.current = [];
    setHasData(false);
    scheduleDraw();
  }

  // Touch legendTick so the legend re-renders on the interval above.
  void legendTick;
  const legend = seriesOrderRef.current
    .map((label) => seriesRef.current.get(label))
    .filter((s): s is Series => !!s);

  const showEmpty = !hasData;

  return (
    <div class="spl">
      <div class="spl-toolbar">
        <button
          class="spl-btn"
          onClick={() => setPaused((p) => !p)}
          disabled={!hasData}
          title={paused ? "Resume plotting" : "Pause plotting"}
        >
          {paused ? (
            <Play size={13} strokeWidth={1.5} />
          ) : (
            <Pause size={13} strokeWidth={1.5} />
          )}
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          class="spl-btn"
          onClick={clear}
          disabled={!hasData}
          title="Clear all series"
        >
          <Trash2 size={13} strokeWidth={1.5} />
          Clear
        </button>
        <div class="spl-field">
          <label class="spl-field-label" for="spl-window">
            Window
          </label>
          <select
            id="spl-window"
            class="spl-select"
            value={windowSize}
            onChange={(e) =>
              setWindowSize(
                Number((e.target as HTMLSelectElement).value) as WindowSize,
              )
            }
          >
            {WINDOW_SIZES.map((n) => (
              <option value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div class="spl-spacer" />
        {paused && hasData && <span class="spl-status">Paused</span>}
      </div>

      <div class="spl-chart-wrap">
        <canvas ref={canvasRef} class="spl-canvas" />
        {showEmpty && (
          <div class="spl-empty">
            <Activity size={20} strokeWidth={1.5} class="spl-empty-icon" />
            <div class="spl-empty-title">No numeric data yet</div>
            <div class="spl-empty-hint">
              {serialConnected.value
                ? `Listening on ${connectedPort.value ?? "the port"} — print numbers (e.g. Serial.println(value)) to graph them.`
                : "Connect a board in the Serial Monitor, then print numbers to graph them."}
            </div>
          </div>
        )}
      </div>

      {legend.length > 0 && (
        <div class="spl-legend">
          {legend.map((s) => {
            const latest = s.values.length
              ? s.values[s.values.length - 1]
              : null;
            return (
              <div class="spl-legend-item" key={s.label}>
                <span
                  class="spl-legend-swatch"
                  style={{ background: s.color }}
                />
                <span class="spl-legend-name">{s.label}</span>
                <span class="spl-legend-value">
                  {latest === null ? "—" : fmtTick(latest)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
