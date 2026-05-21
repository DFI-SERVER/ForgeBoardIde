import { useEffect, useRef, useState } from "preact/hooks";
import { ChevronDown } from "lucide-preact";
import { installedBoards, selectedFqbn } from "../state/appState";
import { arduinoApi } from "../ipc/arduino";
import "./BoardSelector.css";

export function BoardSelector() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Populate the board list once so the button can show the current board name.
  useEffect(() => {
    if (installedBoards.value.length === 0) {
      arduinoApi.listBoards().then((b) => (installedBoards.value = b)).catch(console.error);
    }
  }, []);

  // Close when clicking outside the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const current = installedBoards.value.find((b) => b.fqbn === selectedFqbn.value);
  const list = installedBoards.value.filter(
    (b) => !filter || b.name.toLowerCase().includes(filter.toLowerCase()),
  );

  function pick(fqbn: string) {
    selectedFqbn.value = fqbn;
    setOpen(false);
    setFilter("");
  }

  return (
    <div class="bs-wrapper" ref={wrapRef}>
      <button class="bs-btn" onClick={() => setOpen(!open)}>
        <span class="bs-icon">◆</span>
        <span class="bs-label">{current?.name ?? "Select board"}</span>
        <span class="bs-caret">
          <ChevronDown size={14} strokeWidth={1.5} color="currentColor" />
        </span>
      </button>
      {open && (
        <div class="bs-dropdown">
          <input
            class="bs-search"
            placeholder="Search installed boards…"
            value={filter}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
            autofocus
          />
          <div class="bs-list">
            {list.map((b) => (
              <button
                key={b.fqbn}
                class={`bs-item ${b.fqbn === selectedFqbn.value ? "active" : ""}`}
                onClick={() => pick(b.fqbn)}
              >
                <div class="bs-item-name">{b.name}</div>
                <div class="bs-item-fqbn">{b.fqbn}</div>
              </button>
            ))}
            {list.length === 0 && (
              <div class="bs-empty">
                {installedBoards.value.length === 0
                  ? "Loading boards…"
                  : "No match. Install a core in the Boards view."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
