# ForgeBoard IDE — Mobile App Design Brief

> Handoff doc for design exploration. The UI is **open** — this brief gives you the product, the
> constraints, and the existing house style. It does **not** prescribe a layout. Treat the prior
> v1–v7 samples as exploration, not a spec.

---

## 1. What it is

ForgeBoard IDE is a from-scratch **Arduino / ESP32 IDE** built by Defence Forge Industries (currently
a Tauri + Preact desktop app for Windows). The mobile app is the **Android** port. Its reason to exist
is to put the whole loop — **write → compile → flash → watch serial — on the phone, wherever the board
is**: vehicle bay, hangar floor, perimeter. The unique selling point vs. stock Arduino-IDE-on-Android is
**cable-free flashing over WiFi**, with a USB cable only when you need one.

Two ways to reach the board (see §4 for the full architecture):
- **WiFi OTA (primary)** — discover the board on the local network and flash it over the air. No cable.
- **USB‑OTG (rescue / first flash)** — plug the ESP32 straight into the phone over USB‑C for the initial flash or to recover a board.

The product is for an embedded engineer at a workbench or in the field: **one thumb and a board nearby**
(sometimes on a cable, often just on the same network). Everything in the UI should assume that posture.

---

## 2. The core loop (the 5 surfaces every screen serves)

The desktop has ~35 commands, but the mobile job decomposes into a tight loop. Design should make this
loop effortless; everything else is secondary.

1. **Sketches** — list / open / create a sketch (the home surface).
2. **Editor** — read and edit Arduino C++ code on a touch screen.
3. **Board** — pick the target board + connect to the physical board (over WiFi, or USB‑OTG).
4. **Flash** — compile (on the LAN build server) and upload to the board (the single dominant verb).
5. **Monitor** — watch serial output (log + numeric plotter) coming back from the board.

A successful first session = *open an example → connect the board → tap Flash → see it print over serial,* without ever feeling like a shrunk-down desktop IDE.

---

## 3. What it has to do — capability inventory

Grouped by mobile priority. **P1 = core loop, must work in v1. P2 = supporting. P3 = desktop‑centric, likely defer.**

### Sketches & files
- **P1** New sketch (scaffold a sketch folder), Open sketch, Open recent.
- **P1** Save (editing autosaves on a debounce; explicit save flushes immediately).
- **P2** Quick‑open file within a sketch (fuzzy), close tab, reopen closed tab.
- **P2** Curated starter examples (8 bundled), library examples (copied into an editable sketch, never edited in place).
- **P3** Archive sketch to .zip, split editor (two panes), multi‑window.

### Editing
- **P1** Code editor with syntax highlighting, line numbers, find/replace, go‑to‑line.
- **P1** A **coder's keyboard accessory row** above the soft keyboard ( `{ } ; < > / tab` ) — typing braces and semicolons on a phone keyboard is the #1 friction point.
- **P2** Find‑in‑project, snippets/autocomplete.

### Build, target & flash
- **P1** Select board (target FQBN) — ESP32 family; ESP32‑S3 native‑USB is the hero board.
- **P1** Connect to the board — on mobile this means discovering it over WiFi or attaching it over USB‑OTG, see §4.
- **P1** **Compile** (verify) with streaming output + a memory/size summary on success.
- **P1** **Flash** (compile‑then‑upload — it always recompiles, matching Arduino IDE).
- **P2** sketch.yaml reproducible‑build **profiles** (a pill appears only when the sketch ships profiles).
- **P2** Burn bootloader.
- **P3** Install board cores (ESP32/ESP8266/AVR/RP2040/STM32/Teensy/XIAO), install/uninstall libraries from the ~9k‑entry registry or a .zip. (Needed eventually, but heavy; depends on the remote‑compile decision in §4.)

### Observe (serial)
- **P1** **Serial Monitor** — baud selector (9600–921600), line‑ending control (LF/CRLF/CR/None), timestamped RX/TX log, a send box with input history.
- **P1** **Serial Plotter** — parses numeric serial lines into multiple series, live HiDPI line chart, pause, clear, window size (100/250/500 samples). Shares the one connection with the monitor.
- **P1** **Problems** panel — compiler diagnostics with **humanized error hints** (plain‑English explanation + fix, e.g. a missing‑header error offers a one‑tap "install this library").

### Status the UI must always surface ("candour")
- What **board** is the target, and is one actually **connected**.
- **Baud / transport** in use.
- Live **compile / flash progress** and pass/fail.
- Connection state transitions: detecting → connected → flashing → detached.

---

