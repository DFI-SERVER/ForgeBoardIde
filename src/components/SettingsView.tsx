import { Minus, Plus } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import {
  settings,
  updateSettings,
  resetSettings,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  type TabSize,
  type Theme,
  type FontFamily,
} from "../lib/settings";
import { fontFamilyFor } from "../lib/monaco-setup";
import { projectApi, type SketchbookInfo } from "../ipc/project";
import { errText } from "../lib/actions";
import { toast } from "../state/appState";
import "./SettingsView.css";

/**
 * Settings — the Settings activity-rail view.
 *
 * Reads and writes the persisted `settings` signal (see lib/settings.ts).
 * Every control mutates settings through `updateSettings`, which writes
 * straight back to localStorage; the editor and the build flow pick the new
 * values up reactively, so there is no explicit save.
 */
export function SettingsView() {
  const s = settings.value;

  return (
    <div class="stv">
      <div class="stv-header">
        <span class="stv-title">Settings</span>
        <button
          class="stv-reset"
          title="Restore every preference to its default"
          onClick={() => {
            resetSettings();
            // Also clear the Rust-owned sketchbook override — the tooltip
            // promises "every preference", so we mustn't leave a custom
            // sketchbook path behind. Best-effort: ignore IPC failure.
            projectApi.sketchbookSet(null).catch(() => {});
          }}
        >
          Reset to defaults
        </button>
      </div>

      <div class="stv-body">
        <div class="stv-group-label">Appearance</div>

        <SettingRow
          stacked
          label="Theme"
          desc="Three internally-cohesive identities; pick what works for your environment."
        >
          <ThemePicker
            value={s.theme}
            onChange={(theme) => updateSettings({ theme })}
          />
        </SettingRow>

        <SettingRow
          stacked
          label="Editor font"
          desc="Monospace face used by the editor. Each card previews its own font."
        >
          <FontPicker
            value={s.fontFamily}
            onChange={(fontFamily) => updateSettings({ fontFamily })}
          />
        </SettingRow>

        <SettingRow
          label="Ligatures"
          desc="Render programming ligatures (= →, != ≠, => ⇒) on fonts that support them."
        >
          <Switch
            checked={s.fontLigatures}
            label="Ligatures"
            onChange={(fontLigatures) => updateSettings({ fontLigatures })}
          />
        </SettingRow>

        <div class="stv-group-label">Editor</div>

        <SettingRow
          label="Font size"
          desc="Size of the code text, in pixels."
        >
          <Stepper
            value={s.fontSize}
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            unit="px"
            onChange={(fontSize) => updateSettings({ fontSize })}
          />
        </SettingRow>

        <SettingRow
          label="Tab size"
          desc="Number of spaces inserted per indentation level."
        >
          <Segmented<TabSize>
            options={[2, 4]}
            value={s.tabSize}
            format={(n) => String(n)}
            onChange={(tabSize) => updateSettings({ tabSize })}
          />
        </SettingRow>

        <SettingRow
          label="Word wrap"
          desc="Wrap long lines instead of scrolling sideways."
        >
          <Switch
            checked={s.wordWrap}
            label="Word wrap"
            onChange={(wordWrap) => updateSettings({ wordWrap })}
          />
        </SettingRow>

        <SettingRow
          label="Minimap"
          desc="Show the code overview map on the editor's right edge."
        >
          <Switch
            checked={s.minimap}
            label="Minimap"
            onChange={(minimap) => updateSettings({ minimap })}
          />
        </SettingRow>

        <SettingRow
          label="Line numbers"
          desc="Show the line-number gutter beside the code."
        >
          <Switch
            checked={s.lineNumbers}
            label="Line numbers"
            onChange={(lineNumbers) => updateSettings({ lineNumbers })}
          />
        </SettingRow>

        <SettingRow
          label="Bracket pair colorization"
          desc="Tint matching brackets so nested scopes are easy to scan."
        >
          <Switch
            checked={s.bracketColorization}
            label="Bracket pair colorization"
            onChange={(bracketColorization) =>
              updateSettings({ bracketColorization })
            }
          />
        </SettingRow>

        <SettingRow
          label="Sticky scroll"
          desc="Pin the enclosing function header at the top of the editor."
        >
          <Switch
            checked={s.stickyScroll}
            label="Sticky scroll"
            onChange={(stickyScroll) => updateSettings({ stickyScroll })}
          />
        </SettingRow>

        <SettingRow
          label="Indent guides"
          desc="Render thin vertical lines at each indentation level."
        >
          <Switch
            checked={s.indentGuides}
            label="Indent guides"
            onChange={(indentGuides) => updateSettings({ indentGuides })}
          />
        </SettingRow>

        <div class="stv-group-label">On save</div>

        <SettingRow
          label="Format on save"
          desc="Re-indent the file to its brace depth every time it's saved."
        >
          <Switch
            checked={s.formatOnSave}
            label="Format on save"
            onChange={(formatOnSave) => updateSettings({ formatOnSave })}
          />
        </SettingRow>

        <SettingRow
          label="Trim trailing whitespace"
          desc="Strip spaces and tabs from the end of every line on save."
        >
          <Switch
            checked={s.trimTrailingWhitespaceOnSave}
            label="Trim trailing whitespace on save"
            onChange={(trimTrailingWhitespaceOnSave) =>
              updateSettings({ trimTrailingWhitespaceOnSave })
            }
          />
        </SettingRow>

        <div class="stv-group-label">Sketchbook</div>

        <SketchbookRow />

        <div class="stv-group-label">Build</div>

        <SettingRow
          label="Verbose compiler output"
          desc="Run arduino-cli with -v so the Output panel shows the full build log."
        >
          <Switch
            checked={s.verboseBuild}
            label="Verbose compiler output"
            onChange={(verboseBuild) => updateSettings({ verboseBuild })}
          />
        </SettingRow>
      </div>
    </div>
  );
}

