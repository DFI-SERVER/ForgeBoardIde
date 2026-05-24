# Quick Open (Ctrl+P) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a file-finder mode to the existing `CommandPalette` so Ctrl+P opens a fuzzy filename picker scoped to the current sketch, with recent-files empty state and VS Code-compatible prefix-mode switching.

**Architecture:** Approach A from the spec — extend `CommandPalette` with a `mode` discriminator instead of a separate modal. Shared mode signal in appState, mode-specific result providers, prefix characters in the input switch modes live. Tab-add reuses the existing `projectApi.readFile` + `openTabs` mutation pattern that `loadSketch` already exemplifies.

**Tech Stack:** Preact + `@preact/signals` + TypeScript + Vitest + `@testing-library/preact`. No new dependencies. No Rust-side work — fully frontend.

**Spec:** `docs/superpowers/specs/2026-05-24-quick-open-design.md`

---

## File Structure

**New files:**
- `src/lib/file-icons.ts` — shared `iconForName(path)` helper (lucide icon picker by extension), used by TabBar, FileSidebar, and the new file-mode palette row.
- `src/lib/quick-open-search.ts` — pure fuzzy matcher + ranker for filename lists. No Monaco, no signals.
- `tests/lib/file-icons.spec.ts` — exhaustive extension coverage.
- `tests/lib/quick-open-search.spec.ts` — scoring, ordering, edge cases.
- `tests/components/CommandPalette.spec.tsx` — extends existing component tests with file-mode scenarios. If a file under this exact name already exists, append; otherwise create.

**Modified files:**
- `src/state/appState.ts` — add `paletteMode` and `recentFilePaths` signals + tracking effect.
- `src/components/CommandPalette.tsx` — mode discriminator, prefix detection, two result providers, two select actions, initial-selection helper.
- `src/components/TabBar.tsx` — replace inline `iconForName` with the shared one.
- `src/components/FileSidebar.tsx` — replace inline extension regex with shared `iconForName`.
- `src/lib/keybindings.ts` — add the `file.quickOpen` keybinding (Ctrl+P).
- `src/main.tsx` — start the recent-files tracking effect alongside the other bootstrap calls.

---

## Task 1 — Shared `iconForName` in `src/lib/file-icons.ts`

**Files:**
- Create: `src/lib/file-icons.ts`
- Create: `tests/lib/file-icons.spec.ts`
- Modify: `src/components/TabBar.tsx` (lines 2-9 — replace inline iconForName)
- Modify: `src/components/FileSidebar.tsx` (lines ~232-235 — replace inline regex)

- [ ] **Step 1: Write the failing test**

Create `tests/lib/file-icons.spec.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { FileCode2, FileText } from "lucide-preact";
import { iconForName } from "../../src/lib/file-icons";

describe("iconForName", () => {
  it("returns FileCode2 for Arduino sketch extensions", () => {
    expect(iconForName("sketch.ino")).toBe(FileCode2);
    expect(iconForName("old.pde")).toBe(FileCode2);
  });

  it("returns FileCode2 for C/C++ extensions", () => {
    expect(iconForName("util.cpp")).toBe(FileCode2);
    expect(iconForName("driver.cxx")).toBe(FileCode2);
    expect(iconForName("legacy.cc")).toBe(FileCode2);
    expect(iconForName("plain.c")).toBe(FileCode2);
  });

  it("returns FileCode2 for header extensions", () => {
    expect(iconForName("pins.h")).toBe(FileCode2);
    expect(iconForName("config.hpp")).toBe(FileCode2);
    expect(iconForName("alt.hxx")).toBe(FileCode2);
  });

  it("is case-insensitive on the extension", () => {
    expect(iconForName("README.MD")).toBe(FileText);
    expect(iconForName("Sketch.INO")).toBe(FileCode2);
  });

  it("returns FileText for non-C-like files", () => {
    expect(iconForName("README.md")).toBe(FileText);
    expect(iconForName("library.properties")).toBe(FileText);
    expect(iconForName("keywords.txt")).toBe(FileText);
    expect(iconForName("data.json")).toBe(FileText);
    expect(iconForName("noext")).toBe(FileText);
  });

  it("works on full paths, not just basenames", () => {
    expect(iconForName("C:/sketches/blink/blink.ino")).toBe(FileCode2);
    expect(iconForName("/home/u/blink/README.md")).toBe(FileText);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/file-icons.spec.ts`
Expected: FAIL with "Cannot find module '../../src/lib/file-icons'"

- [ ] **Step 3: Write the implementation**

Create `src/lib/file-icons.ts`:

