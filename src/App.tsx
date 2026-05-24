import { TitleBar } from "./components/TitleBar";
import { ActionBar } from "./components/ActionBar";
import { LeftRail } from "./components/LeftRail";
import { FileSidebar } from "./components/FileSidebar";
import { EditorArea } from "./components/EditorArea";
import { BottomPanel } from "./components/BottomPanel";
import { StatusBar } from "./components/StatusBar";
import { Toast } from "./components/Toast";
import { NewSketchDialog } from "./components/NewSketchDialog";
import { CommandPalette } from "./components/CommandPalette";
import { KeyboardShortcutsModal } from "./components/KeyboardShortcutsModal";
import { ResizeHandle } from "./components/ResizeHandle";
import { SIDEBAR } from "./lib/layout";

export default function App() {
  return (
    <div class="app-shell">
      <TitleBar />
      <ActionBar />
      <div class="app-body">
        <LeftRail />
        <FileSidebar />
        <EditorArea />
        {/* Splitter on the sidebar / editor seam. It lives here, not in
            FileSidebar, so it can straddle the seam without the sidebar's
            overflow clipping it. */}
        <ResizeHandle
          spec={SIDEBAR}
          axis="x"
          direction={1}
          variant="resize-handle-sidebar"
          label="Resize the sidebar"
        />
      </div>
      <BottomPanel />
      <StatusBar />
      <Toast />
      <NewSketchDialog />
      <CommandPalette />
      <KeyboardShortcutsModal />
    </div>
  );
}
