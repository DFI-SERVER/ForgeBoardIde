import "./CommandPalette.css";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  Search,
  SearchX,
  FilePlus,
  FolderOpen,
  Save,
  Hammer,
  ArrowUpFromLine,
  Undo2,
  Redo2,
  Replace,
  PanelBottom,
  Compass,
} from "lucide-preact";
import { paletteOpen } from "../state/appState";
import { filterCommands, type Command } from "../lib/commands";

type LucideIcon = typeof Search;

/** Per-command icon, looked up by command id; categories fall back by name. */
function iconFor(command: Command): LucideIcon {
  switch (command.id) {
    case "file.new":
      return FilePlus;
    case "file.open":
      return FolderOpen;
    case "file.save":
      return Save;
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
    case "view.toggleBottomPanel":
      return PanelBottom;
    default:
      // Every "Go" command.
      return Compass;
  }
}

/**
 * The fuzzy-search command palette. Mounted once in App.tsx; renders only when
 * `paletteOpen` is true. Opening with Ctrl+Shift+P / Ctrl+K remounts the body
 * (see the `key` below), so the query resets and the input re-autofocuses.
 */
export function CommandPalette() {
  if (!paletteOpen.value) return null;
  return <CommandPaletteBody />;
}

function CommandPaletteBody() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => filterCommands(query), [query]);

  // Keep the selection in range as the result set shrinks/grows.
  const activeIndex = results.length === 0 ? -1 : Math.min(selected, results.length - 1);

  const close = () => {
    paletteOpen.value = false;
  };

  const runAt = (index: number) => {
    const command = results[index];
    if (!command) return;
    close();
    command.run();
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
      if (results.length > 0) {
        setSelected((i) => (Math.min(i, results.length - 1) + 1) % results.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length > 0) {
        setSelected(
          (i) => (Math.min(i, results.length - 1) - 1 + results.length) % results.length,
        );
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(activeIndex);
    }
  };

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
            placeholder="Type a command…"
            value={query}
            aria-label="Search commands"
            onInput={(e) => {
              setQuery((e.target as HTMLInputElement).value);
              setSelected(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>

        {results.length === 0 ? (
          <div class="palette-empty">
            <span class="palette-empty-icon">
              <SearchX size={22} strokeWidth={1.5} />
            </span>
            <span>No matching commands</span>
          </div>
        ) : (
          <ul class="palette-results" ref={listRef} role="listbox">
            {results.map((command, i) => {
              const Icon = iconFor(command);
              return (
                <li
                  key={command.id}
                  class={`palette-row ${i === activeIndex ? "active" : ""}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseMove={() => setSelected(i)}
                  onClick={() => runAt(i)}
                >
                  <span class="palette-row-icon">
                    <Icon size={16} strokeWidth={1.5} />
                  </span>
                  <span class="palette-row-title">{command.title}</span>
                  <span class="palette-row-category">{command.category}</span>
                  {command.shortcut && (
                    <span class="palette-row-shortcut">{command.shortcut}</span>
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