```typescript
import { FileCode2, FileText } from "lucide-preact";

type LucideIcon = typeof FileCode2;

/** Extensions whose contents the C-brace formatter and language-aware
 *  features apply to. Kept in one place so every component that shows a
 *  file-type icon — tabs, sidebar, palette rows — uses the same test. */
export const C_LIKE_EXT = /\.(ino|pde|cpp|cxx|cc|c|h|hpp|hxx)$/i;

/** Pick a lucide icon from `path`'s file extension. Anything with a C-family
 *  extension gets the code icon; everything else gets the generic text icon. */
export function iconForName(path: string): LucideIcon {
  return C_LIKE_EXT.test(path) ? FileCode2 : FileText;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/lib/file-icons.spec.ts`
Expected: PASS — all 6 cases.

- [ ] **Step 5: Refactor TabBar to use the shared helper**

In `src/components/TabBar.tsx`, replace the import block and the inline `iconForName`:

```typescript
// At the top, change the import from:
//   import { X, FileCode2, FileText } from "lucide-preact";
// to:
import { X } from "lucide-preact";
import { iconForName } from "../lib/file-icons";

// Delete the local `iconForName` function (lines after the imports).
```

- [ ] **Step 6: Refactor FileSidebar to use the shared helper**

In `src/components/FileSidebar.tsx`, where the file row currently does:

```typescript
const isC = /\.(ino|pde|cpp|cxx|cc|c|h|hpp|hxx)$/i.test(f.name);
const Icon = isC ? FileCode2 : FileText;
```

Replace with:

```typescript
import { iconForName } from "../lib/file-icons";
// ... then inside the map:
const Icon = iconForName(f.name);
```

Also delete the `FileText` import from the `lucide-preact` line since `iconForName` re-exports it implicitly (only `FileCode2` is still used for the explicit "main sketch file" affordance — keep that import).

- [ ] **Step 7: Run the existing test suite to ensure no regressions**