## 4. Hardware & OTG reality (constraints the UI must respect)

This is the part that makes mobile *different from* the desktop, and it shapes several screens.

**The architecture (planned):**
- **Compile = LAN build server.** A full ESP32 toolchain (~GB of cores + esptool) can't run on the phone. Instead the **desktop ForgeBoard IDE runs a build server on the local network** (POST `{sketch, fqbn}` → returns a compiled `.bin`). The phone edits and orchestrates; the desktop compiles. (A cloud build endpoint is a later milestone.) Design implication: "Compiling…" is a **network round‑trip to a paired build machine** — it can be a few seconds and it can fail on connectivity / "build server not found." There should be a notion of **pairing/finding the build server.**
- **Flash path 1 — WiFi OTA (primary, cable‑free).** The board is discovered on the LAN via **mDNS** and flashed over the air (ArduinoOTA, TCP). No cable, no USB permission. *Caveat the UI should respect:* OTA only works once the board already runs OTA‑capable firmware on the same network — so the **first flash of a fresh board usually needs USB‑OTG**, and thereafter it's wireless. The connect UX should make "this board is reachable over WiFi" vs "needs a cable first" legible.
- **Flash path 2 — USB‑OTG (first flash / rescue).** Plug the ESP32 into the phone over USB‑C. This is a **permission moment**: Android gives no raw serial access, so attaching a board triggers a **per‑device USB permission prompt** (and the OS can revoke it). Native‑USB ESP32‑S3 also needs a specific USB reset to enter download mode, and flashing can fail mid‑write. Design needs: empty/disconnected → "grant access to this board" → connected → "permission revoked / unplugged" states.

**Other realities:**
- **Boards:** ESP32 family only (ESP32, S2, S3, C2, C3, C6, H2, P4). **ESP32‑S3 with native USB is first‑class** and the board the whole stack is tuned around. Espressif's USB vendor ID is `0x303A`.
- **On the OTG path the phone powers the board.** OTG host mode means the phone supplies VBUS down the cable; on some phones this is current‑limited and drains battery. Worth a subtle indicator, not a nag. (Irrelevant on the WiFi path.)
- **Flashing should read as one confident verb with honest progress.** Whether OTA or OTG, treat **Flash as a single action with honest, indeterminate progress and graceful, human failure messaging** — not a percent bar that lies. (Desktop uses an indeterminate "compile wave" — a sliding gradient — exactly to avoid fake precision.)
- **The editor will likely be CodeMirror, not Monaco.** Monaco's touch support is poor on phones; the mobile editor is expected to swap to a touch‑friendly editor. Design the editor for touch from the ground up (selection handles, the keyboard accessory row), don't assume desktop‑Monaco affordances.
- **Error hints need mobile rewording.** The desktop's plain‑English error hints assume a COM‑port world ("close the Serial Monitor," "another program is using the port," "try another cable"). On mobile these become "USB permission was revoked — reconnect," "board not found on the network," "the board lost power." Same friendly‑hint pattern, Android vocabulary.

> **Status for the designer:** none of this transport (build server, WiFi OTA, OTG) is built yet
> (`tauri android init` hasn't been run). That's fine — design moves ahead of it. Design as if pairing,
> compiling, flashing (both paths), and monitoring all work; the team builds them behind the UI.

---

## 5. Design DNA — the house style to stay coherent with

ForgeBoard's identity is a **disciplined, near‑monochrome industrial‑instrument** language. The one law:
**color must be earned.** The chrome is grayscale/warm‑neutral; the only things allowed a hue are
**(1)** the primary verb/flash moment, **(2)** diagnostics (warning amber `#e8b24a`, error red `#f0625e`),
and **(3)** hardware state (a sage/green "connected" `#57cfa0`). Even code **syntax is grayscale** —
emphasis carried by weight + italic, not color.

Four repeated axioms across all explorations:
- **Restraint** — one accent, one moment, one verb per screen.
- **Tactility** — ≥44px touch targets, thumb‑reachable primary actions.
- **Continuity** — reuse/retune the desktop tokens; don't redesign the brand.
- **Candour** — always show what the board is doing.

**Signature components already in the vocabulary** (reuse or evolve): the indeterminate **compile wave**
(sliding gradient, not a percent ring); the **coder's keyboard accessory row**; **state pills** (a
breathing dot = connected, pulsing = flashing, red = detached); a **live PCB pinout** where the active
pin pulses (tap a pin literal in code to highlight it on the board); a `1.8s breathe / 1.0s blink`
motion vocabulary.

