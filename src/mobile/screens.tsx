// screens.tsx — the five screens of the ForgeBoard mobile IDE (Calm · mono).
// Ported from the Claude Design handoff; calm variant only.

import type { ComponentChildren } from "preact";
import { useState, useEffect } from "preact/hooks";
import {
  EXAMPLES,
  EXAMPLE_CATS,
  BOARD_MODELS,
  LIBRARIES,
  tokenize,
  exampleCode,
  type Sketch,
  type SerialLine,
} from "./data";
import { loadRegistry, getCachedRegistry, cmpVer, type RegLib } from "./registry";
import type { OtgState, Screen, Tweaks, CodeFont } from "./types";
import {
  IconBack,
  IconPlus,
  IconSearch,
  IconUpload,
  IconFile,
  IconFolder,
  IconCode,
  IconChevR,
  IconPlay,
  IconBolt,
  IconUndo,
  IconRedo,
  IconSave,
  IconCheck,
  IconDot2,
  IconUSB,
  IconChip,
  IconBoard,
  IconLibrary,
  IconDownload,
  IconDots,
  IconTrash,
  IconCopy,
  IconShare,
  IconEdit,
} from "./icons";

// ============================================================
// TOP CHROME (iOS large-title)
// ============================================================
export function TopChrome({
  screen,
  sketchName,
  onMenu,
  onNew,
  onFlash,
}: {
  screen: Screen;
  sketchName: string;
  onMenu: () => void;
  onNew: () => void;
  onFlash: () => void;
}) {
  const titles: Record<Screen, string> = {
    sketches: "Sketches",
    editor: sketchName,
    serial: "Serial monitor",
    connect: "Connect a board",
    libraries: "Libraries",
    settings: "Settings",
  };
  const isRoot = screen === "sketches";
  return (
    <div className="topbar ios">
      <div className="ios-navrow">
        <button className="ios-lead" aria-label={isRoot ? "Menu" : "Back"} onClick={onMenu}>
          {isRoot ? (
            <img className="fb-mark" src="/forgeboard-logo.png" width={24} height={24} alt="ForgeBoard" />
          ) : (
            <>
              <IconBack size={20} />
              <span>Back</span>
            </>
          )}
        </button>
        <div className="spacer" />
        {screen === "editor" && <div className="ed-title">{sketchName}</div>}
        {screen === "sketches" && (
          <button className="ios-trail" aria-label="New sketch" onClick={onNew}>
            <IconPlus size={23} />
          </button>
        )}
        {screen === "editor" && (
          <button className="ios-trail" aria-label="Flash" onClick={onFlash}>
            <IconUpload size={21} />
          </button>
        )}
      </div>
      <h1 className="ios-large-title">{titles[screen]}</h1>
    </div>
  );
}

// ============================================================
// SCREEN 1 — Sketches (My sketches + Examples)
// ============================================================
function SketchCard({
  name,
  sub,
  isExample,
  active,
  onOpen,
  onMenu,
}: {
  name: string;
  sub: ComponentChildren;
  isExample?: boolean;
  active: boolean;
  onOpen: () => void;
  onMenu?: () => void;
}) {
  return (
    <div className={`card ${active ? "active" : ""}`}>
      <button className="card-main" onClick={onOpen}>
        <div className="glyph">{isExample ? <IconCode size={18} /> : <IconFile size={18} />}</div>
        <div className="body">
          <div className="name">{name}</div>
          <div className="sub">{sub}</div>
        </div>
      </button>
      {onMenu ? (
        <button className="card-menu" aria-label="Sketch actions" onClick={onMenu}>
          <IconDots size={18} />
        </button>
      ) : (
        <span className="right">
          <IconChevR size={16} />
        </span>
      )}
    </div>
  );
}

