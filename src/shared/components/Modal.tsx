import { useEffect } from "preact/hooks";
import type { ComponentChildren } from "preact";
import "./Modal.css";

/**
 * A themed in-app modal — overlay + centered panel. Closes on Escape or an
 * overlay click. Replaces the browser's native prompt()/alert() chrome.
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div class="modal-title">{title}</div>
        <div class="modal-body">{children}</div>
      </div>
    </div>
  );
}
