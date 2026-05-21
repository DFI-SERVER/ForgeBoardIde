import { Minus, Plus } from "lucide-preact";
import type { ComponentChildren } from "preact";
import {
  settings,
  updateSettings,
  resetSettings,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  type TabSize,
} from "../lib/settings";
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
          onClick={() => resetSettings()}
        >
          Reset to defaults
        </button>
      </div>

      <div class="stv-body">
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

/** One labelled row — label + one-line description on the left, control right. */
function SettingRow({
  label,
  desc,
  children,
}: {
  label: string;
  desc: string;
  children: ComponentChildren;
}) {
  return (
    <div class="stv-row">
      <div class="stv-row-main">
        <div class="stv-row-label">{label}</div>
        <div class="stv-row-desc">{desc}</div>
      </div>
      <div class="stv-row-control">{children}</div>
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
