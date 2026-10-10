/**
 * Sketch-level actions: new, create, open, open recent, open example, archive.
 */
import {
  open as openNativeDialog,
  save as saveNativeDialog,
} from "@tauri-apps/plugin-dialog";
import { projectApi } from "@/ipc/project";
import { loadSketch } from "./sketch";
import { addTabToActiveGroup } from "@/features/editor/editor-groups";
import { fileContents } from "@/features/editor/state";
import { toast } from "@/app/state";
import { errText } from "@/shared/errors";
import { currentSketch, newSketchDialogOpen } from "./state";

/**
 * Start a new sketch — opens the app-global "New sketch" dialog. The dialog
 * itself (rendered in App.tsx) collects the name + location and calls
 * `createSketch()`.
 */
export function newSketch() {
  newSketchDialogOpen.value = true;
}

/** Create a sketch on disk. On the welcome screen this window swaps to the
 *  new sketch; with a sketch already open, the new sketch lands as a tab
 *  here (sketchPath set so compile/upload follow the active tab) — same
 *  mechanism as openExample. Never call loadSketch in the second branch:
 *  that would wipe the user's other tabs. Throws on failure so the dialog
 *  can surface the error inline. */
export async function createSketch(
  name: string,
  location: string | null,
): Promise<void> {
  const created = await projectApi.create(name, location);
  if (!currentSketch.value) {
    await loadSketch(created);
    return;
  }
  const main = created.files.find((f) => f.is_main) ?? created.files[0];
  if (!main) return;
  const content = await projectApi.readFile(main.path);
  fileContents.value = new Map(fileContents.value).set(main.path, content);
  addTabToActiveGroup({
    path: main.path,
    name: main.name,
    modified: false,
    sketchPath: created.path,
  });
  toast.value = {
    text: `Created "${created.name}" as a tab — compile/upload follow the active tab.`,
    kind: "success",
  };
}

/**
 * Open an example as a fresh, editable sketch.
 *
 * An example is never edited in place. Its source is copied into a brand-new
 * sketch in the sketchbook, which is then loaded into the editor. The new
 * sketch is named after the example; on a name collision a numeric suffix is
 * appended (`Blink`, `Blink 2`, `Blink 3`, …) until a free name is found.
 *
 * `exampleName` is the display name (e.g. "Blink"); `source` is the full `.ino`
 * to seed the sketch with. Surfaces failures as a toast.
 */
export async function openExample(
  exampleName: string,
  source: string,
): Promise<void> {
  // A sketch folder name must be a single, separator-free path component;
  // a library example name can contain spaces or other characters. Keep
  // letters, digits, spaces, '-' and '_'; collapse the rest to spaces.
  const base =
    exampleName
      .replace(/[^A-Za-z0-9 _-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Example";

  try {
    let created;
    // project_create rejects an existing folder with AlreadyExists; retry
    // with an incrementing suffix until a free name is found.
    for (let attempt = 1; ; attempt++) {
      const candidate = attempt === 1 ? base : `${base} ${attempt}`;
      try {
        created = await projectApi.create(candidate, null);
        break;
      } catch (e) {
        if (isAlreadyExists(e) && attempt < 100) continue;
        throw e;
      }
    }
    // Seed the new sketch's main .ino with the example's source.
    const main = created.files.find((f) => f.is_main) ?? created.files[0];
    if (main) {
      await projectApi.saveFile(main.path, source);
    }
    // Open the example as a tab in the CURRENT window without changing
    // currentSketch — the user wants to view/edit the example alongside their
    // own sketch, not swap into it and lose their other tabs. The example is
    // still a real sketch folder on disk, so they can switch to it later via
    // Recent Sketches when they want to compile/upload it.
    if (main) {
      fileContents.value = new Map(fileContents.value).set(main.path, source);
      addTabToActiveGroup({
        path: main.path,
        name: main.name,
        modified: false,
        // Mark this tab as belonging to the example's sketch folder so
        // compile/upload target what is on screen, not the user's other
        // sketch that happens to be `currentSketch`.
        sketchPath: created.path,
      });
    }
    toast.value = {
      text:
        `Opened "${exampleName}" as a tab — saved to ${created.path}. ` +
        `Compile/upload now follow the active tab.`,
      kind: "success",
    };
  } catch (e) {
    toast.value = {
      text: `Couldn't open that example: ${errText(e)}`,
      kind: "warn",
    };
  }
}

/** True when a thrown value is a serialized `ProjectError::AlreadyExists`. */
function isAlreadyExists(e: unknown): boolean {
  return (
    !!e &&
    typeof e === "object" &&
    "type" in e &&
    (e as { type: unknown }).type === "AlreadyExists"
  );
}

/** Open an existing sketch — native folder picker, then open it in a fresh
 *  IDE window so the current sketch isn't replaced under the user's feet. */
export async function openSketch(): Promise<void> {
  const picked = await openNativeDialog({
    directory: true,
    title: "Open a sketch folder",
  });
  if (typeof picked !== "string") return;
  await openSketchInNewWindow(picked);
}

/** Open a specific recent sketch by its folder path. The new sketch opens
 *  in a fresh IDE window so the current window's work survives untouched —
 *  clicking Recent must never silently swap the open sketch (that surprised
 *  the user, since autosave or no, the tabs and view state vanish). */
export async function openRecentSketch(path: string): Promise<void> {
  await openSketchInNewWindow(path);
}

/** Helper — spawn a new ForgeBoard IDE window pointed at `path`. Surfaces
 *  failures as a toast in the calling window (the failing window-create
 *  never reaches the new app, so the original keeps the user informed). */
async function openSketchInNewWindow(path: string): Promise<void> {
  try {
    const { spawnNewSketchWindow } = await import("@/app/window-mgmt");
    await spawnNewSketchWindow(path);
  } catch (e) {
    toast.value = {
      text: `Couldn't open that sketch in a new window: ${errText(e)}`,
      kind: "warn",
    };
  }
}

/**
 * Archive the current sketch — zip its folder to a `.zip` the user chooses.
 * A no-op (with a toast) when no sketch is open.
 */
export async function archiveSketch(): Promise<void> {
  const sketch = currentSketch.value;
  if (!sketch) {
    toast.value = { text: "No sketch open to archive.", kind: "warn" };
    return;
  }
  const dest = await saveNativeDialog({
    title: "Archive sketch",
    defaultPath: `${sketch.name}.zip`,
    filters: [{ name: "Zip archive", extensions: ["zip"] }],
  });
  if (typeof dest !== "string") return;
  try {
    await projectApi.archiveSketch(sketch.path, dest);
    toast.value = { text: `Sketch archived to ${dest}`, kind: "success" };
  } catch (e) {
    toast.value = {
      text: `Couldn't archive the sketch: ${errText(e)}`,
      kind: "warn",
    };
  }
}
