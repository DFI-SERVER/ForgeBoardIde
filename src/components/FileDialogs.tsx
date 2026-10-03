import { useState } from "preact/hooks";
import { Modal } from "./Modal";

/**
 * Small modal dialogs for the Files context menu — a name prompt (used by New
 * File / New Folder / Rename) and a delete confirmation. Both build on the
 * shared {@link Modal} and reuse the `.dlg-*` form styles, the same pattern
 * the New Sketch dialog established when the app dropped raw `prompt()`.
 */

/* --------------------------------------------------------- name prompt --- */

/**
 * A single-field name prompt. Resolves the typed name to `onSubmit`; the host
 * performs the operation and may report a failure back via the `error` prop
 * to keep the dialog open with the message shown.
 */
export function NameDialog({
  title,
  label,
  desc,
  initialValue = "",
  confirmLabel,
  busy = false,
  error,
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  /** Optional secondary line under the label — useful for showing where
   *  the file will land on disk (e.g. "in C:\sketches\blink"). */
  desc?: string;
  initialValue?: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    onSubmit(trimmed);
  }

  return (
    <Modal title={title} onClose={onClose}>
      <label class="dlg-label" for="file-name-input">
        {label}
      </label>
      {desc && <div class="dlg-desc">{desc}</div>}
      <input
        id="file-name-input"
        class="dlg-input"
        value={value}
        autofocus
        // Select an existing name so Rename can be retyped immediately.
        ref={(el) => {
          if (el && initialValue) el.select();
        }}
        onInput={(e) => setValue((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      {error && <div class="dlg-error">{error}</div>}
      <div class="dlg-actions">
        <button class="dlg-btn" onClick={onClose}>
          Cancel
        </button>
        <button
          class="dlg-btn dlg-btn-primary"
          disabled={busy || !value.trim()}
          onClick={submit}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------ delete confirm --- */

/**
 * A destructive-action confirmation. Names the target and notes that it goes
 * to the recycle bin (so it is recoverable). The confirm button is rendered
 * in the error colour.
 */
export function ConfirmDeleteDialog({
  name,
  isFolder = false,
  busy = false,
  error,
  onConfirm,
  onClose,
}: {
  name: string;
  isFolder?: boolean;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={`Delete ${isFolder ? "folder" : "file"}`} onClose={onClose}>
      <div class="dlg-confirm-text">
        Delete <span class="dlg-confirm-name">{name}</span>?
      </div>
      <div class="dlg-hint">
        It will be moved to the recycle bin, so you can recover it later.
      </div>
      {error && <div class="dlg-error">{error}</div>}
      <div class="dlg-actions">
        <button class="dlg-btn" onClick={onClose}>
          Cancel
        </button>
        <button
          class="dlg-btn dlg-btn-danger"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </Modal>
  );
}
