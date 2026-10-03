// App.tsx — ForgeBoard mobile IDE shell: navigation, screen state, the flash
// chain, and the persisted Settings tweaks. Calm · monochrome direction.
//
// This is a self-contained preview of the Android port's UI. Transport
// (LAN build server, USB-OTG / WiFi-OTA) is mocked — the journeys are real
// stateful flows, the hardware calls behind them are not built yet.

import type { JSX } from "preact";
import { useState, useEffect } from "preact/hooks";
import { AndroidFrame } from "./AndroidFrame";
import { SKETCHES, SERIAL_LOG, starterCode, byteSize, countLines, type Sketch, type SerialLine } from "./data";
import { CODE_FONTS, type Tweaks, type Screen, type OtgState } from "./types";
import {
  TopChrome,
  SketchesScreen,
  NewSketchSheet,
  SketchMenu,
  EditorScreen,
  KeyRow,
  EditorActionBar,
  SerialScreen,
  SerialBottomBar,
  ConnectScreen,
  UsbPermissionDialog,
  LibrariesScreen,
  SettingsScreen,
  Toast,
} from "./screens";
import {
  IconFolder,
  IconCode,
  IconTerm,
  IconBoard,
  IconLibrary,
  IconSettings,
  IconMenu,
  IconCheck,
} from "./icons";

// ── persisted tweaks ─────────────────────────────────────────────────────────
const TWEAK_DEFAULTS: Tweaks = {
  theme: "dark",
  nav: "tabbar",
  codeFont: "JetBrains Mono",
  gutter: true,
  keyRow: true,
};
const TWEAK_KEY = "fb-mobile-tweaks";

function useTweaks(): [Tweaks, <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => void] {
  const [tweaks, setTweaks] = useState<Tweaks>(() => {
    try {
      const raw = localStorage.getItem(TWEAK_KEY);
      return raw ? { ...TWEAK_DEFAULTS, ...(JSON.parse(raw) as Partial<Tweaks>) } : TWEAK_DEFAULTS;
    } catch {
      return TWEAK_DEFAULTS;
    }
  });
  const setTweak = <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => {
    setTweaks((prev) => {
      const next = { ...prev, [k]: v };
      try {
        localStorage.setItem(TWEAK_KEY, JSON.stringify(next));
      } catch {
        /* private mode / quota — non-fatal */
      }
      return next;
    });
  };
  return [tweaks, setTweak];
}

// ── navigation surfaces ──────────────────────────────────────────────────────
interface NavItem {
  id: Screen;
  label: string;
  icon: JSX.Element;
}
const NAV_ITEMS: NavItem[] = [
  { id: "sketches", label: "Sketches", icon: <IconFolder size={18} /> },
  { id: "editor", label: "Editor", icon: <IconCode size={18} /> },
  { id: "serial", label: "Serial", icon: <IconTerm size={18} /> },
  { id: "connect", label: "Board", icon: <IconBoard size={18} /> },
  { id: "libraries", label: "Library", icon: <IconLibrary size={18} /> },
  { id: "settings", label: "Settings", icon: <IconSettings size={18} /> },
];

function TabBar({ current, onTab }: { current: Screen; onTab: (s: Screen) => void }) {
  return (
    <div className="ide-tabbar">
      {NAV_ITEMS.map((it) => (
        <button key={it.id} className={`tab ${current === it.id ? "active" : ""}`} onClick={() => onTab(it.id)}>
          <div className="icon-wrap">{it.icon}</div>
          <div>{it.label}</div>
          <div className="dot" />
        </button>
      ))}
    </div>
  );
}

function VerbRail({ current, onOpen }: { current: Screen; onOpen: () => void }) {
  const idx = NAV_ITEMS.findIndex((x) => x.id === current);
  const item = NAV_ITEMS[idx];
  return (
    <div className="verb-rail">
      <div className="cur">
        <b>{String(idx + 1).padStart(2, "0")}</b> · {item.label}
      </div>
      <button className="switch" onClick={onOpen}>
        <IconMenu size={16} /> Switch
      </button>
    </div>
  );
}

