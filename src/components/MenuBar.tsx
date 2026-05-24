import "./MenuBar.css";
import { useEffect, useRef, useState } from "preact/hooks";
import { ChevronRight } from "lucide-preact";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { projectApi, type RecentProject } from "../ipc/project";
import {
  newSketch,
  openSketch,
  openRecentSketch,
  saveActiveFile,
  compileSketch,
  uploadSketch,
  toggleBottomPanel,
  archiveSketch,
  openSerialMonitor,
  openSerialPlotter,
  openLibraries,
  openBoardsManager,
} from "../lib/actions";
import {
  editorUndo,
  editorRedo,
  editorCut,
  editorCopy,
  editorPaste,
  editorFind,
  editorReplace,
  editorAutoFormat,
} from "../lib/editor-actions";
import { comboFor, keybindingById } from "../lib/keybindings";
import { keyboardShortcutsOpen, openPalette } from "../state/appState";
import { AboutDialog } from "./HelpDialogs";
import { BoardInfoDialog } from "./BoardInfoDialog";

/** Open the command palette from the View menu. */
function openCommandPalette() {
  openPalette();
}

/* ------------------------------------------------------------- model --- */

/** A single menu row. `submenu` makes it a flyout host instead of an action. */
interface MenuItem {
  kind: "item";
  label: string;
  shortcut?: string;
  disabled?: boolean;
  run?: () => void;
  submenu?: "recent";
}
interface MenuSep {
  kind: "separator";
}
type MenuEntry = MenuItem | MenuSep;

const sep: MenuSep = { kind: "separator" };

/* ----------------------------------------------------------- submenu --- */

/** The Open Recent flyout — lists recent sketches loaded when its parent menu
 *  opens. Shows a disabled placeholder when the list is empty. */
function RecentSubmenu({
  recent,
  onPick,
}: {
  recent: RecentProject[];
  onPick: () => void;
}) {
  return (
    <div class="menu-submenu" role="menu">
      {recent.length === 0 ? (
        <button class="menu-item disabled" disabled>
          <span class="menu-item-label">No recent sketches</span>
        </button>
      ) : (
        recent.map((r) => (
          <button
            key={r.path}
            class="menu-item"
            role="menuitem"
            title={r.path}
            onClick={() => {
              onPick();
              openRecentSketch(r.path);
            }}
          >
            <span class="menu-item-label">{r.name}</span>
          </button>
        ))
      )}
    </div>
  );
}

/* ---------------------------------------------------------- dropdown --- */

