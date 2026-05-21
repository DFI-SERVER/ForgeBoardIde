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
} from "../lib/actions";
import {
  editorUndo,
  editorRedo,
  editorCut,
  editorCopy,
  editorPaste,
  editorFind,
  editorReplace,
} from "../lib/editor-actions";
import { AboutDialog, KeyboardShortcutsDialog } from "./HelpDialogs";

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
  // null = no dialog; otherwise the Help dialog to show.
  const [dialog, setDialog] = useState<"about" | "shortcuts" | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // The menus, defined once. Re-created each render so item state stays fresh.
  const menus: { name: string; entries: MenuEntry[] }[] = [
    {
      name: "File",
      entries: [
        { kind: "item", label: "New Sketch", shortcut: "Ctrl+N", run: newSketch },
        { kind: "item", label: "Open Sketch…", shortcut: "Ctrl+O", run: openSketch },
        { kind: "item", label: "Open Recent", submenu: "recent" },
        sep,
        { kind: "item", label: "Save", shortcut: "Ctrl+S", run: saveActiveFile },
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
        { kind: "item", label: "Undo", shortcut: "Ctrl+Z", run: editorUndo },
        { kind: "item", label: "Redo", shortcut: "Ctrl+Y", run: editorRedo },
        sep,
        { kind: "item", label: "Cut", run: editorCut },
        { kind: "item", label: "Copy", run: editorCopy },
        { kind: "item", label: "Paste", run: editorPaste },
        sep,
        { kind: "item", label: "Find", shortcut: "Ctrl+F", run: editorFind },
        { kind: "item", label: "Replace", shortcut: "Ctrl+H", run: editorReplace },
      ],
    },
    {
      name: "Sketch",
      entries: [
        {
          kind: "item",
          label: "Verify / Compile",
          shortcut: "Ctrl+R",
          run: compileSketch,
        },
        { kind: "item", label: "Upload", shortcut: "Ctrl+U", run: uploadSketch },
      ],
    },
    {
      name: "View",
      entries: [
        { kind: "item", label: "Toggle Bottom Panel", run: toggleBottomPanel },
      ],
    },
    {
      name: "Help",
      entries: [
        {
          kind: "item",
          label: "About ForgeBoard",
          run: () => setDialog("about"),
        },
        {
          kind: "item",
          label: "Keyboard Shortcuts",
          run: () => setDialog("shortcuts"),
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

      {dialog === "about" && <AboutDialog onClose={() => setDialog(null)} />}
      {dialog === "shortcuts" && (
        <KeyboardShortcutsDialog onClose={() => setDialog(null)} />
      )}
    </>
  );
}
