/**
 * Board options — the per-board menu choices a platform declares in its
 * boards.txt (USB CDC On Boot, Partition Scheme, Flash Size, Upload Speed,
 * PSRAM, …). Arduino IDE shows them under Tools; here they live in a menu
 * next to the board selector.
 *
 * A choice is stored per bare board id (`esp32:esp32:esp32s3`) as
 * `{ option: value }` and appended to the FQBN at build time as
 * `esp32:esp32:esp32s3:CDCOnBoot=cdc,PartitionScheme=huge_app`. Only
 * non-default choices are stored, so a board with nothing chosen builds
 * exactly as before.
 *
 * Pure functions here are unit-tested; the menu component only renders.
 */
import { effect, signal } from "@preact/signals";
import type { BoardOption } from "@/ipc/arduino";

/** Chosen option values, keyed by bare FQBN. */
export const boardOptions = signal<Record<string, Record<string, string>>>({});

/** Options each board offers, keyed by bare FQBN — fetched once per board. */
export const boardOptionCatalog = signal<Record<string, BoardOption[]>>({});

const STORAGE_KEY = "forgeboard.board-options";

/** `vendor:arch:board` without any `:opt=val` suffix. */
export function baseFqbn(fqbn: string): string {
  return fqbn.split(":").slice(0, 3).join(":");
}

/** The `opt=val` pairs already present in an FQBN, if any. */
export function parseFqbnOptions(fqbn: string): Record<string, string> {
  const tail = fqbn.split(":")[3];
  const out: Record<string, string> = {};
  if (!tail) return out;
  for (const pair of tail.split(",")) {
    const [k, v] = pair.split("=");
    if (k && v) out[k] = v;
  }
  return out;
}

/**
 * Compose the FQBN arduino-cli should build with. Keys are sorted so the
 * same choices always yield the same string (the memory-history bucket and
 * sketch.yaml comparisons rely on that). Empty values are dropped.
 */
export function composeFqbn(base: string, options: Record<string, string> | undefined): string {
  const pairs = Object.entries(options ?? {})
    .filter(([k, v]) => k && v)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return pairs.length ? `${base}:${pairs.join(",")}` : base;
}

/**
 * The value a board option is effectively built with: the user's choice,
 * else the one rule the backend applies on its own (`fqbn.rs`: an ESP32-S3
 * with no CDCOnBoot gets `cdc`, so Serial reaches the USB port), else the
 * platform default. Shown as the current selection in the menu.
 */
export function effectiveOptionValue(
  base: string,
  option: BoardOption,
  chosen: Record<string, string> | undefined,
): string {
  const picked = chosen?.[option.option];
  if (picked) return picked;
  if (base === "esp32:esp32:esp32s3" && option.option === "CDCOnBoot") return "cdc";
  return option.values.find((v) => v.selected)?.value ?? option.values[0]?.value ?? "";
}

/** How many options differ from the platform default — the menu badge. */
export function changedCount(options: BoardOption[], chosen: Record<string, string> | undefined): number {
  if (!chosen) return 0;
  return options.filter((o) => {
    const v = chosen[o.option];
    if (!v) return false;
    const def = o.values.find((x) => x.selected)?.value;
    return v !== def;
  }).length;
}

/** Set one option for a board; an empty value clears the choice. */
export function setBoardOption(base: string, option: string, value: string): void {
  const all = { ...boardOptions.value };
  const forBoard = { ...(all[base] ?? {}) };
  if (value) forBoard[option] = value;
  else delete forBoard[option];
  if (Object.keys(forBoard).length) all[base] = forBoard;
  else delete all[base];
  boardOptions.value = all;
}

export function clearBoardOptions(base: string): void {
  const all = { ...boardOptions.value };
  delete all[base];
  boardOptions.value = all;
}

function isStringMap(x: unknown): x is Record<string, string> {
  return !!x && typeof x === "object" && Object.values(x as object).every((v) => typeof v === "string");
}

/** Read persisted choices; anything malformed falls back to none. */
export function loadBoardOptions(storage: Pick<Storage, "getItem"> = localStorage): Record<string, Record<string, string>> {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, Record<string, string>> = {};
    for (const [k, v] of Object.entries(parsed as object)) {
      if (isStringMap(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

let wired = false;
/** Hydrate from localStorage and write every change back. Idempotent. */
export function startBoardOptionsTracking(): void {
  if (wired) return;
  wired = true;
  boardOptions.value = loadBoardOptions();
  effect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(boardOptions.value));
    } catch {
      /* storage unavailable — choices won't survive a restart */
    }
  });
}