### Where the prior exploration landed
The team's most recent lean was **v7**: warm dark monochrome (base `#16140F`, cream ink `#F2EDDF`),
**Newsreader** serif headlines + **Switzer** body + **JetBrains Mono** code + **Major Mono Display** for
hardware/dot numerals, a Nothing‑OS **dot‑grid** background and chip rails, **one sparing signal red**
`#E84A3D` for state pips, a **cream‑inverted active line** in the editor, **hairline pin rings**, and a
single **cream‑filled FLASH pill** as the only filled/saturated surface on a screen. **But the UI is not
locked** — v7 is a strong reference, not a requirement. Feel free to push.

---

## 6. Prior exploration map (so you don't re‑tread)

Eight samples live in `docs/design-samples/`. Quick map of the range already tried:

| Ver | Direction | Nav model | Notable |
|----|-----------|-----------|---------|
| v1 | Cool‑slate dark + **amber** accent | Persistent 4‑tab **bottom nav** + amber FAB; board picker = bottom sheet | Set the 5‑screen loop; squircle frames; compile‑wave; coder's row |
| v2 | **MIL‑spec controlled document** (paper datasheet wrapping dark phone screens) | Bottom nav, stamp‑cut FAB | Most identity‑forward / polarizing; defense‑doc framing |
| v3 | **Claude‑Android** warm‑gray + burnt‑orange | Grouped setting cards, pill FAB, **no** bottom bar | Editor as an "artifact" card; closest to Claude's own app |
| v4 | **One variable serif** (Fraunces) editorial / engineering‑drawing | Verb‑per‑surface; primary action = a saffron *rule at the foot* | Leader lines, refdes tags; six colors total |
| v5 | **Pure monochrome typewriter** (JetBrains Mono for everything, zero hue) | Verb‑per‑surface; "flash" as an italic word | Austere extreme; state read in words, not color |
| v6 | Refined **Claude+Nothing warm‑mono** (Sentient serif) | No bottom bar; foot‑hairline verb | Serif headline per screen; no accent color at all |
| **v7** | **Settled lean:** warm‑mono + Newsreader + Nothing‑OS dot‑grid + one signal red | Verb‑per‑surface; cream **FLASH pill** at foot; pill FAB on Sketches | The canonical reference; see §5 |

Two recurring nav questions across these: **persistent bottom tab bar (v1/v2) vs. verb‑per‑surface /
no bottom bar (v3–v7)**, and **how the editor lives on a small screen** (full‑bleed source vs. an
"artifact" card vs. a manuscript ruler).

---

## 7. Open questions for design to resolve

1. **Navigation model** — persistent bottom tab bar, or verb‑per‑surface with gestures? (The 5 surfaces need to be reachable one‑thumb.)
2. **The editor on a phone** — full‑bleed code, a focused "artifact" card, or something new? How do tabs, the gutter, and the active line read at phone width? Where does the keyboard accessory row sit?
3. **The Flash moment** — what does the single dominant verb look like, and how does it honestly show the chain *build‑server compiling → flashing (OTA or OTG) → done/failed* (likely indeterminate, see compile‑wave)?
4. **Connect‑a‑board flow** — design the connection journey for **both paths**: WiFi (discover board on the network via mDNS → reachable) and USB‑OTG (plug in → grant access → connected → revoked/unplugged), plus the "fresh board needs a cable for its first flash, then goes wireless" nuance. Also: pairing/finding the **build server**. These are first‑class mobile surfaces with no desktop equivalent.
5. **Serial monitor + plotter on a small screen** — log density, the send box + history, switching to the plotter, landscape?
6. **Phone vs. tablet** — does a tablet earn a denser, more desktop‑like multi‑pane layout, or stay phone‑first scaled up?
7. **How loud is "DFI"?** — v2 went full defense‑document; v3–v7 stayed quiet/editorial. How much brand should the chrome carry?

---

## 8. Out of scope / hard constraints

- **No new color creed.** Stay monochrome/warm‑neutral; earn every hue. No "notification blue."
- **No italic‑serif `<em>` for body emphasis** (italic is fine for code types/functions and for headline subject‑words).
- **"Mono" means monochrome** (the palette), not the monospace typeface — JetBrains Mono is for machine text only.
- Split editor, multi‑window, archive, and full library/core management are **deferred** (P3), not designed away — don't let them complicate the v1 core loop.

---

*Stack for reference: Tauri 2 + Preact + TypeScript, Monaco editor, arduino‑cli backend. Brand: Defence
Forge Industries (Pune). Contact: av@defenceforgeindustries.com.*