Run: `pnpm test`
Expected: every previously-passing test still passes (307+ tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/file-icons.ts tests/lib/file-icons.spec.ts src/components/TabBar.tsx src/components/FileSidebar.tsx
git commit -m "refactor: extract iconForName into lib/file-icons.ts"
```

---

## Task 2 — Fuzzy filename matcher in `src/lib/quick-open-search.ts`

**Files:**
- Create: `src/lib/quick-open-search.ts`
- Create: `tests/lib/quick-open-search.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/quick-open-search.spec.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { scoreMatch, rankFiles } from "../../src/lib/quick-open-search";

describe("scoreMatch", () => {
  it("returns 0 when the query is not a subsequence of the name", () => {
    expect(scoreMatch("xyz", "sketch.ino")).toBe(0);
  });

  it("returns a positive score for a subsequence match", () => {
    expect(scoreMatch("skt", "sketch.ino")).toBeGreaterThan(0);
  });

  it("rewards matches that start at the beginning of the name", () => {
    const startBonus = scoreMatch("ske", "sketch.ino");
    const midMatch = scoreMatch("ske", "my-sketch.ino");
    expect(startBonus).toBeGreaterThan(midMatch);
  });

  it("rewards matches at token boundaries (after _ - .)", () => {
    const atBoundary = scoreMatch("c", "my-config.h");
    const inMiddle = scoreMatch("c", "matrix.h");
    expect(atBoundary).toBeGreaterThan(inMiddle);
  });

  it("rewards consecutive runs of matched characters", () => {
    const consecutive = scoreMatch("blink", "blink.ino");
    const gappy = scoreMatch("blnk", "blink.ino");
    expect(consecutive).toBeGreaterThan(gappy);
  });

  it("rewards a query that prefix-matches the extension", () => {
    const extMatch = scoreMatch("ino", "sketch.ino");
    const noExt = scoreMatch("ino", "innominate.h");
    expect(extMatch).toBeGreaterThan(noExt);
  });

  it("is case-insensitive", () => {
    expect(scoreMatch("SKE", "sketch.ino")).toBe(scoreMatch("ske", "sketch.ino"));
  });

  it("treats an empty query as a no-op (returns 0)", () => {
    expect(scoreMatch("", "anything.ino")).toBe(0);
  });
});

describe("rankFiles", () => {
  const files = [
    { path: "/s/blink.ino", name: "blink.ino" },
    { path: "/s/secrets.h", name: "secrets.h" },
    { path: "/s/util.cpp", name: "util.cpp" },
    { path: "/s/README.md", name: "README.md" },
  ];

  it("returns the input unchanged for an empty query", () => {
    const result = rankFiles(files, "");
    expect(result).toEqual(files);
  });

  it("filters out non-matches", () => {
    const result = rankFiles(files, "zzz");
    expect(result).toEqual([]);
  });

  it("ranks better matches higher", () => {
    const result = rankFiles(files, "ut");
    // util.cpp matches "ut" at the start; secrets.h matches as a far-apart
    // subsequence (u? - no `u` actually; just check util is first).
    expect(result[0]!.name).toBe("util.cpp");
  });

  it("breaks ties by filename ascending", () => {
    const dups = [
      { path: "/s/b.ino", name: "b.ino" },
      { path: "/s/a.ino", name: "a.ino" },
    ];
    const result = rankFiles(dups, "ino");
    // Both score identically on the extension prefix bonus; alphabetical tie-break.
    expect(result.map((f) => f.name)).toEqual(["a.ino", "b.ino"]);
  });

  it("caps results at 50", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      path: `/s/file_${i}.ino`,
      name: `file_${i}.ino`,
    }));
    const result = rankFiles(many, "ino");
    expect(result.length).toBe(50);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run tests/lib/quick-open-search.spec.ts`
Expected: FAIL with "Cannot find module '../../src/lib/quick-open-search'".

- [ ] **Step 3: Write the implementation**

Create `src/lib/quick-open-search.ts`:

```typescript
/**
 * Quick Open — fuzzy filename matcher.
 *
 * The scoring model follows fzy's three preferences (matches at the start of
 * names / after a token boundary, consecutive runs of matched characters,
 * shorter spans) and adds an extension-prefix bonus that's helpful for
 * filename navigation specifically. See
 * https://github.com/jhawthorn/fzy/blob/master/ALGORITHM.md.
 *
 * The matcher is case-insensitive and treats the query as a literal
 * subsequence — no regex characters carry special meaning.
 */

/** Result cap — bounds the rendered list defensively for huge sketches. */
export const MAX_RESULTS = 50;

/** A file usable as a Quick Open candidate. The interface is intentionally
 *  narrower than the full `SketchFile`: `path` is the stable key, `name` is
 *  what gets matched and rendered. */
export interface QuickOpenFile {
  path: string;
  name: string;
}

const BOUNDARY_RE = /[_\-./]/;

/** Score how well `query` matches `name`. 0 means no match. */
export function scoreMatch(query: string, name: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const n = name.toLowerCase();

  let score = 0;
  let qi = 0;
  let firstMatchAt = -1;
  let lastMatchAt = -1;
  let prevWasMatch = false;

  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] !== q[qi]) {
      prevWasMatch = false;
      continue;
    }
    if (firstMatchAt === -1) firstMatchAt = i;
    lastMatchAt = i;

    // Boundary bonus: start of name, or the character before is a boundary.
    const atBoundary = i === 0 || BOUNDARY_RE.test(n[i - 1]);
    if (atBoundary) score += 20;

    // Consecutive-run bonus.
    if (prevWasMatch) score += 10;

    qi++;
    prevWasMatch = true;
  }

  if (qi < q.length) return 0; // not a complete subsequence

  // Gap penalty: discourage scattered matches.
  const span = lastMatchAt - firstMatchAt + 1;
  score -= span - q.length;

  // Extension-prefix bonus.
  const dot = n.lastIndexOf(".");
  if (dot >= 0 && n.slice(dot + 1).startsWith(q)) score += 5;

  return Math.max(1, score);
}

/** Rank `files` by their match against `query`. Empty query returns the
 *  list as-is (caller is responsible for the recents / all-files fallback). */
