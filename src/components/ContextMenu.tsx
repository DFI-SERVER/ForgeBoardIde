import "./ContextMenu.css";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ComponentType } from "preact";
import type { LucideProps } from "lucide-preact";
import { clampMenuPosition } from "../lib/context-menu-position";

/* ------------------------------------------------------------- model --- */

/** A clickable row in a {@link ContextMenu}. */
export interface ContextMenuAction {
  kind?: "item";
  /** Visible label. */
  label: string;
  /** Optional leading icon — a lucide-preact icon component. */
  icon?: ComponentType<LucideProps>;
  /** Optional right-aligned shortcut hint, e.g. "Del". */
  shortcut?: string;
  /** Greyed out and non-interactive when true. */
  disabled?: boolean;
  /** Renders the row in the error colour (e.g. Delete). */
  danger?: boolean;
  /** Invoked when the row is chosen; the menu closes first. */
  onSelect: () => void;
}

/** A hairline divider between groups of rows. */
export interface ContextMenuSeparator {
  kind: "separator";
}

export type ContextMenuItem = ContextMenuAction | ContextMenuSeparator;

/** A separator constant for terse menu definitions. */
export const menuSeparator: ContextMenuSeparator = { kind: "separator" };

function isSeparator(item: ContextMenuItem): item is ContextMenuSeparator {
  return item.kind === "separator";
}

/* --------------------------------------------------------- component --- */

/**
 * A floating, cursor-anchored context menu.
 *
 * Opens at `{ x, y }` and clamps itself to the viewport so it never overflows
 * a window edge (see {@link clampMenuPosition}). Dismisses on Escape, on a
 * click/right-click anywhere outside it, and on choosing an item — all routed
 * through `onClose`. The caller owns visibility: render it only while open.
 */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Start at the requested point; corrected to a clamped point once the menu
  // has been measured (see the layout effect below).
  const [pos, setPos] = useState({ x, y });

  // Measure the rendered menu and clamp it into the viewport before paint, so
  // it never visibly jumps. Re-runs if the anchor point changes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos(
      clampMenuPosition(
        { x, y },
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [x, y, items]);

  // Dismiss on Escape or any outside pointer press. `mousedown` (not click)
  // closes promptly and before a fresh right-click elsewhere reopens a menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onOutside, true);
    // A right-click outside also dismisses; the new menu opens via its own
    // oncontextmenu handler afterwards.
    document.addEventListener("contextmenu", onOutside, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onOutside, true);
      document.removeEventListener("contextmenu", onOutside, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      class="context-menu"
      role="menu"
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
      // Keep clicks/right-clicks inside the menu from bubbling to handlers
      // that would dismiss it or open another menu.
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {items.map((item, i) => {
        if (isSeparator(item)) {
          return <div class="context-menu-separator" key={`sep-${i}`} />;
        }
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            class={`context-menu-item${item.danger ? " danger" : ""}${
              item.disabled ? " disabled" : ""
            }`}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              onClose();
              item.onSelect();
            }}
          >
            <span class="context-menu-icon">
              {Icon && <Icon size={14} strokeWidth={1.5} />}
            </span>
            <span class="context-menu-label">{item.label}</span>
            {item.shortcut && (
              <span class="context-menu-shortcut">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