function SurfaceSwitcher({
  current,
  hints,
  onPick,
  onClose,
}: {
  current: Screen;
  hints: Record<Screen, string>;
  onPick: (s: Screen) => void;
  onClose: () => void;
}) {
  return (
    <div className="switcher-scrim" onClick={onClose}>
      <div className="switcher" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div className="sw-label">Go to surface</div>
        {NAV_ITEMS.map((s) => (
          <button
            key={s.id}
            className={`sw-item ${s.id === current ? "active" : ""}`}
            onClick={() => {
              onPick(s.id);
              onClose();
            }}
          >
            <div className="ico">{s.icon}</div>
            <div className="nm">{s.label}</div>
            <div className="hint">{hints[s.id]}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── honest flash chain: compile (indeterminate) → flash (%) → boot ───────────
function FlashOverlay({ sketch, onDone }: { sketch: Sketch; onDone: () => void }) {
  const [phase, setPhase] = useState<"compile" | "flash" | "done">("compile");
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setPhase("flash"), 1700);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase !== "flash") return;
    const start = Date.now();
    const id = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / 2600) * 100);
      setPct(p);
      if (p >= 100) {
        clearInterval(id);
        setPhase("done");
      }
    }, 50);
    return () => clearInterval(id);
  }, [phase]);

  const rank = { compile: 0, flash: 1, done: 2 }[phase];

  return (
    <div className="flash-overlay">
      <div className="head">FLASH · ESP32-S3 · /dev/ttyACM0</div>
      <div className="title">{phase === "done" ? "Forged." : "Forging."}</div>
      <div className="sub">
        {phase === "compile" && <>Compiling {sketch.name} on the build server</>}
        {phase === "flash" && <>Writing firmware to ForgeBoard {sketch.board}</>}
        {phase === "done" && <>{sketch.name} is live · hard reset complete</>}
      </div>

      <div className="flash-phases">
        <div className={`ph indet ${rank > 0 ? "done" : "active"}`}>
          <div className="bar">
            <i />
          </div>
          <div className="lbl">Compile</div>
        </div>
        <div className={`ph ${rank > 1 ? "done" : rank === 1 ? "active" : ""}`}>
          <div className="bar">
            <i
              style={{
                width: phase === "flash" ? `${pct}%` : rank > 1 ? "100%" : "0%",
                transition: "width .1s linear",
              }}
            />
          </div>
          <div className="lbl">Flash {phase === "flash" ? `${Math.round(pct)}%` : ""}</div>
        </div>
        <div className={`ph ${phase === "done" ? "done" : ""}`}>
          <div className="bar">
            <i style={{ width: phase === "done" ? "100%" : "0%" }} />
          </div>
          <div className="lbl">Boot</div>
        </div>
      </div>

      <div className="log">
        <div>
          resolve toolchain arduino-esp32 3.0 . . . <span className="ok">ok</span>
        </div>
        <div>
          compile {sketch.name} · 1 unit . . .{" "}
          {rank > 0 ? <span className="ok">ok · {sketch.size}</span> : <span style={{ opacity: 0.5 }}>working</span>}
        </div>
        {rank >= 1 && (
          <div>
            connecting /dev/ttyACM0 . . . <span className="ok">ok</span>
          </div>
        )}
        {rank >= 1 && <div>chip esp32-s3 (rev 0) · 8MB flash</div>}
        {phase === "flash" && pct > 30 && <div>writing 0x10000 → 0x100a0 . . .</div>}
        {phase === "flash" && pct > 70 && <div>writing 0x100a0 → 0x101a0 . . .</div>}
        {phase === "done" && (
          <div>
            verifying . . . <span className="ok">ok</span>
          </div>
        )}
        {phase === "done" && <div className="ok">→ hard reset · boot</div>}
      </div>

      {phase === "done" ? (
        <>
          <div className="done-stamp">
            <IconCheck size={14} /> Upload complete
          </div>
          <button className="close-verb" onClick={onDone}>
            Open serial monitor →
          </button>
        </>
      ) : (
        <div
          style={{
            marginTop: "auto",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: "var(--fg-3)",
          }}
        >
          Do not unplug the board
        </div>
      )}
    </div>
  );
}

