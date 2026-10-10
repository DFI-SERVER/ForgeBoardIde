import { TitleBar } from "./components/TitleBar";
import { ActionBar } from "./components/ActionBar";
import { LeftRail } from "./components/LeftRail";
import { FileSidebar } from "@/features/project/components/FileSidebar";
import { EditorArea } from "@/features/editor/components/EditorArea";
import { BottomPanel } from "./components/BottomPanel";
import { StatusBar } from "./components/StatusBar";
import { Toast } from "./components/Toast";
import { NewSketchDialog } from "@/features/project/components/NewSketchDialog";
import { BurnBootloaderDialog } from "@/features/boards/components/BurnBootloaderDialog";
import { CommandPalette } from "@/features/commands/components/CommandPalette";
import { KeyboardShortcutsModal } from "@/features/commands/components/KeyboardShortcutsModal";
import { SetupCheckDialog } from "./components/SetupCheckDialog";
import { UpdateDialog } from "./components/UpdateDialog";
import { ResizeHandle } from "./components/ResizeHandle";
import { SIDEBAR } from "./layout";

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
      <BurnBootloaderDialog />
      <CommandPalette />
      <KeyboardShortcutsModal />
      <SetupCheckDialog />
      <UpdateDialog />
    </div>
  );
}
