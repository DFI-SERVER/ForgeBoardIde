import "./TabBar.css";
import { Plus, X } from "lucide-preact";
import { editorGroups, activeGroupIndex } from "@/features/editor/state";
import { closeTab } from "@/features/editor/tabs";
import { setActiveGroup, updateActiveGroup, closeGroup } from "@/features/editor/editor-groups";
import { iconForName } from "@/shared/file-icons";
import { newSketch } from "@/features/project/actions";

interface TabBarProps {
  /** Which group's tabs to render. Each pane in a split layout has its own
   *  TabBar instance and renders its own group's tab list. */
  groupId: string;
}

export function TabBar({ groupId }: TabBarProps) {
  const groups = editorGroups.value;
  const group = groups.find((g) => g.id === groupId);
  if (!group) return null;
  const tabs = group.tabs;
  const isActive = groups[activeGroupIndex.value]?.id === groupId;
  const active = group.activeTabIndex;

  function setActive(i: number) {
    // Focus the group first, then set its active tab. setActiveGroup is a
    // no-op when the group is already active, so this is safe in either
    // case. The order matters: focusing the group syncs the mirrors before
    // we write the new index, so the writeback doesn't snap us back.
    setActiveGroup(groupId);
    if (isActive) {
      // Active group — go through the mirror; the bookkeeping effect will
      // write it back into editorGroups.
      updateActiveGroup({ activeTabIndex: i });
    } else {
      // Setting a tab in an inactive group implies focusing it too — once
      // setActiveGroup has run, this group IS the active one, and we can
      // write through `updateActiveGroup`.
      updateActiveGroup({ activeTabIndex: i });
    }
  }

  function onCloseClick(i: number, e: MouseEvent) {
    e.stopPropagation();
    // Closing a tab in a non-focused group: focus that group first so
    // `closeTab` (which operates on the active group) targets it.
    if (!isActive) setActiveGroup(groupId);
    // closeTab is async (it flushes any pending autosave before discarding
    // a modified tab) — fire-and-forget, the resulting state writes are
    // already picked up by the signals layer.
    void closeTab(i);
  }

  // The whole strip's pointerdown also routes to setActiveGroup so a click
  // on the strip's whitespace counts as focusing the pane.
  function onStripPointerDown() {
    setActiveGroup(groupId);
  }

  return (
    <div
      class={`tabbar ${isActive ? "" : "tabbar-inactive"}`}
      onPointerDown={onStripPointerDown}
    >
      {tabs.map((tab, i) => {
        const Icon = iconForName(tab.name);
        return (
          <button
            key={tab.path}
            class={`tab ${i === active ? "active" : ""} ${tab.modified ? "modified" : ""}`}
            onClick={() => setActive(i)}
            onAuxClick={(e) => {
              // Middle-click (button === 1) closes the tab, matching VS Code
              // and every browser tab strip. Prevent the default so a stray
              // browser-style middle-click never tries to "open in new tab".
              if (e.button === 1) {
                e.preventDefault();
                if (!isActive) setActiveGroup(groupId);
                void closeTab(i);
              }
            }}
          >
            <span class="tab-icon">
              <Icon size={13} strokeWidth={1.6} />
            </span>
            <span class="tab-name">{tab.name}</span>
            {/* The close affordance and the modified-indicator share the
                same slot. CSS shows the dot when modified + unhovered, and
                the X otherwise (or on hover, even when modified). */}
            <span class="tab-trailing">
              <span class="tab-dot" aria-hidden="true" />
              <span
                class="tab-x"
                aria-label={`Close ${tab.name}`}
                onClick={(e) => onCloseClick(i, e as any)}
              >
                <X size={13} strokeWidth={1.6} />
              </span>
            </span>
          </button>
        );
      })}
      {/* Trailing-edge "+" opens the New Sketch dialog (name + Browse
          location picker). Only the active pane renders this in split
          layouts so the row doesn't double up the affordance. To add a
          file to the current sketch, use the Files sidebar. */}
      {isActive && (
        <button
          class="tabbar-new-window"
          title="New sketch"
          aria-label="New sketch"
          onClick={(e) => {
            e.stopPropagation();
            newSketch();
          }}
        >
          <Plus size={14} strokeWidth={1.7} />
        </button>
      )}
      {/* When this is a split layout (>1 group), every tab strip carries
          a close affordance that collapses just that pane. Hidden when
          there is only one group — closing it would leave the layout in a
          degenerate state. */}
      {groups.length > 1 && (
        <button
          class="tabbar-close-pane"
          title="Close this pane"
          aria-label="Close this pane"
          onClick={(e) => {
            e.stopPropagation();
            closeGroup(groupId);
          }}
        >
          <X size={13} strokeWidth={1.6} />
        </button>
      )}
    </div>
  );
}
