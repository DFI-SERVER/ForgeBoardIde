import { useEffect, useRef } from "preact/hooks";
import { effect } from "@preact/signals";
import * as monaco from "monaco-editor";
import {
  initMonaco,
  monacoThemeFor,
  fontFamilyFor,
  applyAppTheme,
} from "../lib/monaco-setup";
import {
  editorGroups,
  activeGroupIndex,
  fileContents,
  saveState,
  cursorPosition,
} from "../state/appState";
import { settings } from "../lib/settings";
import {
  markPathModifiedEverywhere,
  setActiveGroup,
} from "../lib/editor-groups";

/**
 * Map the user's editor preferences onto Monaco's option object. Kept apart
 * from the editor lifecycle so the same mapping seeds the initial `create`
 * call and every later `updateOptions` call — there is one source of truth.
 *
 * `detectIndentation` is forced off: the user has explicitly picked a tab
 * size in Settings, so Monaco must not silently override it from a file's
 * existing whitespace.
 */
function editorOptionsFromSettings(): monaco.editor.IEditorOptions &
  monaco.editor.IGlobalEditorOptions {
  const s = settings.value;
  return {
    fontSize: s.fontSize,
    tabSize: s.tabSize,
    detectIndentation: false,
    wordWrap: s.wordWrap ? "on" : "off",
    minimap: { enabled: s.minimap },
    lineNumbers: s.lineNumbers ? "on" : "off",
    bracketPairColorization: { enabled: s.bracketColorization },
    stickyScroll: { enabled: s.stickyScroll },
    guides: {
      indentation: s.indentGuides,
      highlightActiveIndentation: s.indentGuides,
      bracketPairs: false,
    },
    theme: monacoThemeFor(s.theme),
    fontFamily: fontFamilyFor(s.fontFamily),
    fontLigatures: s.fontLigatures,
  };
}

/**
 * Module-level reference to the live Monaco editor instance of the ACTIVE
 * group. Set while at least one editor is mounted; updated whenever focus
 * moves between groups. Lets non-React modules (the Edit menu, the shared
 * actions) reach the focused editor without prop drilling.
 */
let activeEditor: monaco.editor.IStandaloneCodeEditor | null = null;

/**
 * Re-entrancy depth for programmatic edits applied by non-typing code paths —
 * format-on-save, trim-on-save, future refactor operations. While non-zero the
 * content-change listener skips its work, so a programmatic rewrite cannot
 * accidentally mark a tab modified or re-arm the autosave timer right in the
 * middle of saving it.
 */
let programmaticEditDepth = 0;

/** The mounted Monaco editor instance of the focused group, or null when no
 *  editor is mounted (the welcome-screen empty state). */
export function getActiveEditor(): monaco.editor.IStandaloneCodeEditor | null {
  return activeEditor;
}

/**
 * Run `fn` with programmatic-edit suppression on. Any Monaco edits issued
 * inside the callback will not trip the change listener's modified-flag
 * bookkeeping. Re-entrant: nested calls stack correctly.
 */
export function withProgrammaticEdit<T>(fn: () => T): T {
  programmaticEditDepth++;
  try {
    return fn();
  } finally {
    programmaticEditDepth--;
  }
}

/**
 * Get or create the Monaco text model for `path`. Multiple editor instances
 * can share the same model — Monaco repaints them in sync — but a URI is
 * unique per process, so `createModel` would throw on duplicate. The helper
 * checks `getModel(uri)` first to honour that uniqueness.
 *
 * `path` is the absolute on-disk path; we encode it as a `file://` URI so
 * Monaco's marker-by-path lookups in `lib/actions.ts` line up.
 */
function getOrCreateModel(
  path: string,
  initialContent: string,
): monaco.editor.ITextModel {
  // Monaco URIs use forward slashes and lowercase drive letters on Windows.
  // The existing diagnostic painter normalises raw compile paths to the
  // same shape, so we follow its normalisation here too.
  const normalized = path
    .replace(/\\/g, "/")
    .replace(/^([a-zA-Z]):/, (_, d: string) => `/${d.toLowerCase()}:`)
    .replace(/^\/?/, "/");
  const uri = monaco.Uri.parse(`file://${normalized}`);
  const existing = monaco.editor.getModel(uri);
  if (existing) return existing;
  const ext = path.split(".").pop() ?? "";
  const language = ext === "ino" || ext === "pde" ? "arduino" : "cpp";
  return monaco.editor.createModel(initialContent, language, uri);
}