// ── app shell ────────────────────────────────────────────────────────────────
// collision-proof id (Date.now alone can repeat on a fast double-tap)
let idSeq = 0;
const mkId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(idSeq++).toString(36)}`;

// keep filenames unique within a list (appends " 2", " 3", …)
function uniqueName(name: string, list: Sketch[]): string {
  const taken = new Set(list.map((s) => s.name));
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  while (taken.has(`${stem} ${i}${ext}`)) i++;
  return `${stem} ${i}${ext}`;
}

function makeSketch(name: string, board: string, code: string, open?: boolean): Sketch {
  return { id: mkId("s-"), name, board, edited: "now", code, lines: countLines(code), size: byteSize(code), open };
}

export function MobileApp() {
  const [tweaks, setTweak] = useTweaks();
  const [screen, setScreen] = useState<Screen>("editor");
  const [open, setOpen] = useState<Sketch>(SKETCHES[0]);
  const [userSketches, setUserSketches] = useState<Sketch[]>(SKETCHES);
  const [flashing, setFlashing] = useState(false);
  const [otgState, setOtgState] = useState<OtgState>("waiting");
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [serialLog, setSerialLog] = useState<SerialLine[]>(SERIAL_LOG);
  const [menuSketch, setMenuSketch] = useState<Sketch | null>(null);
  const [toast, setToast] = useState<{ msg: string; n: number } | null>(null);

  const showToast = (msg: string) => setToast({ msg, n: Date.now() });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1900);
    return () => clearTimeout(t);
  }, [toast]);

  // On a narrow (real phone) viewport, fill the screen; on desktop, show the bezel.
  const [bare, setBare] = useState(() => typeof window !== "undefined" && window.innerWidth <= 520);
  useEffect(() => {
    const onResize = () => setBare(window.innerWidth <= 520);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isVerb = tweaks.nav === "verb";

  const openSketch = (s: Sketch) => {
    setOpen(s);
    setScreen("editor");
    setDirty(false);
  };

  // Persist the open sketch: stamp the record and keep open + list in sync.
  const handleSave = () => {
    if (!dirty) return;
    const stamp = { edited: "now", size: byteSize(open.code), lines: countLines(open.code) };
    setOpen((o) => ({ ...o, ...stamp }));
    setUserSketches((p) => p.map((s) => (s.id === open.id ? { ...s, ...stamp } : s)));
    setDirty(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  };

  const handleCreate = ({ name, board, tpl }: { name: string; board: string; tpl: string }) => {
    const finalName = uniqueName(name, userSketches);
    const next = makeSketch(finalName, board, starterCode(tpl, finalName), true);
    setUserSketches((prev) => [next, ...prev]);
    setOpen(next);
    setNewOpen(false);
    setScreen("editor");
    setDirty(true); // a brand-new sketch is unsaved until first save
  };

  // Mocks the Android "open document" picker: pulls a .ino in from device
  // files into the offline sketch list and opens it.
  const handleOpenFile = () => {
    const name = uniqueName("imported.ino", userSketches);
    const next = makeSketch(name, "Sprint", starterCode("blank", name), true);
    setUserSketches((prev) => [next, ...prev]);
    setOpen(next);
    setScreen("editor");
    setDirty(false); // an opened file is already saved on disk
    showToast(`Imported ${name}`);
  };

  // Verify = compile-without-upload: a quick mocked result, no navigation.
  const handleVerify = () => showToast(`Compiled · ${open.size} · 0 errors`);

  // Serial REPL echo — the sent line shows up as a TX row.
  const handleSerialSend = (text: string) => {
    setSerialLog((log) => [...log, { t: "tx", tag: "TX", msg: text }]);
  };

  // Per-sketch file lifecycle
  const renameSketch = (id: string, name: string) => {
    const finalName = uniqueName(name, userSketches.filter((s) => s.id !== id));
    setUserSketches((p) => p.map((s) => (s.id === id ? { ...s, name: finalName } : s)));
    if (open.id === id) setOpen((o) => ({ ...o, name: finalName }));
    showToast(`Renamed to ${finalName}`);
  };
  const duplicateSketch = (s: Sketch) => {
    const name = uniqueName(s.name.replace(/\.ino$/, "") + "-copy.ino", userSketches);
    const copy: Sketch = { ...s, id: mkId("dup-"), name, edited: "now", open: false };
    setUserSketches((p) => [copy, ...p]);
    showToast(`Duplicated ${s.name}`);
  };
  const deleteSketch = (s: Sketch) => {
    const next = userSketches.filter((x) => x.id !== s.id);
    if (open.id === s.id) {
      if (next[0]) {
        setOpen(next[0]);
      } else {
        // last one removed — keep list and open in sync with a fresh untitled
        const fresh = makeSketch("untitled.ino", "Sprint", starterCode("blank", "untitled"), true);
        next.push(fresh);
        setOpen(fresh);
      }
    }
    setUserSketches(next);
    showToast(`Deleted ${s.name}`);
  };
  const shareSketch = (s: Sketch) => showToast(`Shared ${s.name}`);

  // custom property carries the chosen code font down to the editor/mono text
  const ideStyle = { "--font-mono": CODE_FONTS[tweaks.codeFont] } as unknown as JSX.CSSProperties;
  const showKeyRow = tweaks.keyRow && screen === "editor";

  const switcherHints: Record<Screen, string> = {
    sketches: `${userSketches.length} files`,
    editor: open.name,
    serial: "115200",
    connect: "USB-C",
    libraries: "registry",
    settings: "v0.4",
  };

  const ide = (
    <div
      className={`ide v-calm theme-${tweaks.theme} screen-${screen} ${tweaks.gutter ? "" : "no-gutter"}`}
      style={{ ...ideStyle, position: "relative", display: "flex", flexDirection: "column", height: "100%" }}
    >
          <TopChrome
            screen={screen}
            sketchName={open.name}
            onNew={() => setNewOpen(true)}
            onFlash={() => setFlashing(true)}
            onMenu={() => (isVerb ? setSwitcherOpen(true) : setScreen("sketches"))}
          />

          <div className="scroll">
            {screen === "sketches" && (
              <SketchesScreen
                onOpen={openSketch}
                onNew={() => setNewOpen(true)}
                onOpenFile={handleOpenFile}
                onSketchMenu={setMenuSketch}
                userSketches={userSketches}
                currentId={open.id}
              />
            )}
            {screen === "editor" && <EditorScreen sketch={open} dirty={dirty} saved={justSaved} />}
            {screen === "serial" && <SerialScreen boardLabel={open.board} log={serialLog} />}
            {screen === "connect" && (
              <ConnectScreen onFlash={() => setFlashing(true)} otgState={otgState} setOtgState={setOtgState} sketchName={open.name} />
            )}
            {screen === "libraries" && <LibrariesScreen onToast={showToast} />}
            {screen === "settings" && <SettingsScreen tweaks={tweaks} setTweak={setTweak} onToast={showToast} />}
          </div>

          {/* per-screen bottom slots */}
          {screen === "editor" && (
            <>
              {showKeyRow && <KeyRow />}
              <EditorActionBar
                onFlash={() => setFlashing(true)}
                onPlay={handleVerify}
                onSave={handleSave}
                dirty={dirty}
              />
            </>
          )}
          {screen === "serial" && <SerialBottomBar onSend={handleSerialSend} />}

          {/* navigation — tab bar or verb-per-surface */}
          {isVerb ? (
            <VerbRail current={screen} onOpen={() => setSwitcherOpen(true)} />
          ) : (
            <TabBar current={screen} onTab={setScreen} />
          )}

          {/* USB permission dialog when a device is detected */}
          {screen === "connect" && otgState === "detected" && (
            <UsbPermissionDialog onAllow={() => setOtgState("connected")} onDeny={() => setOtgState("waiting")} />
          )}

          {switcherOpen && (
            <SurfaceSwitcher
              current={screen}
              hints={switcherHints}
              onPick={setScreen}
              onClose={() => setSwitcherOpen(false)}
            />
          )}

          {newOpen && <NewSketchSheet onCreate={handleCreate} onClose={() => setNewOpen(false)} />}

          {menuSketch && (
            <SketchMenu
              sketch={menuSketch}
              onOpen={() => openSketch(menuSketch)}
              onRename={(name) => renameSketch(menuSketch.id, name)}
              onDuplicate={() => duplicateSketch(menuSketch)}
              onShare={() => shareSketch(menuSketch)}
              onDelete={() => deleteSketch(menuSketch)}
              onClose={() => setMenuSketch(null)}
            />
          )}

          {flashing && (
            <FlashOverlay
              sketch={open}
              onDone={() => {
                setFlashing(false);
                setScreen("serial");
              }}
            />
          )}

      {toast && <Toast key={toast.n} message={toast.msg} />}
    </div>
  );

  return bare ? (
    <div className="ide-bare">{ide}</div>
  ) : (
    <div className="fb-stage">
      <AndroidFrame dark={tweaks.theme === "dark"}>{ide}</AndroidFrame>
    </div>
  );
}
