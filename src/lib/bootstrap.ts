import { projectApi, type Sketch } from "../ipc/project";
import { loadSketch } from "./sketch";
import { consumeSketchHashOverride } from "./window-mgmt";

/**
 * On app start, open a sketch into the editor.
 *
 * Priority:
 *  1. A `#sketch=<path>` URL-hash override — used by child windows spawned
 *     from a Recent click in another window, so the child opens THAT
 *     sketch and not the most-recent in the global list.
 *  2. The most-recently-opened sketch in the recent list.
 *  3. A fresh "hello" template, created on disk if needed.
 */
export async function bootstrapProject() {
  let sketch: Sketch | undefined;

  // 1. Child-window hint — open the requested sketch and clear the hash.
  const override = consumeSketchHashOverride();
  if (override) {
    try {
      sketch = await projectApi.open(override);
    } catch {
      /* path is stale / missing — fall through to recent / hello */
    }
  }

  // 2. Most-recent sketch.
  if (!sketch) {
    const recent = await projectApi.listRecent();
    if (recent.length > 0) {
      try {
        sketch = await projectApi.open(recent[0].path);
      } catch {
        /* recent entry is stale — fall through and create */
      }
    }
  }

  // 3. Fall back to a fresh "hello".
  if (!sketch) {
    try {
      sketch = await projectApi.create("hello");
    } catch {
      // "hello" already exists — open it instead
      const root = await projectApi.sketchesRoot();
      sketch = await projectApi.open(`${root}/hello`);
    }
  }
  if (!sketch) throw new Error("bootstrap: could not open or create a sketch");

  await loadSketch(sketch);
}
