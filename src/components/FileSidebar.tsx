import "./FileSidebar.css";
import { useState } from "preact/hooks";
import {
  FolderOpen,
  FilePlus2,
  FileCode2,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  FolderSearch,
  ClipboardCopy,
} from "lucide-preact";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  currentSketch,
  activeRail,
  openTabs,
  activeTabIndex,
  toast,
} from "../state/appState";
import { newSketch, openSketch } from "../lib/actions";
import {
  baseName,
  createFileOp,
  createFolderOp,
  renameFileOp,
  deleteFileOp,
  type FileOpResult,
} from "../lib/file-ops";
import {
  ContextMenu,
  menuSeparator,
  type ContextMenuItem,
} from "./ContextMenu";
import { NameDialog, ConfirmDeleteDialog } from "./FileDialogs";
import { BoardsView } from "./BoardsView";
import { LibrariesView } from "./LibrariesView";
import { ExamplesView } from "./ExamplesView";
import { SearchView } from "./SearchView";
import { SettingsView } from "./SettingsView";

/* ----------------------------------------------------------- ui state --- */

/** Where the context menu was opened and what it targets. */
interface MenuState {
  x: number;
  y: number;
  /** The targeted file's absolute path, or null for the empty-area menu. */
  target: string | null;
}

/** Which modal dialog (if any) the Files view currently shows. */
type DialogState =
  | { kind: "none" }
  | { kind: "new-file" }
  | { kind: "new-folder" }
  | { kind: "rename"; path: string }
  | { kind: "delete"; path: string };

/* ------------------------------------------------------------- files --- */

