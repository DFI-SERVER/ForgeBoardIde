import "./EditorArea.css";
import { useRef, useState } from "preact/hooks";
import { MonacoEditor } from "./MonacoEditor";
import { TabBar } from "./TabBar";
import { WelcomeScreen } from "./WelcomeScreen";
import { editorGroups, activeGroupIndex } from "@/features/editor/state";
import { setActiveGroup } from "@/features/editor/editor-groups";

/**
 * The editor area — one Monaco pane per group, with a resizable splitter
 * between them when a split is active. WelcomeScreen replaces the editor
 * when no tabs are open.
 */
export function EditorArea() {
  const groups = editorGroups.value;
  const activeIdx = activeGroupIndex.value;

  if (groups.length === 1) {
    return (
      <SingleGroupPane group={groups[0]} active />
    );
  }

  // Two-group split: render side-by-side with a draggable splitter.
  return (
    <SplitEditorArea>
      {groups.map((g, i) => (
        <SingleGroupPane
          key={g.id}
          group={g}
          active={i === activeIdx}
        />
      ))}
    </SplitEditorArea>
  );
}

interface SingleGroupPaneProps {
  group: { id: string; tabs: { path: string; name: string; modified: boolean }[]; activeTabIndex: number };
  active: boolean;
}

function SingleGroupPane({ group, active }: SingleGroupPaneProps) {
  const hasTabs = group.tabs.length > 0;
  function onPaneClick() {
    setActiveGroup(group.id);
  }
  return (
    <main
      class={`editor-area ${active ? "editor-area-active" : ""}`}
      onMouseDownCapture={onPaneClick}
    >
      {hasTabs && <TabBar groupId={group.id} />}
      <div class="editor-monaco-host">
        <MonacoEditor groupId={group.id} />
        {/* No file tabs open in this group — show the Welcome start screen
            over the (idle) editor instead of a blank pane. Only meaningful
            in the single-group layout; the second pane is created with
            tabs already and only goes empty if every one is closed (which
            collapses it back to single-group). */}
        {!hasTabs && <WelcomeScreen />}
      </div>
    </main>
  );
}

/**
 * Two-pane split layout. The left pane's flex-basis is driven by a CSS
 * variable on the wrapper that the splitter mutates during drag; the right
 * pane fills the remainder. State lives in CSS rather than in a signal so
 * a drag reflows the layout without re-rendering Preact each frame.
 */
function SplitEditorArea({ children }: { children: preact.ComponentChildren }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  // Persisted left-pane fraction so subsequent splits start at a familiar
  // size. Lives in localStorage to avoid coupling with the existing layout
  // module's PanelSpec shape (which is wider than we need here).
  const FRACTION_KEY = "forgeboard.editor-split-fraction";

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    document.body.classList.add("resizing-x");
  }

  function onPointerMove(e: PointerEvent) {
    if (!wrapRef.current) return;
    if (e.buttons === 0) {
      // Pointer was released outside; bail.
      endDrag(e);
      return;
    }
    const rect = wrapRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const fraction = Math.min(
      0.85,
      Math.max(0.15, (e.clientX - rect.left) / rect.width),
    );
    wrapRef.current.style.setProperty("--editor-split-fraction", String(fraction));
  }

  function endDrag(e: PointerEvent) {
    setDragging(false);
    document.body.classList.remove("resizing-x");
    try {
      const handle = e.currentTarget as HTMLElement;
      if (handle && handle.releasePointerCapture) {
        handle.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Capture might not have been claimed (e.g. cancellation); fine.
    }
    if (!wrapRef.current) return;
    const fraction = wrapRef.current.style.getPropertyValue(
      "--editor-split-fraction",
    );
    if (fraction) {
      try {
        localStorage.setItem(FRACTION_KEY, fraction.trim());
      } catch {
        // Storage full or unavailable — split fraction just won't persist.
      }
    }
  }

  // Hydrate the saved fraction on first mount.
  function setRef(el: HTMLDivElement | null) {
    wrapRef.current = el;
    if (!el) return;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(FRACTION_KEY);
    } catch {
      // Unavailable — fall through to default.
    }
    const fraction = stored && Number.isFinite(Number(stored)) ? stored : "0.5";
    el.style.setProperty("--editor-split-fraction", fraction);
  }

  return (
    <div class="editor-split" ref={setRef}>
      {children}
      <div
        class={`editor-split-handle ${dragging ? "dragging" : ""}`}
        role="separator"
        aria-orientation="vertical"
        title="Resize the split — drag to resize, double-click to reset"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDblClick={() => {
          if (!wrapRef.current) return;
          wrapRef.current.style.setProperty("--editor-split-fraction", "0.5");
          try {
            localStorage.setItem(FRACTION_KEY, "0.5");
          } catch {
            // ignored
          }
        }}
      />
    </div>
  );
}
