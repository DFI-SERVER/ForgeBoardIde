import { TitleBar } from "./components/TitleBar";
import { ActionBar } from "./components/ActionBar";
import { LeftRail } from "./components/LeftRail";
import { FileSidebar } from "./components/FileSidebar";
import { EditorArea } from "./components/EditorArea";
import { BottomPanel } from "./components/BottomPanel";
import { StatusBar } from "./components/StatusBar";
import { Toast } from "./components/Toast";

export default function App() {
  return (
    <div class="app-shell">
      <TitleBar />
      <ActionBar />
      <div class="app-body">
        <LeftRail />
        <FileSidebar />
        <EditorArea />
      </div>
      <BottomPanel />
      <StatusBar />
      <Toast />
    </div>
  );
}
