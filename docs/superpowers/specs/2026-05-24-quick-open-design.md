# Quick Open (Ctrl+P) — Design

**Date:** 2026-05-24
**Status:** Approved, ready for implementation plan
**Scope:** Current-sketch file finder in the existing `CommandPalette` modal

## Motivation

ForgeBoard's `CommandPalette` already covers action commands (Ctrl+Shift+P).
Quick Open is the second universally-expected palette flow in 2026 IDEs — type
a few characters of a filename, hit Enter, the file opens. It's the highest
daily-feel win in the Phase 3 queue, and it sets up Go to Symbol (Ctrl+Shift+O)
as a third mode of the same modal.

## Research backing

Every design choice in this spec is anchored to established patterns in widely
used editors and to canonical fuzzy-matching literature:

- **Ctrl+P as the Quick Open trigger** — VS Code's documented default
  ([VS Code keyboard shortcuts PDF](https://code.visualstudio.com/shortcuts/keyboard-shortcuts-windows.pdf)),
  matched by Sublime Text, Cursor, Windsurf, and Zed.
- **Prefix-driven modes (`>`, `@`, `#`, `:`) inside a single palette** —
  established VS Code convention:
  ([VS Code tips & tricks](https://code.visualstudio.com/docs/getstarted/tips-and-tricks)).
  VS Code uses `>` for commands, `@` for symbols in current file, `#` for
  workspace symbols, `:` for go-to-line, no prefix for files. This spec
  adopts that vocabulary so users coming from VS Code feel at home.
- **Fuzzy subsequence matching with token-boundary and consecutive-run
  bonuses** — the scoring approach used by fzy (the well-studied terminal
  fuzzy finder)
  ([fzy ALGORITHM.md](https://github.com/jhawthorn/fzy/blob/master/ALGORITHM.md)).
  fzy's three primary preferences are: matches at the start of words,
  consecutive matches, and shorter matches. The scoring in this spec
  encodes the first two directly and the third indirectly via a per-gap
  penalty.
- **Recent files in the empty state** — VS Code's Quick Open opens with
  recently used files when the query is empty, the same affordance Zed
  and Cursor inherit through the same lineage.

## Approach

Three options were considered:

- **A. Extend `CommandPalette` with a "mode" concept** (chosen)
- B. New `QuickOpen` component sharing only CSS with the palette
- C. Sublime-style inline overlay anchored above the editor

Approach A wins on three axes: smallest diff (reuses modal, input, keyboard
nav, virtualization, focus management), consistent UX across palette flows,
and a clean extension point for `@` symbol mode later. The cost is one extra
piece of state inside `CommandPalette` — a `mode` discriminator — and a result
provider per mode.

## Triggers

- **Ctrl+P** → opens palette in **file** mode
- **Ctrl+Shift+P** → opens palette in **command** mode (existing behavior, unchanged)
- Inside the palette, prefix characters reset the mode live. Vocabulary
  matches VS Code's so the muscle memory transfers:
  - `>` → command mode
  - no prefix → file mode (VS Code's default; this spec drops the `?`
    prefix to stay closer to the convention)
  - `@` → reserved for Go to Symbol (Phase 3.2); recognized in this spec as
    a no-op route to the file mode so users who type `@` early see no
    broken state.
  - `#` → reserved for workspace symbols; not yet wired.
  - `:` → reserved for go-to-line; not yet wired.

When the user backspaces past a prefix character, the mode reverts to whatever
the palette was opened in.

## Search

**Source.** `currentSketch.value.files` from `state/appState.ts`. Already in
memory, no IPC, no async loading.

**Algorithm.** A small fuzzy subsequence matcher (~30–50 LOC) producing a
score per (query, filename) pair:

1. Subsequence test — query characters appear in order inside the filename.
   No match → score 0, drop.
2. Bonuses:
   - +20 per character matched at a token boundary (start of name, after `_`/`-`/`.`)
   - +10 per consecutive-character run length-1
   - +5 if the query equals (or is a prefix of) the file extension
3. Penalty: -1 per character of gap between matched positions.

The existing `src/lib/project-search.ts` will be inspected first; if its API
fits, the new mode reuses it. Otherwise the matcher lives in
`src/lib/quick-open-search.ts` and is unit-tested standalone.

**Sort.** Score descending, then filename ascending for stable ties.

**Result cap.** No cap — the current-sketch source is bounded (typically
<20 files). A cap of 50 is hardcoded as a defense for unusual sketches with
many files; results beyond that are truncated silently.

## Empty state

When the query is empty:

1. If recently-focused files exist (see below), show the last 8.
2. Otherwise show all sketch files in their `currentSketch.files` order
   (with the main `.ino` first, matching the existing sidebar order).

**Initial selection on open.** Mirrors VS Code's `workbench.action.quick
OpenPreviousEditor` muscle memory ([VS Code tips & tricks](https://code.visualstudio.com/docs/getstarted/tips-and-tricks)):
when the palette opens with an empty query AND the recent-files list has at
least two entries belonging to the current sketch, the **second** result is
pre-selected (i.e. the previously-focused file, since the currently-focused
one sits at index 0). With fewer than two recents, index 0 is selected as
usual. This makes "Ctrl+P, Enter" toggle to the last file in one motion —
the most common navigation pattern in VS Code workflows.

**Recent-files tracking.** A new `recentFilePaths: Signal<string[]>` in
`state/appState.ts`. Updated on every `activeTabIndex` change to push the
focused tab's path to the front of the list (dedup) and trim to 16 entries.
Persisted to localStorage via the existing settings/layout persistence pattern
so the recent list survives a reload. The stored list is global (not per-
sketch) — when the palette opens, entries are filtered to the current
sketch's `files[]` membership. The 16-entry buffer (vs. 8 shown) means that
even when several recents belong to other sketches, the current sketch
usually still has 8 to show.

## No-matches state

When the user has typed a non-empty query that matches zero files, the result
list renders a two-line quiet message in place of rows:

```
No matching files.
Try a different query or `>` for commands.
```

- First line in `--fg-muted`, second in `--fg-subtle`.
- No icon, no illustration — consistent with ForgeBoard's monochrome restraint
  and matching the Linear / Notion empty-state convention of "blend into the
  interface, don't shout"
  ([Eleken empty-state UX](https://www.eleken.co/blog-posts/empty-state-ux)).
- Implemented via the same DOM hook as the existing
  `.palette-empty` block so we don't duplicate the empty-state pattern.

## Result row

Reuses the existing `.palette-row` CSS for visual consistency with command
mode. One row per file:

```
[icon]  filename                  trailing
```

- **Icon** — `FileCode2` for `.ino|.pde|.cpp|.cxx|.cc|.c|.h|.hpp|.hxx`,
  `FileText` otherwise. Same extension test the TabBar uses; factored into a
  small `iconForName(path)` helper in `lib/file-icons.ts` so both components
  share one definition.
- **Filename** — the file's `name` field, ellipsis on overflow.
- **Trailing** — the sketch's name in `--fg-subtle`. Today this is always the
  current sketch; the slot is preserved so a future sketchbook-wide scope can
  put folder context here without a layout change.

## Selection behavior

- **Enter / click**:
  - If file is already an open tab → set `activeTabIndex` to that index.
  - Else → append to `openTabs`, read the file via `projectApi.readFile`,
    update `fileContents`, set `activeTabIndex` to the new tab. (Mirrors the
    existing FileSidebar `openFile` flow but allowed to ADD tabs — the
    sidebar's flow only switches between already-open tabs today.)
- **Esc** → close palette, return focus to editor.
- **Arrow up/down** → move selection.
- **Mouse hover** → move selection.

If opening a file fails (filesystem read error), surface via the existing
`toast` signal with `kind: "warn"` and keep the palette open so the user can
pick something else. The selected row is not advanced.

## Components affected

- `src/components/CommandPalette.tsx` — add `mode` state, prefix detection,
  per-mode result provider.
- `src/components/CommandPalette.css` — likely no changes; reuse existing
  `.palette-row` styles.
- `src/state/appState.ts` — add `recentFilePaths` signal + a small effect
  that tracks `activeTabIndex` → push to front + dedup + trim.
- `src/lib/file-icons.ts` (new) — `iconForName(path)` helper, factored out of
  TabBar's existing `iconForName` so both components share one definition.
- `src/components/TabBar.tsx` — replace its inline `iconForName` with the
  shared one.
- `src/lib/quick-open-search.ts` (new, unless `project-search.ts` is suitable)
  — fuzzy matcher.
- `src/lib/shortcuts.ts` — register Ctrl+P → open palette in file mode.
- `src/lib/commands.ts` (if it owns the existing palette triggers) — add a
  "Quick Open File" command entry so it's also reachable through the command
  palette itself.

## Data flow

```
User presses Ctrl+P
  → shortcuts.ts opens CommandPalette with mode="file"
  → input renders, focused, empty query
  → result provider for "file" mode runs:
       query empty?  → return recentFilePaths (filtered to current sketch) ?? all files
       query present → fuzzy-rank currentSketch.files, return top N
  → user types → query state updates → results re-rank
  → user types prefix char at start → mode flips, results recompute
  → user presses Enter
  → CommandPalette calls onSelect(result)
  → file-mode onSelect:
       file already open → activeTabIndex = idx
       else → load file, push to openTabs, activeTabIndex = last
  → palette closes
```

## Error handling

- Read failure on file open → toast warn, palette stays open.
- `currentSketch` is null (rare; happens during bootstrap) → palette opens
  with an empty-state message ("No sketch open") and no result list.
- Recent-files list referencing a path that no longer exists → silently
  filtered when computing the empty state; stays in the recent list so it
  reappears if the file is restored.

## Testing strategy

**Unit (Vitest):**
- `quick-open-search.test.ts` — score correctness, ordering, edge cases
  (empty query, non-matching query, identical scores, token-boundary bonuses,
  consecutive-run bonuses, extension match bonus).
- `file-icons.test.ts` — picks correct icon for each extension; falls back
  to `FileText`.

**Component (Vitest + @testing-library/preact):**
- Palette in file mode renders sketch files.
- Typing filters results in score order.
- Enter on a not-yet-open file appends a tab and switches to it.
- Enter on an already-open file just switches.
- Prefix `>` flips to command mode; backspacing past it returns to file mode.
- Empty query shows recent files in order; falls back to all files when empty.

**Manual smoke (dev mode):**
- Verify keyboard shortcuts in each theme (Dark / Solarized Dark / Solarized
  Light) — the palette readability stays good across all three.

## Out of scope

The following are explicitly NOT part of this spec; each gets its own design
later:

- **Go to Symbol (@ mode)** — recognizes the prefix but routes to file mode
  in this spec. A follow-up spec extends the result provider for `@`.
- **Sketchbook-wide search** — current sketch only. The trailing label
  slot is preserved to support this without a layout change.
- **Library/example files** — out of scope; covered by existing Libraries
  and Examples sidebar views.
- **Recent commands** — only files have a recents list in this spec. Command
  mode's empty state is unchanged.
- **Persisting palette mode across opens** — every open of the palette uses
  the trigger's default mode (file for Ctrl+P, command for Ctrl+Shift+P).

## Open questions

None. All decisions are locked.