export function rankFiles<F extends QuickOpenFile>(
  files: readonly F[],
  query: string,
): F[] {
  if (!query.trim()) return files.slice();

  const scored: { file: F; score: number }[] = [];
  for (const file of files) {
    const score = scoreMatch(query, file.name);
    if (score > 0) scored.push({ file, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.file.name.localeCompare(b.file.name);
  });

  return scored.slice(0, MAX_RESULTS).map((s) => s.file);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run tests/lib/quick-open-search.spec.ts`
Expected: PASS — all cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quick-open-search.ts tests/lib/quick-open-search.spec.ts
git commit -m "feat: fuzzy filename matcher for Quick Open"
```

---

## Task 3 — Recent files state in `src/state/appState.ts`

**Files:**
- Modify: `src/state/appState.ts` (add signal + tracking starter)
- Create: `tests/lib/recent-files.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/recent-files.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  pushRecentFilePath,
  recentFilePaths,
  MAX_RECENT_FILE_PATHS,
} from "../../src/state/appState";

beforeEach(() => {
  recentFilePaths.value = [];
});

describe("pushRecentFilePath", () => {
  it("pushes a new path to the front", () => {
    pushRecentFilePath("/s/a.ino");
    pushRecentFilePath("/s/b.h");
    expect(recentFilePaths.value).toEqual(["/s/b.h", "/s/a.ino"]);
  });

  it("dedups — pushing an existing path moves it to the front without growing", () => {
    pushRecentFilePath("/s/a.ino");
    pushRecentFilePath("/s/b.h");
    pushRecentFilePath("/s/a.ino");
    expect(recentFilePaths.value).toEqual(["/s/a.ino", "/s/b.h"]);
  });

  it("trims to the documented cap", () => {
    for (let i = 0; i < MAX_RECENT_FILE_PATHS + 4; i++) {
      pushRecentFilePath(`/s/f${i}.ino`);
    }
    expect(recentFilePaths.value.length).toBe(MAX_RECENT_FILE_PATHS);
    // The oldest are dropped; the newest 4 are still there.
    expect(recentFilePaths.value[0]).toBe(`/s/f${MAX_RECENT_FILE_PATHS + 3}.ino`);
  });

  it("ignores an empty path", () => {
    pushRecentFilePath("");
    expect(recentFilePaths.value).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/lib/recent-files.spec.ts`
Expected: FAIL with "pushRecentFilePath is not exported" or similar.

- [ ] **Step 3: Add the signal + helper to appState**

In `src/state/appState.ts`, add near the other tab-related signals (after `activeTabIndex`):

```typescript
/** Maximum number of recently-focused file paths tracked. The buffer is
 *  larger than the Quick Open empty-state list (8) so that filtering to
 *  the current sketch's membership still leaves a useful number of recents
 *  to show after other sketches' entries are excluded. */
export const MAX_RECENT_FILE_PATHS = 16;

/** Most-recently-focused file paths, newest first. Persisted to localStorage
 *  via the same `forgeboard.recent-files` key the tracking module rehydrates
 *  from on boot. Source of truth for Quick Open's empty state. */
export const recentFilePaths = signal<string[]>([]);

/** Push `path` to the front of the recents list, dedup, and trim to
 *  MAX_RECENT_FILE_PATHS. No-op on empty input. */
export function pushRecentFilePath(path: string): void {
  if (!path) return;
  const cur = recentFilePaths.value;
  const filtered = cur.filter((p) => p !== path);
  filtered.unshift(path);
  if (filtered.length > MAX_RECENT_FILE_PATHS) {
    filtered.length = MAX_RECENT_FILE_PATHS;
  }
  recentFilePaths.value = filtered;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/lib/recent-files.spec.ts`
Expected: PASS — all cases.

- [ ] **Step 5: Add localStorage persistence + bootstrap tracker**

Create `src/lib/recent-files.ts`:

```typescript
/**
 * Recent-files tracking — persists the global recent file paths list across
 * app restarts and pushes the active tab's path to the front whenever it
 * changes. Wired from main.tsx alongside the other lifecycle bootstraps.
 */
import { effect } from "@preact/signals";
import {
  recentFilePaths,
  pushRecentFilePath,
  openTabs,
  activeTabIndex,
  MAX_RECENT_FILE_PATHS,
} from "../state/appState";

const STORAGE_KEY = "forgeboard.recent-files";

/** Read the persisted list, defensively. Bad data falls back to []. */
function loadPersisted(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => typeof p === "string" && p.length > 0)
      .slice(0, MAX_RECENT_FILE_PATHS);
  } catch {
    return [];
  }
}

/** Hydrate the signal from localStorage and start the tracking effect. */
export function startRecentFilesTracking(): void {
  const persisted = loadPersisted();
  if (persisted.length > 0) recentFilePaths.value = persisted;

  effect(() => {
    const tabs = openTabs.value;
    const i = activeTabIndex.value;
    const active = tabs[i];
    if (active) pushRecentFilePath(active.path);
  });

  // Write-through to localStorage on every change.
  effect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recentFilePaths.value));
    } catch {
      // Quota / unavailable — recents simply won't survive a restart.
    }
  });
}
```

- [ ] **Step 6: Wire the tracker into bootstrap**

In `src/main.tsx`, add the import and call alongside the other bootstrap functions:

```typescript
import { startRecentFilesTracking } from "./lib/recent-files";
// ... below startBoardWatch(); ...
startRecentFilesTracking();
```

- [ ] **Step 7: Run the full test suite to ensure nothing regressed**

Run: `pnpm test`
Expected: 311+ tests pass (4 new in recent-files.spec.ts; existing tests still pass).

- [ ] **Step 8: Commit**

```bash
git add src/state/appState.ts src/lib/recent-files.ts tests/lib/recent-files.spec.ts src/main.tsx
git commit -m "feat: track recent file paths with localStorage persistence"
```

---

## Task 4 — `paletteMode` signal + mode-aware opener

**Files:**
- Modify: `src/state/appState.ts` (add `paletteMode` signal + `openPalette` helper)
- Modify: every existing site that sets `paletteOpen.value = true` to use the helper.

- [ ] **Step 1: Add the mode signal + helper to appState**

In `src/state/appState.ts`, near the existing `paletteOpen` signal:

```typescript
/** Which palette flow is active. Set by openPalette(); read by CommandPalette
 *  to choose its result provider and select action. Defaults to "command"
 *  for backwards compatibility with existing Ctrl+Shift+P / Ctrl+K callers. */
export type PaletteMode = "command" | "file";
export const paletteMode = signal<PaletteMode>("command");

/** Open the palette in the requested mode. Single entry point so every
 *  trigger goes through one place. */
export function openPalette(mode: PaletteMode = "command"): void {
  paletteMode.value = mode;
  paletteOpen.value = true;
}
```

- [ ] **Step 2: Audit and update existing `paletteOpen.value = true` sites**

Run: `pnpm vitest run --reporter=verbose 2>&1 | head -5` then in a separate step Grep for the pattern.

Run this grep manually to locate every caller: `grep -rn "paletteOpen.value = true" src/`

Expected matches (update each to `openPalette()` — keeping the default "command" mode argument so behavior is unchanged):
- `src/lib/keybindings.ts` — the Ctrl+Shift+P and Ctrl+K bindings.
- Anywhere else surfaced by grep — replace identically.

For each occurrence, replace:

```typescript
paletteOpen.value = true;
```

with:

```typescript
openPalette();
```

And add the import where needed:

```typescript
import { openPalette } from "../state/appState";
```

- [ ] **Step 3: Run the full test suite — nothing should change yet**

Run: `pnpm test`
Expected: every previously-passing test still passes — `openPalette()` with no argument is behaviorally identical to setting `paletteOpen` directly.

- [ ] **Step 4: Commit**

```bash
git add src/state/appState.ts src/lib/keybindings.ts
git commit -m "refactor: introduce paletteMode + openPalette() helper"
```

---

## Task 5 — Ctrl+P keybinding

**Files:**
- Modify: `src/lib/keybindings.ts` (add the new entry)

- [ ] **Step 1: Locate the File-category block in keybindings.ts**

Read `src/lib/keybindings.ts` and find the existing `category: "File"` entries (New, Open, Save). The new binding goes adjacent to them.

- [ ] **Step 2: Add the new keybinding**

Add this entry to the keybindings array, in the File category section:

```typescript
{
  id: "file.quickOpen",
  combo: "Ctrl+P",
  label: "Quick Open File",
  category: "File",
  scope: "global",
  run: () => openPalette("file"),
},
```

The `openPalette` import is already added in Task 4.

- [ ] **Step 3: Verify the keybindings invariants test still passes**

Run: `pnpm vitest run tests/lib/keybindings.spec.ts` (if present) or `pnpm test`.
Expected: PASS — `keybindings.spec.ts` guards uniqueness, presence of `label`/`category`, etc.; the new entry satisfies them.

- [ ] **Step 4: Commit**

```bash
git add src/lib/keybindings.ts
git commit -m "feat: Ctrl+P keybinding opens palette in file mode"
```

---

## Task 6 — `CommandPalette` mode awareness

**Files:**
- Modify: `src/components/CommandPalette.tsx`

This task touches the existing palette structure. The strategy: introduce a `mode` discriminator + per-mode "result provider" function, leaving the modal chrome / keyboard nav unchanged. The current command-mode behavior must be preserved exactly.

- [ ] **Step 1: Read the current CommandPalette.tsx in full**

Read `src/components/CommandPalette.tsx` to refresh on the existing structure (paletteOpen guard, query state, results memo, keyboard handler, row rendering).

- [ ] **Step 2: Define the mode-agnostic result item shape and providers**

Add this section at the top of the file (above `CommandPaletteBody`):

```typescript
import { paletteOpen, paletteMode, currentSketch, recentFilePaths } from "../state/appState";
import { filterCommands, type Command } from "../lib/commands";
import { rankFiles, type QuickOpenFile } from "../lib/quick-open-search";
import { iconForName } from "../lib/file-icons";

/** Unified shape every palette row renders from. Mode-specific providers
 *  produce these so the rendering code is mode-agnostic. */
interface PaletteItem {
  id: string;
  title: string;
  category?: string;
  shortcut?: string;
  icon: LucideIcon;
  /** Run the row's action and close the palette. */
  onSelect: () => void;
}
```

Remove the existing `paletteOpen` and `filterCommands` imports if they were on separate lines, replacing with the consolidated import above.

- [ ] **Step 3: Replace the command-mode-only `iconFor` and results memo with mode-aware logic**

In `CommandPaletteBody`, replace the current `const results = useMemo(...)` block with this:

```typescript
const sketch = currentSketch.value;

// Detect a mode-switching prefix character at the very start of the query.
// `>` → command mode; no leading prefix (or any reserved future char) → file
// mode. The reserved future chars (@ # :) are recognized so typing them
// doesn't accidentally search for files literally — they fall through to
// the file-mode list with the prefix character stripped.
const FUTURE_PREFIXES = new Set(["@", "#", ":"]);
const liveMode: PaletteMode =
  query.startsWith(">") ? "command" : paletteMode.value;

const strippedQuery =
  query.startsWith(">") || FUTURE_PREFIXES.has(query[0] ?? "")
    ? query.slice(1)
    : query;

const items: PaletteItem[] = useMemo(() => {
  if (liveMode === "command") {
    return filterCommands(strippedQuery).map(commandToItem);
  }
  return fileResults(sketch, strippedQuery).map(fileToItem);
}, [liveMode, strippedQuery, sketch]);
```

- [ ] **Step 4: Add the per-mode helpers below `CommandPaletteBody`**

Append these helpers to the module:

```typescript
function commandToItem(command: Command): PaletteItem {
  return {
    id: command.id,
    title: command.title,
    category: command.category,
    shortcut: command.shortcut,
    icon: iconFor(command),
    onSelect: command.run,
  };
}

function fileToItem(file: QuickOpenFile & { sketch?: string }): PaletteItem {
  return {
    id: file.path,
    title: file.name,
    category: file.sketch,
    icon: iconForName(file.name),
    onSelect: () => openFileInTab(file.path, file.name),
  };
}

/** Compute the file-mode result set: rank by query, or show recents +
 *  fallback on empty query. */
function fileResults(
  sketch: { name: string; files: { path: string; name: string }[] } | null,
  query: string,
): (QuickOpenFile & { sketch: string })[] {
  if (!sketch) return [];
  const files: (QuickOpenFile & { sketch: string })[] = sketch.files.map(
    (f) => ({ path: f.path, name: f.name, sketch: sketch.name }),
  );

  const trimmed = query.trim();
  if (trimmed) return rankFiles(files, trimmed);

  // Empty-query empty state: prefer recents (filtered to this sketch);
  // fall back to all files in original order.
  const pathSet = new Map(files.map((f) => [f.path, f]));
  const recents = recentFilePaths.value
    .map((p) => pathSet.get(p))
    .filter((f): f is QuickOpenFile & { sketch: string } => f !== undefined)
    .slice(0, 8);
  return recents.length > 0 ? recents : files;
}

/** Open a file in a tab — switch to its tab if open, otherwise read it and
 *  append. Imported lazily so this module stays tree-shake-friendly. */
async function openFileInTab(path: string, name: string): Promise<void> {
  const { projectApi } = await import("../ipc/project");
  const { openTabs, activeTabIndex, fileContents, toast } = await import(
    "../state/appState"
  );

  const existingIdx = openTabs.value.findIndex((t) => t.path === path);
  if (existingIdx >= 0) {
    activeTabIndex.value = existingIdx;
    return;
  }
  try {
    const content = await projectApi.readFile(path);
    const newContents = new Map(fileContents.value);
    newContents.set(path, content);
    fileContents.value = newContents;
    openTabs.value = [...openTabs.value, { path, name, modified: false }];
    activeTabIndex.value = openTabs.value.length - 1;
  } catch (e) {
    toast.value = {
      text: `Couldn't open ${name}: ${String(e)}`,
      kind: "warn",
    };
  }
}
```

- [ ] **Step 5: Replace the row-rendering block with the unified PaletteItem rendering**

Replace the existing JSX that maps `results` to `<li>` rows with:

```tsx
{items.length === 0 ? (
  <PaletteEmptyState mode={liveMode} hasQuery={strippedQuery.length > 0} />
) : (
  <ul class="palette-results" ref={listRef} role="listbox">
    {items.map((item, i) => {
      const Icon = item.icon;
      return (
        <li
          key={item.id}
          class={`palette-row ${i === activeIndex ? "active" : ""}`}
          role="option"
          aria-selected={i === activeIndex}
          onMouseMove={() => setSelected(i)}
          onClick={() => runAt(i)}
        >
          <span class="palette-row-icon">
            <Icon size={16} strokeWidth={1.5} />
          </span>
          <span class="palette-row-title">{item.title}</span>
          {item.category && (
            <span class="palette-row-category">{item.category}</span>
          )}
          {item.shortcut && (
            <span class="palette-row-shortcut">{item.shortcut}</span>
          )}
        </li>
      );
    })}
  </ul>
)}
```

- [ ] **Step 6: Update `runAt` to call the item's `onSelect`**

Replace `command.run()` with `item.onSelect()`:

```typescript
const runAt = (index: number) => {
  const item = items[index];
  if (!item) return;
  close();
  item.onSelect();
};
```

- [ ] **Step 7: Add the `PaletteEmptyState` subcomponent below the body**

```tsx
function PaletteEmptyState({ mode, hasQuery }: { mode: PaletteMode; hasQuery: boolean }) {
  if (!hasQuery && mode === "file") {
    // Should not happen — files mode always has recents or all-files —
    // but render a sensible message just in case.
    return (
      <div class="palette-empty">
        <span class="palette-empty-icon">
          <SearchX size={22} strokeWidth={1.5} />
        </span>
        <span>No files in this sketch.</span>
      </div>
    );
  }
  if (mode === "file") {
    return (
      <div class="palette-empty">
        <span class="palette-empty-icon">
          <SearchX size={22} strokeWidth={1.5} />
        </span>
        <span>No matching files.</span>
        <span class="palette-empty-hint">
          Try a different query or <code>&gt;</code> for commands.
        </span>
      </div>
    );
  }
  // Command mode: unchanged copy.
  return (
    <div class="palette-empty">
      <span class="palette-empty-icon">
        <SearchX size={22} strokeWidth={1.5} />
      </span>
      <span>No matching commands</span>
    </div>
  );
}
```

- [ ] **Step 8: Add the placeholder swap based on mode**

Change the `placeholder` attribute of the input from the static string to:

```tsx
placeholder={liveMode === "file" ? "Go to file…" : "Type a command…"}
```

- [ ] **Step 9: Add `palette-empty-hint` CSS**

In `src/components/CommandPalette.css`, append:

```css
.palette-empty-hint {
  color: var(--fg-subtle);
  font-size: var(--text-xs);
  text-align: center;
}
.palette-empty-hint code {
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  padding: 0 var(--space-2);
  background: var(--surface-3);
  border-radius: var(--radius-sm);
}
```

- [ ] **Step 10: Add initial-selection logic for the Ctrl+P-twice pattern**

In `CommandPaletteBody`, replace `const [selected, setSelected] = useState(0);` with:

```typescript
// On open in file mode with empty query, pre-select index 1 when there are
// at least 2 recents — this implements the "Ctrl+P, Enter" toggle-to-last-
// file muscle memory from VS Code.
const initialSelected = useMemo(() => {
  if (paletteMode.value !== "file") return 0;
  if (query.length > 0) return 0;
  const recentsInSketch = sketch
    ? recentFilePaths.value.filter((p) =>
        sketch.files.some((f) => f.path === p),
      )
    : [];
  return recentsInSketch.length >= 2 ? 1 : 0;
}, []);
const [selected, setSelected] = useState(initialSelected);
```

- [ ] **Step 11: Run the existing palette tests to verify command mode is unchanged**

Run: `pnpm vitest run tests/components/CommandPalette.spec.tsx`
Expected: PASS — every prior test still passes (filtering, keyboard nav, escape).

- [ ] **Step 12: Run the full suite**

Run: `pnpm test`
Expected: every prior test passes.

- [ ] **Step 13: Commit**

```bash
git add src/components/CommandPalette.tsx src/components/CommandPalette.css
git commit -m "feat: CommandPalette gains a mode-aware result pipeline"
```

---

## Task 7 — Component tests for file mode

**Files:**
- Modify: `tests/components/CommandPalette.spec.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `tests/components/CommandPalette.spec.tsx` (create the file if not present, using the existing palette test as a template):

