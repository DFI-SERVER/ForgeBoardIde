/**
 * Pure geometry for the {@link ContextMenu} — kept out of the component so it
 * can be unit-tested without a DOM. Given the cursor point, the menu's own
 * size and the viewport size, it returns a top-left at which the menu fits
 * entirely on screen.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Clamp a context menu to the viewport.
 *
 * The menu prefers to open with its top-left at the cursor. If that would push
 * its right edge past the viewport, it flips to open leftward of the cursor;
 * likewise it flips upward when it would overflow the bottom. After flipping
 * it is still clamped so a menu taller or wider than the viewport pins to the
 * top-left edge rather than spilling off the opposite side. An 8px margin
 * keeps it off the very edge.
 */
export function clampMenuPosition(
  cursor: Point,
  menu: Size,
  viewport: Size,
  margin = 8,
): Point {
  let x = cursor.x;
  let y = cursor.y;

  // Flip leftward if opening rightward would overflow the right edge.
  if (x + menu.width > viewport.width - margin) {
    x = cursor.x - menu.width;
  }
  // Flip upward if opening downward would overflow the bottom edge.
  if (y + menu.height > viewport.height - margin) {
    y = cursor.y - menu.height;
  }

  // Final clamp — covers the flipped-too-far case and menus larger than the
  // viewport. Never let the top-left go below `margin`.
  const maxX = Math.max(margin, viewport.width - menu.width - margin);
  const maxY = Math.max(margin, viewport.height - menu.height - margin);
  x = Math.min(Math.max(x, margin), maxX);
  y = Math.min(Math.max(y, margin), maxY);

  return { x, y };
}
