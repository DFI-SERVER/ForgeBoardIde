import "./CommandPalette.css";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  Search,
  SearchX,
  FileSearch,
  FilePlus,
  FolderOpen,
  Save,
  X,
  ArrowRightLeft,
  Hammer,
  ArrowUpFromLine,
  Undo2,
  Redo2,
  Replace,
  PanelBottom,
  Command as CommandIcon,
  Keyboard,
  Compass,
} from "lucide-preact";
import {
  paletteOpen,
  paletteMode,
  currentSketch,
  recentFilePaths,
  openTabs,
  activeTabIndex,
  fileContents,
  toast,
  type PaletteMode,
} from "../state/appState";
import { filterCommands, type Command } from "../lib/commands";
import { rankFiles, type QuickOpenFile } from "../lib/quick-open-search";
import { iconForName } from "../lib/file-icons";
import { projectApi } from "../ipc/project";

type LucideIcon = typeof Search;

/** Unified shape every palette row renders from. Mode-specific providers
 *  produce these so the rendering code is mode-agnostic. */
interface PaletteItem {
  id: string;
  title: string;
  category?: string;
  shortcut?: string;
  icon: LucideIcon;
  /** Run the row's action. Caller closes the palette before invoking. */
  onSelect: () => void;
}

/** Per-command icon, looked up by command id; rail "Go" commands fall back. */
function iconFor(command: Command): LucideIcon {
  switch (command.id) {
    case "file.new":
      return FilePlus;
    case "file.open":
      return FolderOpen;
    case "file.save":
      return Save;
    case "file.closeTab":
      return X;
    case "sketch.compile":
      return Hammer;
    case "sketch.upload":
      return ArrowUpFromLine;
    case "edit.undo":
      return Undo2;
    case "edit.redo":
      return Redo2;
    case "edit.find":
      return Search;
    case "edit.replace":
      return Replace;
    case "edit.findInProject":
      return FileSearch;
    case "view.commandPalette":
      return CommandIcon;
    case "view.keyboardShortcuts":
    case "help.keyboardShortcuts":
      return Keyboard;
    case "view.toggleBottomPanel":
      return PanelBottom;
    case "view.nextTab":
      return ArrowRightLeft;
    case "file.quickOpen":
      return FileSearch;
    default:
      // Every rail "Go to …" command.
      return Compass;
  }
}

/** Reserved leading prefixes the input recognises and strips. `>` actively
 *  switches to command mode; the rest are placeholders for future modes and
 *  are stripped so typing them produces no literal-search noise. */
const FUTURE_PREFIXES = new Set(["@", "#", ":"]);

/** The narrow shape `fileResults` needs from the current sketch. The real
 *  `Sketch` has more fields; TypeScript accepts the wider type here. */
interface SketchSnapshot {
  name: string;
  files: { path: string; name: string }[];
}

/**
 * The fuzzy-search command palette. Mounted once in App.tsx; renders only when
 * `paletteOpen` is true. Two operating modes share the same modal:
 *
 *  - command — Ctrl+Shift+P / Ctrl+K. Filters the global Command registry.
 *  - file    — Ctrl+P. Filters the current sketch's files by fuzzy match.
 *
 * Inside the input, a leading `>` switches to command mode live; reserved
 * future prefixes (`@`, `#`, `:`) are stripped so typing them produces no
 * literal-search noise.
 */
export function CommandPalette() {
  if (!paletteOpen.value) return null;
  return <CommandPaletteBody />;
}

function CommandPaletteBody() {
  const sketch = currentSketch.value;
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Detect a leading prefix character. `>` switches to command mode; the
  // future prefixes are recognized and stripped (no-op route to file mode)
  // so users typing them early don't see a broken state.
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

  // Initial selection: VS Code's Ctrl+P-twice pattern. When the palette
  // opens in file mode with an empty query and 2+ recents-in-sketch, the
  // 2nd row is pre-selected so Enter toggles to the previously-focused file.
  const initialSelected = useMemo(() => {
    if (paletteMode.value !== "file") return 0;
    if (query.length > 0) return 0;
    const recentsInSketch = sketch
      ? recentFilePaths.value.filter((p) =>
          sketch.files.some((f) => f.path === p),
        )
      : [];
    return recentsInSketch.length >= 2 ? 1 : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [selected, setSelected] = useState(initialSelected);

  // Keep the selection in range as the result set shrinks/grows.
  const activeIndex = items.length === 0 ? -1 : Math.min(selected, items.length - 1);

  const close = () => {
    paletteOpen.value = false;
  };

  const runAt = (index: number) => {
    const item = items[index];
    if (!item) return;
    close();
    item.onSelect();
  };

  // Autofocus the search box when the palette opens.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll the highlighted row into view as the selection moves. Guarded
  // because some environments (jsdom under test) don't implement it.
  useEffect(() => {
    if (activeIndex < 0) return;
    const row = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    row?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length > 0) {
        setSelected((i) => (Math.min(i, items.length - 1) + 1) % items.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length > 0) {
        setSelected(
          (i) => (Math.min(i, items.length - 1) - 1 + items.length) % items.length,
        );
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(activeIndex);
    }
  };

  const placeholder = liveMode === "file" ? "Go to file…" : "Type a command…";

  return (
    <div class="palette-overlay" onMouseDown={close}>
      <div
        class="palette-panel"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div class="palette-search">
          <span class="palette-search-icon">
            <Search size={16} strokeWidth={1.5} />
          </span>
          <input
            ref={inputRef}
            class="palette-input"
            type="text"
            placeholder={placeholder}
            value={query}
            aria-label="Search commands and files"
            onInput={(e) => {
              setQuery((e.target as HTMLInputElement).value);
              setSelected(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>

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
      </div>
    </div>
  );
}

function PaletteEmptyState({
  mode,
  hasQuery,
}: {
  mode: PaletteMode;
  hasQuery: boolean;
}) {
  if (!hasQuery && mode === "file") {
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
  return (
    <div class="palette-empty">
      <span class="palette-empty-icon">
        <SearchX size={22} strokeWidth={1.5} />
      </span>
      <span>No matching commands</span>
    </div>
  );
}

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

interface FileResult extends QuickOpenFile {
  sketch: string;
}

function fileToItem(file: FileResult): PaletteItem {
  return {
    id: file.path,
    title: file.name,
    category: file.sketch,
    icon: iconForName(file.name),
    onSelect: () => {
      void openFileInTab(file.path, file.name);
    },
  };
}

/** Compute the file-mode result set: rank by query, or show recents +
 *  fallback on empty query. */
function fileResults(
  sketch: SketchSnapshot | null,
  query: string,
): FileResult[] {
  if (!sketch) return [];
  const files: FileResult[] = sketch.files.map((f) => ({
    path: f.path,
    name: f.name,
    sketch: sketch.name,
  }));

  const trimmed = query.trim();
  if (trimmed) return rankFiles(files, trimmed);

  // Empty-query empty state: prefer recents (filtered to this sketch);
  // fall back to all files in original order.
  const pathSet = new Map(files.map((f) => [f.path, f]));
  const recents = recentFilePaths.value
    .map((p) => pathSet.get(p))
    .filter((f): f is FileResult => f !== undefined)
    .slice(0, 8);
  return recents.length > 0 ? recents : files;
}

/** Open a file in a tab — switch to its tab if open, otherwise read it and
 *  append. */
async function openFileInTab(path: string, name: string): Promise<void> {
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