```typescript
import { render, screen, fireEvent } from "@testing-library/preact";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { CommandPalette } from "../../src/components/CommandPalette";
import {
  paletteOpen,
  paletteMode,
  currentSketch,
  openTabs,
  activeTabIndex,
  fileContents,
  recentFilePaths,
} from "../../src/state/appState";

beforeEach(() => {
  paletteOpen.value = false;
  paletteMode.value = "command";
  openTabs.value = [];
  activeTabIndex.value = 0;
  fileContents.value = new Map();
  recentFilePaths.value = [];
  currentSketch.value = {
    name: "demo",
    path: "/s/demo",
    files: [
      { path: "/s/demo/blink.ino", name: "blink.ino", is_main: true },
      { path: "/s/demo/secrets.h", name: "secrets.h", is_main: false },
      { path: "/s/demo/util.cpp", name: "util.cpp", is_main: false },
    ],
  } as any;
});

describe("CommandPalette — file mode", () => {
  it("renders the sketch's files when opened in file mode with empty query", () => {
    paletteMode.value = "file";
    paletteOpen.value = true;
    render(<CommandPalette />);
    expect(screen.getByText("blink.ino")).toBeInTheDocument();
    expect(screen.getByText("secrets.h")).toBeInTheDocument();
    expect(screen.getByText("util.cpp")).toBeInTheDocument();
  });

  it("filters files as the user types", () => {
    paletteMode.value = "file";
    paletteOpen.value = true;
    render(<CommandPalette />);
    const input = screen.getByLabelText(/search/i) as HTMLInputElement;
    fireEvent.input(input, { target: { value: "secr" } });
    expect(screen.getByText("secrets.h")).toBeInTheDocument();
    expect(screen.queryByText("blink.ino")).not.toBeInTheDocument();
  });

  it("typing `>` switches to command mode (placeholder copy changes)", () => {
    paletteMode.value = "file";
    paletteOpen.value = true;
    render(<CommandPalette />);
    const input = screen.getByLabelText(/search/i) as HTMLInputElement;
    expect(input.placeholder).toBe("Go to file…");
    fireEvent.input(input, { target: { value: ">" } });
    expect(input.placeholder).toBe("Type a command…");
  });

  it("shows the no-matches state when query doesn't match", () => {
    paletteMode.value = "file";
    paletteOpen.value = true;
    render(<CommandPalette />);
    const input = screen.getByLabelText(/search/i) as HTMLInputElement;
    fireEvent.input(input, { target: { value: "xyz" } });
    expect(screen.getByText("No matching files.")).toBeInTheDocument();
  });

  it("Enter on an already-open file switches to that tab", () => {
    openTabs.value = [
      { path: "/s/demo/blink.ino", name: "blink.ino", modified: false },
      { path: "/s/demo/secrets.h", name: "secrets.h", modified: false },
    ];
    activeTabIndex.value = 0;
    paletteMode.value = "file";
    paletteOpen.value = true;
    render(<CommandPalette />);
    const input = screen.getByLabelText(/search/i) as HTMLInputElement;
    fireEvent.input(input, { target: { value: "secr" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // Allow the lazy openFileInTab dynamic import to resolve before asserting.
    return Promise.resolve().then(() => {
      expect(activeTabIndex.value).toBe(1);
    });
  });
});
```

