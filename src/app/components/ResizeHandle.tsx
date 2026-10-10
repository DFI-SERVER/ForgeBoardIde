import "./ResizeHandle.css";
import { useRef, useState } from "preact/hooks";
import { type PanelSpec, getSize, applySize, commitSize } from "@/app/layout";

interface ResizeHandleProps {
  /** Which panel dimension this handle resizes. */
  spec: PanelSpec;
  /**
   * Pointer axis to track: "x" for a handle on a vertical edge (resizes
   * width), "y" for one on a horizontal edge (resizes height).
   */
  axis: "x" | "y";
  /**
   * Sign mapping pointer movement to size change. +1 when the panel grows as
   * the pointer moves down / right (the sidebar's right edge); -1 when it
   * grows as the pointer moves up / left (the bottom panel's top edge).
   */
  direction: 1 | -1;
  /** Edge-specific positioning class, e.g. "resize-handle-sidebar". */
  variant: string;
  /** What the handle resizes — used for the tooltip and accessible name. */
  label: string;
}

/**
 * A thin draggable splitter sitting on a panel edge. Dragging resizes the
 * panel live; releasing persists the new size; double-clicking resets it to
 * the shipped default. The size itself lives in `lib/layout` as a CSS
 * variable, so a drag reflows the layout without any Preact re-render.
 */
export function ResizeHandle({
  spec,
  axis,
  direction,
  variant,
  label,
}: ResizeHandleProps) {
  // Origin of the in-flight drag: pointer coordinate and panel size at press.
  const origin = useRef<{ pointer: number; size: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    origin.current = {
      pointer: axis === "x" ? e.clientX : e.clientY,
      size: getSize(spec),
    };
    setDragging(true);
    document.body.classList.add(`resizing-${axis}`);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!origin.current) return;
    const pointer = axis === "x" ? e.clientX : e.clientY;
    const delta = (pointer - origin.current.pointer) * direction;
    applySize(spec, origin.current.size + delta);
  }

  function endDrag() {
    if (!origin.current) return;
    origin.current = null;
    setDragging(false);
    document.body.classList.remove(`resizing-${axis}`);
    commitSize(spec, getSize(spec)); // persist the size the drag landed on
  }

  return (
    <div
      class={`resize-handle ${variant} ${dragging ? "dragging" : ""}`}
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      title={`${label} — drag to resize, double-click to reset`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDblClick={() => commitSize(spec, spec.default)}
    />
  );
}
