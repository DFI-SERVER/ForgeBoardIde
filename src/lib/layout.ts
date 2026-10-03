/**
 * Persisted panel sizes — the draggable sidebar width and bottom-panel height.
 *
 * Both dimensions are layout CSS variables (`--sidebar-w`, `--bottompanel-h`)
 * that the grid in `global.css` already consumes. This module owns them: it
 * hydrates the saved sizes from `localStorage` on `initLayout()`, writes them
 * onto the document root so the layout picks them up, and re-persists whenever
 * a drag finishes.
 *
 * Sizes live here rather than in `settings.ts` because they are written on
 * every pointer-move of a drag; driving a CSS variable directly avoids a
 * Preact re-render on each frame. `settings.ts` stays for genuine preferences.
 *
 * Stored JSON is parsed defensively — a missing, truncated or hand-corrupted
 * entry must never crash the app or apply a nonsensical size; each field falls
 * back to its default.
 */

/** A resizable panel dimension: its bounds, default, and the CSS var it drives. */
export interface PanelSpec {
  /** Key the size is persisted under, and the in-memory store's key. */
  readonly key: "sidebarWidth" | "bottomPanelHeight";
  /** The CSS custom property on :root this size feeds. */
  readonly cssVar: string;
  /** Smallest allowed size, in CSS pixels. */
  readonly min: number;
  /** Largest allowed size, in CSS pixels, before the viewport cap. */
  readonly max: number;
  /** The shipped size — also the double-click-to-reset target. */
  readonly default: number;
  /** Window axis the panel grows along; the cap below leaves room on it. */
  readonly axis: "width" | "height";
  /** Pixels of the window axis kept clear of this panel, so the rest of the
   *  UI (and a usable editor) always survives an extreme drag. */
  readonly reserve: number;
}

/** The left sidebar — Files / Libraries / Examples / … all share its width. */
export const SIDEBAR: PanelSpec = {
  key: "sidebarWidth",
  cssVar: "--sidebar-w",
  min: 220,
  max: 560,
  default: 320,
  axis: "width",
  reserve: 480,
};

/** The bottom panel — Serial Monitor / Output / Plotter / Problems.
 *  Default of 220 px gives the Serial Monitor enough room to show toolbar +
 *  a few log lines + the prompt without dominating the screen; users that
 *  want more drag the resize handle taller and the layout module persists
 *  their pick. `reserve: 420` keeps at least 420 px of editor area visible
 *  no matter how aggressively the user drags. */
export const BOTTOM_PANEL: PanelSpec = {
  key: "bottomPanelHeight",
  cssVar: "--bottompanel-h",
  min: 120,
  max: 520,
  default: 220,
  axis: "height",
  reserve: 420,
};

const SPECS: readonly PanelSpec[] = [SIDEBAR, BOTTOM_PANEL];

/** localStorage key the sizes are persisted under. */
const STORAGE_KEY = "forgeboard.layout";

/** A migration marker — set once we've reset the bottom-panel height to a
 *  sensible default on launches that inherited the brief
 *  shipped-default-was-too-big window. New installs never see this; existing
 *  installs run the reset once.
 *
 *  The reset is unconditional (not threshold-based) because the prior
 *  default-was-320 build silently persisted that value into localStorage,
 *  putting a lot of installs in the 300–500 px range where a threshold
 *  guess can't distinguish "user dragged this taller" from "prior default
 *  baked itself in". The user can immediately drag taller again if they
 *  want a roomy panel; double-clicking the resize handle snaps to default. */
const MIGRATION_KEY = "forgeboard.layout.migrated_v3";

/** The live, in-memory sizes — the source of truth between drags. */
const sizes: Record<PanelSpec["key"], number> = {
  sidebarWidth: SIDEBAR.default,
  bottomPanelHeight: BOTTOM_PANEL.default,
};

/**
 * The largest size `spec` may take right now: its static `max`, further
 * capped so at least `reserve` px of the window axis stays free. Never returns
 * below `min`, so clamping against it is valid even on a tiny window.
 */
function effectiveMax(spec: PanelSpec): number {
  const viewport =
    spec.axis === "width" ? window.innerWidth : window.innerHeight;
  return Math.max(spec.min, Math.min(spec.max, viewport - spec.reserve));
}

/** Round `n` and clamp it into `spec`'s currently allowed range. */
export function clampSize(spec: PanelSpec, n: number): number {
  return Math.min(effectiveMax(spec), Math.max(spec.min, Math.round(n)));
}

/** The current size of `spec`, in CSS pixels. */
export function getSize(spec: PanelSpec): number {
  return sizes[spec.key];
}

/** Write `spec`'s CSS variable so the layout reflects the in-memory size. */
function applyVar(spec: PanelSpec): void {
  document.documentElement.style.setProperty(
    spec.cssVar,
    `${sizes[spec.key]}px`,
  );
}

/**
 * Set `spec`'s size and update the layout immediately, without persisting.
 * Used for the live frames of a drag, where a localStorage write on every
 * pointer-move would be wasteful.
 */
export function applySize(spec: PanelSpec, n: number): void {
  sizes[spec.key] = clampSize(spec, n);
  applyVar(spec);
}

/** Best-effort write of all panel sizes to localStorage. */
function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
  } catch {
    // Storage full or unavailable — sizes just won't survive a restart.
  }
}

/**
 * Set `spec`'s size, update the layout, and persist. Used when a drag ends
 * and for double-click-to-reset — anything that should outlive the session.
 */
export function commitSize(spec: PanelSpec, n: number): void {
  applySize(spec, n);
  persist();
}

/**
 * Hydrate the saved sizes from localStorage and apply them to the document.
 * Call once, before the first render, so the layout never flashes a default
 * size and then jumps to the stored one.
 */
export function initLayout(): void {
  let stored: unknown;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    stored = raw === null ? null : JSON.parse(raw);
  } catch {
    stored = null; // missing localStorage or malformed JSON — use defaults
  }
  const obj =
    typeof stored === "object" && stored !== null
      ? (stored as Record<string, unknown>)
      : {};

  // One-time migration: the prior shipped default of 320 px (and a brief
  // "even bigger" build) baked itself into many installs via persist() on
  // first run, so a threshold-based reset can't reliably tell "user
  // dragged this" from "stale default". Reset bottomPanelHeight to spec
  // default unconditionally on this migration. Idempotent — keyed under
  // MIGRATION_KEY so it runs exactly once per install. The sidebar width
  // is left untouched; only the bottom panel was affected.
  let migrated = false;
  try {
    migrated = localStorage.getItem(MIGRATION_KEY) === "true";
  } catch {
    migrated = false;
  }
  if (!migrated) {
    obj[BOTTOM_PANEL.key] = BOTTOM_PANEL.default;
    try {
      localStorage.setItem(MIGRATION_KEY, "true");
    } catch {
      // If we can't record the migration, oh well — next launch tries again,
      // which is still safe because the reset is idempotent against the
      // freshly-written default.
    }
  }

  for (const spec of SPECS) {
    const saved = obj[spec.key];
    sizes[spec.key] =
      typeof saved === "number" && Number.isFinite(saved)
        ? clampSize(spec, saved)
        : spec.default;
    applyVar(spec);
  }
  // Persist whatever the migration resolved to, so the saved state matches
  // what the user actually sees on disk.
  persist();
}