- [ ] **Step 2: Run the new tests to verify they pass against the implementation from Task 6**

Run: `pnpm vitest run tests/components/CommandPalette.spec.tsx`
Expected: PASS — the new "file mode" describe block plus every prior test.

- [ ] **Step 3: Commit**

```bash
git add tests/components/CommandPalette.spec.tsx
git commit -m "test: CommandPalette file-mode coverage"
```

---

## Task 8 — Smoke verification + final build

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: every test in every file passes. Net new tests across the plan: ~25.

- [ ] **Step 2: Run the TypeScript + Vite build**

Run: `pnpm build`
Expected: `✓ built in <N>s` — no type errors, no missing imports. Pre-existing chunk-size warning is fine.

- [ ] **Step 3: Manual dev-mode smoke (optional but recommended)**

Run: `pnpm tauri dev`
Then in the running app:
- Press Ctrl+P → palette opens with "Go to file…" placeholder
- See the sketch's files listed
- Type a partial filename → list narrows in score order
- Press Enter → that file opens (or switches if already open)
- Press Ctrl+P, press Enter → toggles to the previously-focused file (when ≥2 recents exist)
- Press Ctrl+P, type `>`, type `save` → command mode kicks in, finds the Save command
- Press Ctrl+Shift+P → opens in command mode with "Type a command…" placeholder

