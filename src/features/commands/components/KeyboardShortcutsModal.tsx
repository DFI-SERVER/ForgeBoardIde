import "./KeyboardShortcutsModal.css";
import { useMemo, useRef, useState, useEffect } from "preact/hooks";
import { Search, SearchX } from "lucide-preact";
import { Modal } from "@/shared/components/Modal";
import { keyboardShortcutsOpen } from "@/features/commands/state";
import {
  keybindings,
  CATEGORY_ORDER,
  type Keybinding,
  type KeybindingCategory,
} from "@/features/commands/keybindings";

/**
 * Split a canonical combo string ("Ctrl+Shift+P") into its individual keys
 * ("Ctrl", "Shift", "P") so each can be rendered as its own keycap.
 */
function comboKeys(combo: string): string[] {
  return combo.split("+");
}

/** One keyboard shortcut row — its label and the combo as `<kbd>` keycaps. */
function ShortcutRow({ binding }: { binding: Keybinding }) {
  return (
    <div class="kbd-row">
      <span class="kbd-row-label">{binding.label}</span>
      <span class="kbd-row-combo">
        {comboKeys(binding.combo).map((key, i) => (
          <kbd class="kbd-cap" key={`${key}-${i}`}>
            {key}
          </kbd>
        ))}
      </span>
    </div>
  );
}

/**
 * The Keyboard Shortcuts reference. Mounted once in App.tsx; renders only when
 * `keyboardShortcutsOpen` is true. Opening remounts the body (see the `key`),
 * so the filter resets and the input re-autofocuses.
 */
export function KeyboardShortcutsModal() {
  if (!keyboardShortcutsOpen.value) return null;
  return <KeyboardShortcutsModalBody />;
}

function KeyboardShortcutsModalBody() {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    keyboardShortcutsOpen.value = false;
  };

  // Autofocus the filter box when the modal opens.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /**
   * Keybindings filtered by the label query and bucketed by category. An
   * empty query keeps every group; a non-matching query drops a group
   * entirely. Categories appear in `CATEGORY_ORDER`.
   */
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? keybindings.filter((k) => k.label.toLowerCase().includes(q))
      : keybindings;

    const result: { category: KeybindingCategory; items: Keybinding[] }[] = [];
    for (const category of CATEGORY_ORDER) {
      const items = matches.filter((k) => k.category === category);
      if (items.length > 0) result.push({ category, items });
    }
    return result;
  }, [query]);

  return (
    <Modal title="Keyboard Shortcuts" onClose={close}>
      <div class="kbd-search">
        <span class="kbd-search-icon">
          <Search size={15} strokeWidth={1.5} />
        </span>
        <input
          ref={inputRef}
          class="kbd-search-input"
          type="text"
          placeholder="Filter shortcuts…"
          value={query}
          aria-label="Filter shortcuts"
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
      </div>

      {groups.length === 0 ? (
        <div class="kbd-empty">
          <span class="kbd-empty-icon">
            <SearchX size={20} strokeWidth={1.5} />
          </span>
          <span>No matching shortcuts</span>
        </div>
      ) : (
        <div class="kbd-groups">
          {groups.map((group) => (
            <section class="kbd-group" key={group.category}>
              <div class="kbd-group-title">{group.category}</div>
              {group.items.map((binding) => (
                <ShortcutRow binding={binding} key={binding.id} />
              ))}
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