export function SketchesScreen({
  onOpen,
  onNew,
  onOpenFile,
  onSketchMenu,
  currentId,
  userSketches,
}: {
  onOpen: (s: Sketch) => void;
  onNew: () => void;
  onOpenFile: () => void;
  onSketchMenu: (s: Sketch) => void;
  currentId: string;
  userSketches: Sketch[];
}) {
  const [tab, setTab] = useState<"mine" | "examples">("mine");

  return (
    <>
      <div className="sketch-seg">
        <div className="seg">
          <button className={tab === "mine" ? "on" : ""} onClick={() => setTab("mine")}>
            My sketches
          </button>
          <button className={tab === "examples" ? "on" : ""} onClick={() => setTab("examples")}>
            Examples
          </button>
        </div>
      </div>

      {tab === "mine" ? (
        <div className="list">
          <button className="new-row" onClick={onNew}>
            <span className="np">
              <IconPlus size={18} />
            </span>
            <span className="nt">New sketch</span>
            <span className="nh">.ino</span>
          </button>
          <button className="new-row open-row" onClick={onOpenFile}>
            <span className="np">
              <IconFolder size={17} />
            </span>
            <span className="nt">Open sketch</span>
            <span className="nh">from files</span>
          </button>
          {userSketches.map((s) => (
            <SketchCard
              key={s.id}
              name={s.name}
              active={s.id === currentId}
              onOpen={() => onOpen(s)}
              onMenu={() => onSketchMenu(s)}
              sub={
                <>
                  <span>
                    <b>{s.board}</b>
                  </span>
                  <span>{s.lines} lines</span>
                  <span>edited {s.edited}</span>
                </>
              }
            />
          ))}
        </div>
      ) : (
        <div className="examples">
          {EXAMPLE_CATS.map((cat) => {
            const items = EXAMPLES.filter((e) => e.cat === cat);
            if (!items.length) return null;
            return (
              <div key={cat} className="ex-group">
                <div className="ex-cat">{cat}</div>
                <div className="list">
                  {items.map((e) => (
                    <SketchCard
                      key={e.id}
                      name={e.name}
                      isExample
                      active={e.id === currentId}
                      onOpen={() =>
                        onOpen({
                          id: e.id,
                          name: e.name,
                          board: "Sprint",
                          edited: "example",
                          size: e.size,
                          lines: e.lines,
                          code: exampleCode(e.name),
                        })
                      }
                      sub={<span className="ex-desc">{e.desc}</span>}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          <div className="ex-foot">{EXAMPLES.length} bundled examples · ForgeBoard core 1.2</div>
        </div>
      )}
    </>
  );
}

// New-sketch bottom sheet — name + board + template
export function NewSketchSheet({
  onCreate,
  onClose,
}: {
  onCreate: (args: { name: string; board: string; tpl: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("untitled");
  const [board, setBoard] = useState("Spark");
  const [tpl, setTpl] = useState("blank");
  const tpls = [
    { id: "blank", label: "Blank", sub: "setup() + loop()" },
    { id: "blink", label: "Blink", sub: "LED on GPIO16" },
    { id: "serial", label: "Serial", sub: "print at 115200" },
  ];
  const clean = (name.trim() || "untitled").replace(/\.ino$/, "");

  return (
    <div className="switcher-scrim" onClick={onClose}>
      <div className="switcher new-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div className="sw-label">New sketch</div>

        <div className="ns-field">
          <label>Name</label>
          <div className="ns-input">
            <input
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              spellcheck={false}
              autofocus
            />
            <span className="ext">.ino</span>
          </div>
        </div>

        <div className="ns-field">
          <label>Board</label>
          <div className="seg ns-seg">
            {["Spark", "Sprint"].map((b) => (
              <button key={b} className={board === b ? "on" : ""} onClick={() => setBoard(b)}>
                {b}
              </button>
            ))}
          </div>
        </div>

        <div className="ns-field">
          <label>Template</label>
          <div className="ns-tpls">
            {tpls.map((t) => (
              <button
                key={t.id}
                className={`ns-tpl ${tpl === t.id ? "on" : ""}`}
                onClick={() => setTpl(t.id)}
              >
                <span className="tl">{t.label}</span>
                <span className="ts">{t.sub}</span>
              </button>
            ))}
          </div>
        </div>

        <button className="ns-create" onClick={() => onCreate({ name: clean + ".ino", board, tpl })}>
          <IconPlus size={15} /> Create sketch
        </button>
      </div>
    </div>
  );
}

// Small auto-dismissing confirmation toast
export function Toast({ message }: { message: string }) {
  return (
    <div className="fb-toast">
      <span className="ico">
        <IconCheck size={15} />
      </span>
      <span>{message}</span>
    </div>
  );
}

// Per-sketch actions sheet (Open / Rename / Duplicate / Share / Delete)
export function SketchMenu({
  sketch,
  onOpen,
  onRename,
  onDuplicate,
  onShare,
  onDelete,
  onClose,
}: {
  sketch: Sketch;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onShare: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"menu" | "rename">("menu");
  const [name, setName] = useState(sketch.name.replace(/\.ino$/, ""));

  if (mode === "rename") {
    return (
      <div className="switcher-scrim" onClick={onClose}>
        <div className="switcher sketch-menu" onClick={(e) => e.stopPropagation()}>
          <div className="grab" />
          <div className="sm-title">Rename sketch</div>
          <div className="sm-rename">
            <div className="ns-input">
              <input
                value={name}
                onInput={(e) => setName((e.target as HTMLInputElement).value)}
                spellcheck={false}
                autofocus
              />
              <span className="ext">.ino</span>
            </div>
          </div>
          <button
            className="sm-item"
            onClick={() => {
              onRename((name.trim() || "untitled") + ".ino");
              onClose();
            }}
          >
            <span className="ico">
              <IconCheck size={18} />
            </span>
            Save name
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="switcher-scrim" onClick={onClose}>
      <div className="switcher sketch-menu" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div className="sm-title">{sketch.name}</div>
        <button className="sm-item" onClick={() => { onOpen(); onClose(); }}>
          <span className="ico"><IconFile size={18} /></span> Open
        </button>
        <button className="sm-item" onClick={() => setMode("rename")}>
          <span className="ico"><IconEdit size={18} /></span> Rename
        </button>
        <button className="sm-item" onClick={() => { onDuplicate(); onClose(); }}>
          <span className="ico"><IconCopy size={18} /></span> Duplicate
        </button>
        <button className="sm-item" onClick={() => { onShare(); onClose(); }}>
          <span className="ico"><IconShare size={18} /></span> Share .ino
        </button>
        <button className="sm-item danger" onClick={() => { onDelete(); onClose(); }}>
          <span className="ico"><IconTrash size={18} /></span> Delete
        </button>
      </div>
    </div>
  );
}

// ============================================================
// SCREEN 2 — Editor
// ============================================================
export function EditorScreen({
  sketch,
  dirty,
  saved,
}: {
  sketch: Sketch;
  dirty: boolean;
  saved: boolean;
}) {
  // Render THIS sketch's own source (not a shared constant).
  const lines = sketch.code.replace(/\n+$/, "").split("\n");
  const caretLine = 1; // display-only preview cursor at the top of the file
  return (
    <div className="editor">
      <div className="lines">
        {lines.map((s, i) => {
          const n = i + 1;
          return (
            <div key={n} className={`ln ${n === caretLine ? "cur" : ""}`}>
              <div className="gutter">{n}</div>
              <div className="src">
                {tokenize(s).map((tk, j) => (
                  <span key={j} className={`tok-${tk.kind}`}>
                    {tk.text}
                  </span>
                ))}
                {n === caretLine && <span className="caret" />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="ed-foot">
        <span className={`save-state ${dirty ? "dirty" : "clean"}`}>
          {dirty ? (
            <>
              <IconDot2 size={12} /> Unsaved
            </>
          ) : (
            <>
              <IconCheck size={12} /> {saved ? "Saved" : "All saved"}
            </>
          )}
        </span>
        <span className="dot">·</span>
        <span>
          <b>Ln</b> {caretLine}
          <span className="muted">,</span> <b>Col</b> 1
        </span>
        <span className="grow" />
        <span>{sketch.board}</span>
        <span className="dot">·</span>
        <span>UTF-8</span>
      </div>
    </div>
  );
}

// Symbol key row that floats above the keyboard
export function KeyRow() {
  const keys = ["TAB", "{", "}", "(", ")", ";", '"', "<", ">", "=", "/", "*", "&", "|", "#", "!", "+", "-"];
  return (
    <div className="key-row">
      {keys.map((k, i) => (
        <div key={i} className={`k ${k === "TAB" ? "wide" : ""}`}>
          {k}
        </div>
      ))}
    </div>
  );
}

// Editor dock: utility cluster (undo · redo │ save) + run verbs (Verify · Flash)
export function EditorActionBar({
  onFlash,
  onPlay,
  onSave,
  dirty,
}: {
  onFlash: () => void;
  onPlay: () => void;
  onSave: () => void;
  dirty: boolean;
}) {
  return (
    <div className="act-bar">
      <div className="util">
        <button className="u-btn" aria-label="Undo">
          <IconUndo size={15} />
        </button>
        <button className="u-btn" aria-label="Redo">
          <IconRedo size={15} />
        </button>
        <span className="u-div" />
        <button
          className={`u-btn save ${dirty ? "dirty" : ""}`}
          aria-label={dirty ? "Save" : "Saved"}
          onClick={onSave}
        >
          {dirty ? <IconSave size={15} /> : <IconCheck size={15} />}
          {dirty && <span className="dot" />}
        </button>
      </div>
      <div className="spacer" />
      <button className="run verify" onClick={onPlay}>
        <IconPlay size={13} /> Verify
      </button>
      <button className="run flash" onClick={onFlash}>
        <IconBolt size={14} /> Flash
      </button>
    </div>
  );
}

// ============================================================
// SCREEN 3 — Serial monitor
// ============================================================
export function SerialScreen({ boardLabel, log }: { boardLabel: string; log: SerialLine[] }) {
  return (
    <>
      <div className="serial-header">
        <div className="conn-dot" />
        <div className="baud">
          <b>{boardLabel.toUpperCase()}</b> · /dev/ttyACM0 · <b>115200</b> 8N1
        </div>
      </div>
      <div className="serial">
        {log.map((l, i) => (
          <div key={i} className="row">
            <div className="t">{l.t}</div>
            <div className={`tag ${l.tag}`}>{l.tag}</div>
            <div className="msg">{l.msg}</div>
          </div>
        ))}
      </div>
    </>
  );
}

// Serial bottom bar — a real REPL composer
export function SerialBottomBar({ onSend }: { onSend: (text: string) => void }) {
  const [draft, setDraft] = useState("");
  const send = () => {
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft("");
  };
  return (
    <div className="act-bar">
      <div className="serial-input">
        <span className="prompt">{">"}</span>
        <input
          value={draft}
          placeholder="send to serial…"
          spellcheck={false}
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if ((e as KeyboardEvent).key === "Enter") send();
          }}
        />
      </div>
      <button className="serial-send" disabled={!draft.trim()} onClick={send}>
        <IconUpload size={14} /> Send
      </button>
    </div>
  );
}

// ============================================================
// SCREEN 4 — Connect / USB-OTG journey
// ============================================================
export function ConnectScreen({
  onFlash,
  otgState,
  setOtgState,
  sketchName,
}: {
  onFlash: () => void;
  otgState: OtgState;
  setOtgState: (s: OtgState) => void;
  sketchName: string;
}) {
  const model = BOARD_MODELS.Sprint;
  const stateIndex = { waiting: 0, detected: 1, connected: 2, unplugged: 0 }[otgState];

  return (
    <div className="otg">
      <div className="step-dots">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`d ${i < stateIndex ? "done" : i === stateIndex ? "cur" : ""}`} />
        ))}
      </div>

      {(otgState === "waiting" || otgState === "unplugged") && (
        <>
          <div className="eyebrow">USB-C · OTG</div>
          <h2>{otgState === "unplugged" ? "Board removed." : "Plug in to flash."}</h2>
          <div className="lede">
            {otgState === "unplugged"
              ? "The cable was pulled. Reconnect over USB-C to keep flashing — or move to WiFi once the board has booted once."
              : "A fresh board needs a cable for its first flash. Connect ForgeBoard to your phone with USB-C, then grant access."}
          </div>
          <div className="port-stage">
            <div className="port">
              <IconUSB size={44} />
            </div>
          </div>
          <div className="sim-note">Demo · tap to simulate the cable</div>
          <button className="primary-verb" onClick={() => setOtgState("detected")}>
            <IconUSB size={14} /> Simulate plug-in
          </button>
        </>
      )}

      {otgState === "detected" && (
        <>
          <div className="eyebrow">Device detected</div>
          <h2>New USB device.</h2>
          <div className="lede">/dev/bus/usb/001/004 · vid 303a · pid 1001 — looks like an ESP32-S3.</div>
          <div className="port-stage">
            <div className="port live">
              <IconChip size={44} />
            </div>
          </div>
          <div className="sim-note">Android is asking for permission</div>
        </>
      )}

      {otgState === "connected" && (
        <>
          <div className="eyebrow">Connected</div>
          <h2>ForgeBoard, ready.</h2>
          <div style={{ flex: 1, display: "flex", alignItems: "center", paddingTop: 20 }}>
            <div className="board-card" style={{ width: "100%" }}>
              <div className="bc-top">
                <div className="bc-glyph">
                  <IconBoard size={24} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="bc-name">{model.name}</div>
                  <div className="bc-sub">{model.module} · /dev/ttyACM0 · USB-C</div>
                </div>
                <div className="conn-dot" />
              </div>
              <div className="bc-specs">
                <div>
                  Flash<b>{model.flash}</b>
                </div>
                <div>
                  PSRAM<b>{model.psram}</b>
                </div>
                <div>
                  CPU<b>{model.cpu}</b>
                </div>
              </div>
              <button className="primary-verb" onClick={onFlash}>
                <IconBolt size={14} /> Flash {sketchName}
              </button>
              <button className="ghost-verb" onClick={() => setOtgState("unplugged")}>
                Disconnect
              </button>
            </div>
          </div>
          <div className="sim-note">Booted once? It can flash over WiFi next time.</div>
        </>
      )}
    </div>
  );
}

// Android USB-permission dialog (rendered when otgState === 'detected')
export function UsbPermissionDialog({ onAllow, onDeny }: { onAllow: () => void; onDeny: () => void }) {
  return (
    <div className="usb-dialog-scrim">
      <div className="usb-dialog">
        <div className="ud-glyph">
          <IconUSB size={22} />
        </div>
        <div className="ud-title">Allow access to USB device?</div>
        <div className="ud-body">
          <b>ForgeBoard IDE</b> wants to access <b>ESP32-S3 (303a:1001)</b> to upload and monitor your
          sketch.
        </div>
        <div className="ud-check">
          <div className="ud-box">
            <IconCheck size={12} />
          </div>
          Use by default for this USB device
        </div>
        <div className="ud-actions">
          <button className="deny" onClick={onDeny}>
            Deny
          </button>
          <button onClick={onAllow}>Allow</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SCREEN 5 — Library manager (search + install/remove)
// ============================================================
// A few well-known libraries to show as "Popular" before the user searches.
const POPULAR_NAMES = [
  "FastLED",
  "PubSubClient",
  "Adafruit NeoPixel",
  "ArduinoJson",
  "DHT sensor library",
  "Adafruit GFX Library",
  "Adafruit SSD1306",
  "IRremote",
  "WiFiManager",
  "NimBLE-Arduino",
  "TFT_eSPI",
  "Adafruit BME280 Library",
];

// Seed a few "installed" libraries, deliberately a version behind so the real
// update-available detection (installed vs latest in the registry) shows.
const SEED_INSTALLED: Record<string, string> = {
  ArduinoJson: "7.0.0",
  "Adafruit NeoPixel": "1.10.0",
  "DHT sensor library": "1.4.4",
};

// Offline fallback (the bundled set) mapped to the registry shape.
const FALLBACK: RegLib[] = LIBRARIES.map((l) => ({
  name: l.name,
  author: l.author,
  version: l.version,
  versions: [l.version],
  desc: l.desc,
}));

function LibRow({ lib, installedVer, onAct }: { lib: RegLib; installedVer?: string; onAct: () => void }) {
  const installed = installedVer != null;
  const hasUpdate = installedVer != null && cmpVer(installedVer, lib.version) < 0;
  return (
    <div className="lib-card">
      <div className="lib-glyph">
        <IconLibrary size={18} />
      </div>
      <div className="lib-body">
        <div className="lib-name">
          {lib.name}
          <span className="lib-ver">{installed ? installedVer : lib.version}</span>
          {hasUpdate && <span className="lib-upd">↑ {lib.version}</span>}
        </div>
        <div className="lib-author">{lib.author}</div>
        {lib.desc && <div className="lib-desc">{lib.desc}</div>}
      </div>
      <button className={`lib-act ${installed && !hasUpdate ? "on" : ""}`} onClick={onAct}>
        {!installed ? (
          <>
            <IconDownload size={14} /> Install
          </>
        ) : hasUpdate ? (
          <>
            <IconDownload size={14} /> Update
          </>
        ) : (
          <>
            <IconCheck size={13} /> Added
          </>
        )}
      </button>
    </div>
  );
}

export function LibrariesScreen({ onToast }: { onToast: (msg: string) => void }) {
  const [q, setQ] = useState("");
  const [libs, setLibs] = useState<RegLib[] | null>(getCachedRegistry());
  const [status, setStatus] = useState<"loading" | "ready" | "error">(getCachedRegistry() ? "ready" : "loading");
  const [installed, setInstalled] = useState<Record<string, string>>({ ...SEED_INSTALLED });

  useEffect(() => {
    if (libs) return;
    let alive = true;
    loadRegistry()
      .then((r) => {
        if (alive) {
          setLibs(r);
          setStatus("ready");
        }
      })
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line
  }, []);

  const data = libs ?? FALLBACK;
  const ql = q.trim().toLowerCase();
  const match = (l: RegLib) =>
    l.name.toLowerCase().includes(ql) || l.author.toLowerCase().includes(ql) || l.desc.toLowerCase().includes(ql);

  const installedList = data.filter((l) => installed[l.name] != null && (!ql || match(l)));
  const results = (
    ql
      ? data.filter((l) => installed[l.name] == null && match(l))
      : POPULAR_NAMES.map((n) => data.find((l) => l.name === n)).filter(
          (l): l is RegLib => !!l && installed[l.name] == null
        )
  ).slice(0, 40);

  const act = (l: RegLib) => {
    const cur = installed[l.name];
    if (cur == null) {
      setInstalled((p) => ({ ...p, [l.name]: l.version }));
      onToast(`Added ${l.name} ${l.version}`);
    } else if (cmpVer(cur, l.version) < 0) {
      setInstalled((p) => ({ ...p, [l.name]: l.version }));
      onToast(`Updated ${l.name} → ${l.version}`);
    } else {
      setInstalled((p) => {
        const n = { ...p };
        delete n[l.name];
        return n;
      });
      onToast(`Removed ${l.name}`);
    }
  };

  return (
    <div className="libs">
      <div className="lib-search">
        <div className="lib-search-box">
          <span className="ico">
            <IconSearch size={17} />
          </span>
          <input
            value={q}
            placeholder="Search the Arduino library registry…"
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            spellcheck={false}
          />
        </div>
      </div>

      {status === "loading" && !libs && <div className="lib-note">Loading the Arduino registry…</div>}
      {status === "error" && <div className="lib-note">Offline — showing a bundled set.</div>}

      {installedList.length > 0 && (
        <>
          <div className="lib-grp">Installed · {installedList.length}</div>
          {installedList.map((l) => (
            <LibRow key={l.name} lib={l} installedVer={installed[l.name]} onAct={() => act(l)} />
          ))}
        </>
      )}

      <div className="lib-grp">{ql ? "Results" : "Popular"}</div>
      {results.map((l) => (
        <LibRow key={l.name} lib={l} onAct={() => act(l)} />
      ))}
      {ql && results.length === 0 && status !== "loading" && (
        <div className="lib-empty">No libraries match “{q}”.</div>
      )}

      <div className="lib-foot">
        {libs ? `${libs.length.toLocaleString()} libraries · arduino registry` : "bundled set · offline"}
      </div>
    </div>
  );
}

// ============================================================
// SCREEN 6 — Settings (folds in the former Tweaks controls)
// ============================================================
export function SettingsScreen({
  tweaks,
  setTweak,
  onToast,
}: {
  tweaks: Tweaks;
  setTweak: <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => void;
  onToast: (msg: string) => void;
}) {
  const fonts: CodeFont[] = ["JetBrains Mono", "IBM Plex Mono", "Fira Code"];
  const cycleFont = () => setTweak("codeFont", fonts[(fonts.indexOf(tweaks.codeFont) + 1) % fonts.length]);

  // device/build prefs — local to this prototype surface
  const [storage, setStorage] = useState({ offline: true, autosave: true, format: false });
  const [build, setBuild] = useState({ autoVerify: true, eraseFlash: false });

  return (
    <div className="settings">
      <div className="group-label">APPEARANCE</div>
      <div className="ios-group">
        <div className="srow tap" onClick={() => setTweak("theme", tweaks.theme === "dark" ? "light" : "dark")}>
          <div className="label">
            Theme
            <div className="sub">{tweaks.theme === "dark" ? "dark" : "light"}</div>
          </div>
          <div className={`tg ${tweaks.theme === "dark" ? "on" : ""}`} />
        </div>
      </div>

      <div className="group-label">NAVIGATION</div>
      <div className="ios-group">
        <div className="srow">
          <div className="label">
            Model
            <div className="sub">bottom bar / verb-per-surface</div>
          </div>
          <div className="seg">
            {(["tabbar", "verb"] as const).map((v) => (
              <button key={v} className={tweaks.nav === v ? "on" : ""} onClick={() => setTweak("nav", v)}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="group-label">EDITOR</div>
      <div className="ios-group">
        <div className="srow tap" onClick={cycleFont}>
          <div className="label">
            Code font
            <div className="sub">tap to change</div>
          </div>
          <div className="val">{tweaks.codeFont}</div>
        </div>
        <div className="srow tap" onClick={() => setTweak("gutter", !tweaks.gutter)}>
          <div className="label">
            Show line numbers
            <div className="sub">gutter on / off</div>
          </div>
          <div className={`tg ${tweaks.gutter ? "on" : ""}`} />
        </div>
        <div className="srow tap" onClick={() => setTweak("keyRow", !tweaks.keyRow)}>
          <div className="label">
            Code key row
            <div className="sub">symbol row above keyboard</div>
          </div>
          <div className={`tg ${tweaks.keyRow ? "on" : ""}`} />
        </div>
      </div>

      <div className="group-label">FILES &amp; STORAGE</div>
      <div className="ios-group">
        <div className="srow tap" onClick={() => setStorage((s) => ({ ...s, offline: !s.offline }))}>
          <div className="label">
            Save sketches offline
            <div className="sub">kept on this device</div>
          </div>
          <div className={`tg ${storage.offline ? "on" : ""}`} />
        </div>
        <div className="srow tap" onClick={() => setStorage((s) => ({ ...s, autosave: !s.autosave }))}>
          <div className="label">
            Autosave
            <div className="sub">on every change</div>
          </div>
          <div className={`tg ${storage.autosave ? "on" : ""}`} />
        </div>
        <div className="srow tap" onClick={() => setStorage((s) => ({ ...s, format: !s.format }))}>
          <div className="label">Format on save</div>
          <div className={`tg ${storage.format ? "on" : ""}`} />
        </div>
        <div className="srow">
          <div className="label">
            Sketch folder
            <div className="sub">device storage</div>
          </div>
          <div className="val">/ForgeBoard</div>
        </div>
        <div className="srow tap" onClick={() => onToast("Sketch exported · .zip")}>
          <div className="label">
            Export sketch
            <div className="sub">share as .zip</div>
          </div>
          <div className="val">
            <IconUpload size={16} />
          </div>
        </div>
      </div>

      <div className="group-label">TARGET</div>
      <div className="ios-group">
        <div className="srow">
          <div className="label">
            Board
            <div className="sub">ForgeBoard Sprint</div>
          </div>
          <div className="val">ESP32-S3</div>
        </div>
        <div className="srow">
          <div className="label">
            Port
            <div className="sub">/dev/ttyACM0</div>
          </div>
          <div className="val">USB-C</div>
        </div>
        <div className="srow">
          <div className="label">Baud rate</div>
          <div className="val">115200</div>
        </div>
      </div>

      <div className="group-label">BUILD</div>
      <div className="ios-group">
        <div className="srow tap" onClick={() => setBuild((b) => ({ ...b, autoVerify: !b.autoVerify }))}>
          <div className="label">Auto-verify on save</div>
          <div className={`tg ${build.autoVerify ? "on" : ""}`} />
        </div>
        <div className="srow tap" onClick={() => setBuild((b) => ({ ...b, eraseFlash: !b.eraseFlash }))}>
          <div className="label">Erase flash before upload</div>
          <div className={`tg ${build.eraseFlash ? "on" : ""}`} />
        </div>
        <div className="srow">
          <div className="label">Toolchain</div>
          <div className="val">arduino-esp32 3.0</div>
        </div>
      </div>

      <div className="group-label">ABOUT</div>
      <div className="ios-group">
        <div className="srow">
          <img className="about-mark" src="/forgeboard-logo.png" width={30} height={30} alt="" />
          <div className="label">
            ForgeBoard IDE
            <div className="sub">forged in india · v0.4.118</div>
          </div>
          <div className="val">v0.4</div>
        </div>
      </div>
    </div>
  );
}