If any of these don't behave as described, halt and report the deviation.

- [ ] **Step 4: Final commit and tag (no code change)**

```bash
git log --oneline -10
```

Expected: the recent commits read as a clean sequence:
- `refactor: extract iconForName into lib/file-icons.ts`
- `feat: fuzzy filename matcher for Quick Open`
- `feat: track recent file paths with localStorage persistence`
- `refactor: introduce paletteMode + openPalette() helper`
- `feat: Ctrl+P keybinding opens palette in file mode`
- `feat: CommandPalette gains a mode-aware result pipeline`
- `test: CommandPalette file-mode coverage`

No final commit needed unless the smoke surfaced something — in which case fix and re-run from the relevant task.

---

## Notes for the executing agent

- **`LucideIcon` type**: The CommandPalette already declares this type alias (`type LucideIcon = typeof Search;`). Keep it; the new code reuses it.
- **TypeScript strict mode**: This project has strict TS. Every new function declares its parameter and return types explicitly.
- **Test runner**: Vitest is configured in jsdom mode (see `vitest.config.ts`). The setup file at `tests/setup.ts` stubs Monaco's `queryCommandSupported` and provides a localStorage shim. Both new component tests transitively load Monaco — that's fine.
- **No new dependencies**: Every required package is already in `package.json` (`lucide-preact`, `@preact/signals`, `monaco-editor`, `@tauri-apps/api`, etc.).
- **Avoid touching FileSidebar tests**: Task 1's FileSidebar change is mechanical (regex → helper). The existing FileSidebar tests cover the surface they exercised and should still pass; do not add new tests for that refactor.
- **`Sketch` shape**: The exact shape comes from `src/ipc/project.ts`. The component test uses `as any` to satisfy TypeScript without re-declaring; in production code rely on the imported type.