function FilesView() {
  const sketch = currentSketch.value;

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  // Set while a dialog's operation is in flight, or holds its error message.
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | undefined>(undefined);

  if (!sketch) return <div class="sb-placeholder">No sketch open.</div>;

  const activeTab = openTabs.value[activeTabIndex.value];

  /** Open `path` in the editor by switching to its tab, if one exists. */
  function openFile(path: string) {
    const idx = openTabs.value.findIndex((t) => t.path === path);
    if (idx >= 0) activeTabIndex.value = idx;
  }

  function closeMenu() {
    setMenu(null);
  }

  function closeDialog() {
    setDialog({ kind: "none" });
    setBusy(false);
    setDialogError(undefined);
  }

  /** Report a failed operation: toast for menu-direct actions, inline for
   *  dialog-driven ones (handled by the caller via `setDialogError`). */
  function toastError(message: string) {
    toast.value = { text: message, kind: "warn" };
  }

  /* --- menu openers --- */

  function openFileMenu(e: MouseEvent, path: string) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, target: path });
  }

  function openEmptyMenu(e: MouseEvent) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, target: null });
  }

  /* --- direct menu actions (no dialog) --- */

  async function revealPath(path: string) {
    try {
      await revealItemInDir(path);
    } catch (err) {
      toastError(`Couldn't reveal that file: ${String(err)}`);
    }
  }

  async function copyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      toast.value = { text: "Path copied to clipboard", kind: "info" };
    } catch {
      toastError("Couldn't copy the path to the clipboard.");
    }
  }

  /* --- dialog submit handlers --- */

  /** Run an op, surfacing failure inline; close the dialog on success. */
  async function runDialogOp(op: () => Promise<FileOpResult>) {
    setBusy(true);
    setDialogError(undefined);
    const result = await op();
    if (result.ok) {
      closeDialog();
    } else {
      setBusy(false);
      setDialogError(result.error);
    }
  }

  function submitNewFile(name: string) {
    runDialogOp(() => createFileOp(sketch!.path, name));
  }

  function submitNewFolder(name: string) {
    runDialogOp(() => createFolderOp(sketch!.path, name));
  }

  function submitRename(path: string, name: string) {
    runDialogOp(() => renameFileOp(path, name));
  }

  function submitDelete(path: string) {
    runDialogOp(() => deleteFileOp(path));
  }

  /* --- menu item models --- */

  function fileMenuItems(path: string): ContextMenuItem[] {
    return [
      {
        label: "New File",
        icon: FilePlus,
        onSelect: () => setDialog({ kind: "new-file" }),
      },
      {
        label: "New Folder",
        icon: FolderPlus,
        onSelect: () => setDialog({ kind: "new-folder" }),
      },
      menuSeparator,
      {
        label: "Rename…",
        icon: Pencil,
        onSelect: () => setDialog({ kind: "rename", path }),
      },
      {
        label: "Delete",
        icon: Trash2,
        danger: true,
        onSelect: () => setDialog({ kind: "delete", path }),
      },
      menuSeparator,
      {
        label: "Reveal in File Explorer",
        icon: FolderSearch,
        onSelect: () => revealPath(path),
      },
      {
        label: "Copy Path",
        icon: ClipboardCopy,
        onSelect: () => copyPath(path),
      },
    ];
  }

  function emptyMenuItems(): ContextMenuItem[] {
    return [
      {
        label: "New File",
        icon: FilePlus,
        onSelect: () => setDialog({ kind: "new-file" }),
      },
      {
        label: "New Folder",
        icon: FolderPlus,
        onSelect: () => setDialog({ kind: "new-folder" }),
      },
    ];
  }

  return (
    <>
      <div class="sb-header">
        <span class="sb-title">Your files</span>
        <span class="sb-actions">
          <button class="sb-action" title="Open sketch…" onClick={openSketch}>
            <FolderOpen size={16} strokeWidth={1.5} />
          </button>
          <button class="sb-action" title="New sketch" onClick={newSketch}>
            <FilePlus2 size={16} strokeWidth={1.5} />
          </button>
        </span>
      </div>
      {/* Right-clicking empty space below the list offers root-level actions. */}
      <div class="sb-body" onContextMenu={openEmptyMenu}>
        <div class="sb-section-label">SKETCH · {sketch.name}</div>
        {sketch.files.map((f) => (
          <div
            key={f.path}
            class={`sb-file ${activeTab?.path === f.path ? "active" : ""}`}
            onClick={() => openFile(f.path)}
            onContextMenu={(e) => openFileMenu(e, f.path)}
          >
            {f.is_main && (
              <span class="sb-mod" title="Main sketch file">
                <FileCode2 size={14} strokeWidth={1.5} />
              </span>
            )}
            <span class="sb-file-name">{f.name}</span>
          </div>
        ))}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={
            menu.target ? fileMenuItems(menu.target) : emptyMenuItems()
          }
          onClose={closeMenu}
        />
      )}

      {dialog.kind === "new-file" && (
        <NameDialog
          title="New file"
          label="File name"
          confirmLabel="Create file"
          busy={busy}
          error={dialogError}
          onSubmit={submitNewFile}
          onClose={closeDialog}
        />
      )}
      {dialog.kind === "new-folder" && (
        <NameDialog
          title="New folder"
          label="Folder name"
          confirmLabel="Create folder"
          busy={busy}
          error={dialogError}
          onSubmit={submitNewFolder}
          onClose={closeDialog}
        />
      )}
      {dialog.kind === "rename" && (
        <NameDialog
          title="Rename"
          label="New name"
          initialValue={baseName(dialog.path)}
          confirmLabel="Rename"
          busy={busy}
          error={dialogError}
          onSubmit={(name) => submitRename(dialog.path, name)}
          onClose={closeDialog}
        />
      )}
      {dialog.kind === "delete" && (
        <ConfirmDeleteDialog
          name={baseName(dialog.path)}
          busy={busy}
          error={dialogError}
          onConfirm={() => submitDelete(dialog.path)}
          onClose={closeDialog}
        />
      )}
    </>
  );
}

function PlaceholderView({ label }: { label: string }) {
  return (
    <div class="sb-body">
      <div class="sb-placeholder">{label} — coming soon.</div>
    </div>
  );
}

export function FileSidebar() {
  const rail = activeRail.value;
  return (
    <aside class="sidebar">
      {rail === "files" && <FilesView />}
      {rail === "home" && <PlaceholderView label="Home" />}
      {rail === "examples" && <ExamplesView />}
      {rail === "search" && <SearchView />}
      {rail === "libraries" && <LibrariesView />}
      {rail === "boards" && <BoardsView />}
      {rail === "walkthrough" && <PlaceholderView label="Walkthrough" />}
      {rail === "settings" && <SettingsView />}
    </aside>
  );
}