interface MonacoEditorProps {
  /** The editor group this instance belongs to. Determines which tab feeds
   *  it, where view-state is cached, and what `setActiveGroup` fires on
   *  focus. */
  groupId: string;
}

export function MonacoEditor({ groupId }: MonacoEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  // True while we programmatically swap the model on a tab change, so the
  // change listener does not mistake the swap for a real user edit.
  const swapping = useRef(false);
  // Per-(group, path) Monaco view-state cache, so a group remembers each
  // file's cursor + scroll independently of the other pane. Lives in a ref
  // so it survives re-renders without subscribing them to its mutations.
  const viewStates = useRef<
    Map<string, monaco.editor.ICodeEditorViewState>
  >(new Map());
  // The path the editor's model is currently showing — captured in a ref so
  // the model-swap effect knows what view-state to save before swapping.
  const currentPathRef = useRef<string | null>(null);

  // Mount Monaco. Effect runs once per mount; the empty dep array on every
  // editor is intentional — the editor is created once, then `setModel` swaps
  // the displayed file rather than tearing the editor down.
  useEffect(() => {
    if (!hostRef.current) return;
    initMonaco();
    const editor = monaco.editor.create(hostRef.current, {
      value: "",
      language: "arduino",
      lineHeight: 24,
      scrollBeyondLastLine: false,
      renderLineHighlight: "line",
      smoothScrolling: true,
      cursorBlinking: "smooth",
      // The caret glides to its new position instead of teleporting — the
      // single highest-feel editor option (Cursor/Zed both ship it on).
      cursorSmoothCaretAnimation: "on",
      padding: { top: 12, bottom: 12 },
      automaticLayout: true,
      insertSpaces: true,
      // Font size, tab size, word wrap, minimap and line numbers are all
      // driven by the persisted Settings — seed them here, keep them in
      // sync via the effect() below.
      ...editorOptionsFromSettings(),
    });
    editorRef.current = editor;

    // Re-apply the editor preferences whenever Settings change. effect() runs
    // the body once immediately and again on every later change to the
    // settings signal. Each MonacoEditor instance owns its own subscription
    // so a settings change reaches every pane.
    const stopSettingsSync = effect(() => {
      const s = settings.value;
      // Theme is a global concern (writes data-theme on <html>); the second
      // editor would otherwise re-apply it for no extra effect — harmless.
      applyAppTheme(s.theme);
      editor.updateOptions(editorOptionsFromSettings());
    });

    // On content change, mark file as modified and stage save. Multiple
    // editor instances may share the same model (a file open in both
    // panes), but Monaco fires `onDidChangeModelContent` on each editor
    // for any change — that would double-mark and double-save. Guard by
    // only acting when this editor is the active group's editor.
    const disposable = editor.onDidChangeModelContent(() => {
      if (swapping.current) return; // ignore programmatic tab-swap edits
      if (programmaticEditDepth > 0) return; // ignore on-save / refactor edits
      // Skip echoes — content changes propagated to this editor because a
      // sibling pane edits the same model. We only want to act on edits the
      // user actually typed in THIS editor.
      const groups = editorGroups.value;
      const idx = groups.findIndex((g) => g.id === groupId);
      if (idx !== activeGroupIndex.value) return;
      const group = groups[idx];
      const tab = group?.tabs[group.activeTabIndex];
      if (!tab) return;
      const newContents = new Map(fileContents.value);
      newContents.set(tab.path, editor.getValue());
      fileContents.value = newContents;
      // Flip the modified dot on EVERY tab pointing at this path, across
      // both groups — a file in two panes only has one truth.
      markPathModifiedEverywhere(tab.path);
      saveState.value = "unsaved";
    });

    // Mirror the caret of the FOCUSED editor into appState so the status
    // bar shows "Ln X, Col Y" for whatever the user is currently typing in.
    const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
      const groups = editorGroups.value;
      const idx = groups.findIndex((g) => g.id === groupId);
      if (idx !== activeGroupIndex.value) return;
      cursorPosition.value = {
        line: e.position.lineNumber,
        column: e.position.column,
      };
    });

    // Pane focus tracking: clicking inside the editor body makes this
    // group active. Monaco's onDidFocusEditorWidget fires when the editor
    // gains focus for any reason (click, keyboard tab-into, programmatic).
    const focusDisposable = editor.onDidFocusEditorWidget(() => {
      setActiveGroup(groupId);
    });

    return () => {
      stopSettingsSync();
      disposable.dispose();
      cursorDisposable.dispose();
      focusDisposable.dispose();
      editor.dispose();
      if (activeEditor === editor) activeEditor = null;
      // The view-states map is per-instance; it dies with the editor.
      // We deliberately do NOT dispose the shared models — another pane
      // may still be using them, and they remain valid for future mounts
      // of the same file. Models are leaked across an open sketch's
      // lifetime by design; `loadSketch` rebuilds the world.
    };
  }, [groupId]);

  // Swap the editor's model when the group's active tab changes — keyed on
  // the group's active path, NOT on the whole openTabs array (which churns
  // on every keystroke and would reset the cursor mid-edit).
  const groups = editorGroups.value;
  const myGroup = groups.find((g) => g.id === groupId);
  const myActivePath = myGroup?.tabs[myGroup.activeTabIndex]?.path;
  // Read fileContents so a content swap from another tab path triggers
  // the effect; we only USE it for the seed value on first mount of a model.
  const contents = fileContents.value;

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    // Stash the outgoing model's view state in this group's per-path cache
    // before swapping, so a return to it later restores scroll + cursor.
    const outgoing = currentPathRef.current;
    if (outgoing && outgoing !== myActivePath) {
      const state = editor.saveViewState();
      if (state) viewStates.current.set(outgoing, state);
    }

    if (!myActivePath) {
      // No tab active in this group — keep the editor mounted but blank.
      // Don't dispose the model; another pane may be using it.
      editor.setModel(null);
      currentPathRef.current = null;
      // The status-bar caret signal should track only the FOCUSED editor's
      // position. When the user closes the last tab in the focused pane,
      // collapse the caret display to 1,1.
      const idx = groups.findIndex((g) => g.id === groupId);
      if (idx === activeGroupIndex.value) {
        cursorPosition.value = { line: 1, column: 1 };
      }
      return;
    }

    const seed = contents.get(myActivePath) ?? "";
    swapping.current = true;
    const model = getOrCreateModel(myActivePath, seed);
    // Set this model on the editor. If a sibling pane was already showing
    // the same model, both panes now view it in sync.
    editor.setModel(model);
    // If a view state was cached for this (group, path) pair, restore it.
    // Otherwise, leave Monaco's default — top of file, line 1.
    const cached = viewStates.current.get(myActivePath);
    if (cached) editor.restoreViewState(cached);
    swapping.current = false;
    currentPathRef.current = myActivePath;
    // setModel resets the caret if no view state was restored. Sync the
    // status-bar signal only if this is the focused pane.
    const idx = groups.findIndex((g) => g.id === groupId);
    if (idx === activeGroupIndex.value && !cached) {
      cursorPosition.value = { line: 1, column: 1 };
    }
  }, [groupId, myActivePath]);

  // Keep `activeEditor` (module global) pointing at the FOCUSED group's
  // editor. The Edit menu, find/replace, format actions etc. all reach for
  // this single ref. We update it inside an effect rather than in the focus
  // listener so the initial mount also picks the active group's editor up.
  const activeIdx = activeGroupIndex.value;
  const myIdx = groups.findIndex((g) => g.id === groupId);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (myIdx === activeIdx) {
      activeEditor = editor;
    }
  }, [activeIdx, myIdx]);

  // Pointer-down anywhere inside the editor host (not just where Monaco's
  // own widget focuses) routes the click to setActiveGroup. Monaco's focus
  // event already covers most clicks, but the host element extends past
  // the editor's textarea (the gutter, scrollbars, padding) and we want
  // those to also count.
  function onHostPointerDown() {
    setActiveGroup(groupId);
  }

  return (
    <div
      ref={hostRef}
      style={{ height: "100%", width: "100%" }}
      onPointerDown={onHostPointerDown}
    />
  );
}
