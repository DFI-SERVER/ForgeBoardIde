import "./EditorArea.css";

export function EditorArea() {
  return (
    <main class="editor-area">
      <div class="editor-placeholder">
        <div class="editor-placeholder-label">EDITOR</div>
        <div class="editor-placeholder-text">
          Monaco editor integration arrives in Phase 2.
        </div>
        <div class="editor-placeholder-sub">
          This region will host syntax-highlighted Arduino code with tabs,
          breadcrumb, and Smart Help squiggles.
        </div>
      </div>
    </main>
  );
}
