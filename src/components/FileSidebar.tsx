import "./FileSidebar.css";
import { activeRail } from "../state/appState";

function FilesView() {
  return (
    <>
      <div class="sb-header">
        <span class="sb-title">Your files</span>
        <span class="sb-new">+ new</span>
      </div>
      <div class="sb-body">
        <div class="sb-section-label">THIS SKETCH</div>
        <div class="sb-folder">
          <span class="sb-caret">▾</span> led-chase
        </div>
        <div class="sb-file active">
          <span class="sb-mod">●</span> led-chase.ino
        </div>
        <div class="sb-file">pins.h</div>
        <div class="sb-file">config.h</div>
        <div class="sb-add">+ add file</div>

        <div class="sb-section-label">RECENT</div>
        <div class="sb-folder muted">wifi-scanner</div>
        <div class="sb-folder muted">dht-reader</div>
        <div class="sb-folder muted">blink</div>
      </div>
    </>
  );
}

function PlaceholderView({ label }: { label: string }) {
  return (
    <div class="sb-body">
      <div class="sb-placeholder">{label} view coming in a later phase.</div>
    </div>
  );
}

export function FileSidebar() {
  const rail = activeRail.value;
  return (
    <aside class="sidebar">
      {rail === "files" && <FilesView />}
      {rail === "home" && <PlaceholderView label="Home" />}
      {rail === "examples" && <PlaceholderView label="Examples" />}
      {rail === "search" && <PlaceholderView label="Search" />}
      {rail === "libraries" && <PlaceholderView label="Libraries" />}
      {rail === "boards" && <PlaceholderView label="Boards" />}
      {rail === "walkthrough" && <PlaceholderView label="Walkthrough" />}
      {rail === "settings" && <PlaceholderView label="Settings" />}
    </aside>
  );
}
