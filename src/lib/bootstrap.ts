import { projectApi, type Sketch } from "../ipc/project";
import { loadSketch } from "./sketch";

/** On app start, reopen the most recent sketch or create a default "hello" sketch. */
export async function bootstrapProject() {
  const recent = await projectApi.listRecent();
  let sketch: Sketch | undefined;

  if (recent.length > 0) {
    try {
      sketch = await projectApi.open(recent[0].path);
    } catch {
      /* recent entry is stale — fall through and create */
    }
  }
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