function Dropdown({
  entries,
  anchor,
  recent,
  onClose,
}: {
  entries: MenuEntry[];
  anchor: HTMLElement;
  recent: RecentProject[];
  onClose: () => void;
}) {
  const rect = anchor.getBoundingClientRect();
  const [openSub, setOpenSub] = useState(false);

  return (
    <div
      class="menu-dropdown"
      role="menu"
      style={{ left: `${rect.left}px`, top: `${rect.bottom}px` }}
      // Stop drag-region capture and outside-click handling from firing.
      onMouseDown={(e) => e.stopPropagation()}
    >
      {entries.map((entry, i) => {
        if (entry.kind === "separator") {
          return <div class="menu-separator" key={`sep-${i}`} />;
        }
        if (entry.submenu === "recent") {
          return (
            <div
              class="menu-submenu-host"
              key={entry.label}
              onMouseEnter={() => setOpenSub(true)}
              onMouseLeave={() => setOpenSub(false)}
            >
              <button class="menu-item" role="menuitem">
                <span class="menu-item-label">{entry.label}</span>
                <span class="menu-item-arrow">
                  <ChevronRight size={14} strokeWidth={1.5} />
                </span>
              </button>
              {openSub && <RecentSubmenu recent={recent} onPick={onClose} />}
            </div>
          );
        }
        return (
          <button
            key={entry.label}
            class="menu-item"
            role="menuitem"
            disabled={entry.disabled}
            onClick={() => {
              if (entry.disabled) return;
              onClose();
              entry.run?.();
            }}
          >
            <span class="menu-item-label">{entry.label}</span>
            {entry.shortcut && (
              <span class="menu-item-shortcut">{entry.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- menubar --- */

export function MenuBar() {
  // Which top-level menu is open (by name), or null.
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentProject[]>([]);
  // Whether the About modal is open. (Keyboard Shortcuts is a global,
  // signal-driven modal — opened by setting `keyboardShortcutsOpen`.)
  const [aboutOpen, setAboutOpen] = useState(false);
  // Whether the Get Board Info modal is open.
  const [boardInfoOpen, setBoardInfoOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // The menus, defined once. Re-created each render so item state stays fresh.
  const menus: { name: string; entries: MenuEntry[] }[] = [
    {
      name: "File",
      entries: [
        { kind: "item", label: "New Sketch", shortcut: comboFor("file.new"), run: newSketch },
        { kind: "item", label: "Open Sketch…", shortcut: comboFor("file.open"), run: openSketch },
        { kind: "item", label: "Open Recent", submenu: "recent" },
        sep,
        { kind: "item", label: "Save", shortcut: comboFor("file.save"), run: saveActiveFile },
        sep,
        {
          kind: "item",
          label: "Close Window",
          run: () => getCurrentWindow().close(),
        },
      ],
    },
    {
      name: "Edit",
      entries: [
        { kind: "item", label: "Undo", shortcut: comboFor("edit.undo"), run: editorUndo },
        { kind: "item", label: "Redo", shortcut: comboFor("edit.redo"), run: editorRedo },
        sep,
        { kind: "item", label: "Cut", run: editorCut },
        { kind: "item", label: "Copy", run: editorCopy },
        { kind: "item", label: "Paste", run: editorPaste },
        sep,
        { kind: "item", label: "Find", shortcut: comboFor("edit.find"), run: editorFind },
        { kind: "item", label: "Replace", shortcut: comboFor("edit.replace"), run: editorReplace },
        {
          kind: "item",
          label: "Find in Project",
          shortcut: comboFor("edit.findInProject"),
          run: () => keybindingById("edit.findInProject")?.run(),
        },
      ],
    },
    {
      name: "Sketch",
      entries: [
        {
          kind: "item",
          label: "Verify / Compile",
          shortcut: comboFor("sketch.compile"),
          run: compileSketch,
        },
        { kind: "item", label: "Upload", shortcut: comboFor("sketch.upload"), run: uploadSketch },
      ],
    },
    {
      name: "Tools",
      entries: [
        {
          kind: "item",
          label: "Auto Format",
          shortcut: comboFor("tools.autoFormat"),
          run: editorAutoFormat,
        },
        { kind: "item", label: "Archive Sketch…", run: archiveSketch },
        sep,
        {
          kind: "item",
          label: "Manage Libraries",
          shortcut: comboFor("tools.manageLibraries"),
          run: openLibraries,
        },
        {
          kind: "item",
          label: "Serial Monitor",
          shortcut: comboFor("tools.serialMonitor"),
          run: openSerialMonitor,
        },
        { kind: "item", label: "Serial Plotter", run: openSerialPlotter },
        { kind: "item", label: "Boards Manager", run: openBoardsManager },
        sep,
        {
          kind: "item",
          label: "Get Board Info",
          run: () => setBoardInfoOpen(true),
        },
      ],
    },
    {
      name: "View",
      entries: [
        { kind: "item", label: "Command Palette", shortcut: comboFor("view.commandPalette"), run: openCommandPalette },
        {
          kind: "item",
          label: "Toggle Bottom Panel",
          shortcut: comboFor("view.toggleBottomPanel"),
          run: toggleBottomPanel,
        },
      ],
    },
    {
      name: "Help",
      entries: [
        {
          kind: "item",
          label: "About ForgeBoard",
          run: () => setAboutOpen(true),
        },
        {
          kind: "item",
          label: "Keyboard Shortcuts",
          shortcut: comboFor("view.keyboardShortcuts"),
          run: () => {
            keyboardShortcutsOpen.value = true;
          },
        },
      ],
    },
  ];

  // Refresh the recent-sketches list whenever a menu opens (cheap; keeps it
  // current without a watcher).
  useEffect(() => {
    if (openMenu === null) return;
    let cancelled = false;
    projectApi
      .listRecent()
      .then((list) => {
        if (!cancelled) setRecent(list);
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      });
    return () => {
      cancelled = true;
    };
  }, [openMenu]);

  // Close on outside click or Escape while a menu is open.
  useEffect(() => {
    if (openMenu === null) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const active = menus.find((m) => m.name === openMenu);
  const anchor = openMenu ? buttonRefs.current[openMenu] : null;

  return (
    <>
      <div class="menubar" ref={barRef}>
        {menus.map((m) => (
          <button
            key={m.name}
            ref={(el) => {
              buttonRefs.current[m.name] = el;
            }}
            class={`menubar-button ${openMenu === m.name ? "open" : ""}`}
            // Toggle on click; switch on hover while any menu is already open.
            onClick={() =>
              setOpenMenu((cur) => (cur === m.name ? null : m.name))
            }
            onMouseEnter={() => {
              if (openMenu !== null) setOpenMenu(m.name);
            }}
          >
            {m.name}
          </button>
        ))}
      </div>

      {active && anchor && (
        <Dropdown
          entries={active.entries}
          anchor={anchor}
          recent={recent}
          onClose={() => setOpenMenu(null)}
        />
      )}

      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      {boardInfoOpen && (
        <BoardInfoDialog onClose={() => setBoardInfoOpen(false)} />
      )}
    </>
  );
}