/* ----------------------------------------------------- Sketchbook row --- */

/**
 * Sketchbook-location control — shows where sketches and opened examples are
 * saved, and lets the user point it elsewhere. The location is owned by the
 * Rust side (it must be known the moment a sketch is created), so this reads
 * and writes it through the project IPC, not the settings signal.
 */
function SketchbookRow() {
  const [info, setInfo] = useState<SketchbookInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load the current location once, when the Settings view mounts. Errors
  // are kept in their own state so the row can show "couldn't load" instead
  // of a permanent "Loading…" — that label hides a real failure otherwise.
  useEffect(() => {
    let cancelled = false;
    projectApi
      .sketchbookGet()
      .then((i) => {
        if (!cancelled) setInfo(i);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(errText(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Apply a new location: a folder path, or null to restore the default. */
  async function apply(path: string | null, okText: string) {
    setBusy(true);
    try {
      const effective = await projectApi.sketchbookSet(path);
      setInfo({ custom: path, effective });
      toast.value = { text: okText, kind: "success" };
    } catch (e) {
      toast.value = {
        text: `Couldn't update the sketchbook folder: ${errText(e)}`,
        kind: "warn",
      };
    } finally {
      setBusy(false);
    }
  }

  async function change() {
    try {
      const picked = await openFolderDialog({
        directory: true,
        title: "Choose a folder for your sketches",
      });
      if (typeof picked === "string") {
        await apply(picked, "Sketchbook folder updated");
      }
    } catch (e) {
      toast.value = {
        text: `Couldn't open folder picker: ${errText(e)}`,
        kind: "warn",
      };
    }
  }

  // info wins when we have it; otherwise show the load error (if any) so the
  // user knows something went wrong, rather than a perpetual "Loading…".
  const path = info?.effective ?? (loadError ? "Couldn't load — click Change…" : "Loading…");

  return (
    <div class="stv-row stv-row-stacked">
      <div class="stv-row-main">
        <div class="stv-row-label">Sketchbook folder</div>
        <div class="stv-row-desc">
          Where your sketches and opened examples are saved.
        </div>
      </div>
      <div class="stv-path">
        <code class="stv-path-value" title={path}>
          {path}
        </code>
        <div class="stv-path-actions">
          <button class="stv-btn" disabled={busy} onClick={change}>
            Change…
          </button>
          {info?.custom != null && (
            <button
              class="stv-btn"
              disabled={busy}
              onClick={() => apply(null, "Sketchbook folder reset to default")}
            >
              Use default
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** One labelled row — label + one-line description on the left, control
 *  right. Set `stacked` when the control is wider than the right-hand
 *  slot (e.g. theme picker, font picker) so it drops below the label. */
function SettingRow({
  label,
  desc,
  stacked = false,
  children,
}: {
  label: string;
  desc: string;
  stacked?: boolean;
  children: ComponentChildren;
}) {
  return (
    <div class={`stv-row ${stacked ? "stacked" : ""}`}>
      <div class="stv-row-main">
        <div class="stv-row-label">{label}</div>
        <div class="stv-row-desc">{desc}</div>
      </div>
      <div class="stv-row-control">{children}</div>
    </div>
  );
}

/* ----------------------------------------------------- Theme picker --- */

/**
 * Theme picker — three cards, each previewing the theme's surface, accent,
 * and foreground as miniature swatches. Selected card carries an accent
 * border and a brighter background so the choice is visible even before
 * the rest of the UI has re-tinted.
 *
 * Swatches are inline-styled with hardcoded hex values (not CSS vars) so
 * every card shows ITS theme's palette regardless of which theme is
 * currently active — i.e. the Dark card shows dark colors even when the
 * user is currently on Solarized Light.
 */
interface ThemeOption {
  value: Theme;
  label: string;
  bg: string;
  panel: string;
  fg: string;
  accent: string;
}

const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    value: "dark",
    label: "Dark",
    bg: "#181a23",
    panel: "#14151b",
    fg: "#c9ccd6",
    accent: "#e9eaef",
  },
  {
    value: "solarized-dark",
    label: "Solarized Dark",
    bg: "#002b36",
    panel: "#073642",
    fg: "#839496",
    accent: "#268bd2",
  },
  {
    value: "solarized-light",
    label: "Solarized Light",
    bg: "#fdf6e3",
    panel: "#eee8d5",
    fg: "#657b83",
    accent: "#268bd2",
  },
];

function ThemePicker({
  value,
  onChange,
}: {
  value: Theme;
  onChange: (next: Theme) => void;
}) {
  return (
    <div class="stv-theme-grid">
      {THEME_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          class={`stv-theme-card ${opt.value === value ? "active" : ""}`}
          aria-pressed={opt.value === value}
          aria-label={opt.label}
          onClick={() => onChange(opt.value)}
        >
          <div class="stv-theme-preview" style={{ background: opt.bg }}>
            <div class="stv-theme-panel" style={{ background: opt.panel }} />
            <div class="stv-theme-bar" style={{ background: opt.fg }} />
            <div class="stv-theme-bar short" style={{ background: opt.fg, opacity: 0.55 }} />
            <div class="stv-theme-dot" style={{ background: opt.accent }} />
          </div>
          <span class="stv-theme-label">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------- Font picker --- */

interface FontOption {
  value: FontFamily;
  label: string;
}

const FONT_OPTIONS: readonly FontOption[] = [
  { value: "consolas", label: "Consolas" },
  { value: "cascadia-code", label: "Cascadia Code" },
  { value: "fira-code", label: "Fira Code" },
  { value: "jetbrains-mono", label: "JetBrains Mono" },
];

function FontPicker({
  value,
  onChange,
}: {
  value: FontFamily;
  onChange: (next: FontFamily) => void;
}) {
  return (
    <div class="stv-font-grid">
      {FONT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          class={`stv-font-card ${opt.value === value ? "active" : ""}`}
          aria-pressed={opt.value === value}
          aria-label={opt.label}
          onClick={() => onChange(opt.value)}
          style={{ fontFamily: fontFamilyFor(opt.value) }}
        >
          <span class="stv-font-sample">{opt.label}</span>
          <span class="stv-font-glyphs">{"=> != <= >="}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------- Controls --- */

/** An on/off toggle switch — an ARIA switch button built on the tokens. */
function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      class="stv-switch"
      onClick={() => onChange(!checked)}
    >
      <span class="stv-switch-knob" />
    </button>
  );
}

/** A segmented choice over a small fixed option set. */
function Segmented<T extends string | number>({
  options,
  value,
  format,
  onChange,
}: {
  options: readonly T[];
  value: T;
  format: (v: T) => string;
  onChange: (next: T) => void;
}) {
  return (
    <div class="stv-segmented" role="group">
      {options.map((opt) => (
        <button
          key={String(opt)}
          type="button"
          class={`stv-segment ${opt === value ? "active" : ""}`}
          aria-pressed={opt === value}
          onClick={() => onChange(opt)}
        >
          {format(opt)}
        </button>
      ))}
    </div>
  );
}

/** A bounded integer stepper — minus / value / plus. */
function Stepper({
  value,
  min,
  max,
  unit,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (next: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div class="stv-stepper">
      <button
        type="button"
        class="stv-stepper-btn"
        aria-label="Decrease"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
      >
        <Minus size={13} strokeWidth={2} />
      </button>
      <span class="stv-stepper-value">
        {value}
        {unit ? unit : ""}
      </span>
      <button
        type="button"
        class="stv-stepper-btn"
        aria-label="Increase"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        <Plus size={13} strokeWidth={2} />
      </button>
    </div>
  );
}
