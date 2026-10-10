# ForgeBoard IDE — Architecture

ForgeBoard is a Tauri 2 desktop app. Two programs share one window:

| Layer | Where | Role |
|---|---|---|
| Webview (UI) | `src/` | Preact + Monaco. Draws everything, touches nothing. |
| IPC bridge | `src/ipc/` ↔ `src-tauri/src/lib.rs` | 39 named commands + window-scoped events. The only path between the two. |
| Rust backend | `src-tauri/src/` | Files, serial ports, arduino-cli. Does the work, draws nothing. |

Every feature follows one shape: the UI calls a named Rust command through `invoke()`,
Rust validates and does the work (or delegates to arduino-cli as a child process), and either
returns a `Result` or streams events back with `emit_to(window, …)`.

## Frontend layout (`src/`)

The frontend is organised as **feature modules**: one folder per capability, each owning its
components, state, actions and tests. This is the modular-monolith shape — each feature behaves
like a service with a small public surface, but everything compiles into one bundle.

```
src/
  app/                 Shell: boot, main, App, layout, shortcuts, window management,
                       title bar, menu bar, rails, status bar, bottom panel, toast
  shared/              Leaf utilities with no feature knowledge: Modal, ContextMenu,
                       file icons, error helpers
  ipc/                 Typed client for every backend command (the service contract)
  features/
    editor/            Monaco, tabs, editor groups, autosave, formatting, recent files
    project/           Sketch open/create/save, file sidebar, home, search
    boards/            Board detection, FQBN selection, profiles, cores, burn bootloader
    build/             Compile/upload, output streaming, diagnostics, memory bar
    serial/            Serial Monitor and Plotter
    libraries/         Library Manager and Examples
    settings/          Settings view and the settings store
    commands/          Command palette, quick open, keybindings, shortcuts modal
  mobile/              The Android / touch IDE (self-contained, loaded by boot.ts on Android)
```

Each feature folder contains, as needed:

| File | Purpose |
|---|---|
| `components/` | Preact components and their CSS |
| `state.ts` | The feature's signals (Preact Signals) |
| `actions.ts` | Imperative operations triggered by menus, shortcuts, palette |
| `*.ts` | Pure logic, unit-tested |
| `README.md` | One paragraph: what this feature owns |

### Import rules

1. Inside a folder, import relatively: `./state`, `./components/X`.
2. Across folders, import with the `@/` alias: `@/features/boards/state`, `@/app/state`.
   The alias is defined in `tsconfig.json`, `vite.config.ts` and `vitest.config.ts`.
3. `shared/` imports nothing from `app/` or `features/`. It is a leaf.
4. `ipc/` imports only feature **state** it needs to push events into (e.g. the serial log).
5. Import the specific module you need (`@/features/build/state`), not a barrel. Barrels over
   signal modules create import cycles that bite at startup.

### Where state lives

The old `src/state/appState.ts` (one file, 75 exports) has been split by owner:

| Signals about… | Now in |
|---|---|
| active rail, bottom panel, toast | `app/state.ts` |
| tabs, editor groups, file contents, cursor, save state, recent files | `features/editor/state.ts` |
| the open sketch, new-sketch dialog, project search | `features/project/state.ts` |
| connected board, FQBN, profiles, cores | `features/boards/state.ts` |
| build phase, output, diagnostics, size history | `features/build/state.ts` |
| serial log and port settings | `features/serial/state.ts` |
| library registry, search, examples | `features/libraries/state.ts` |
| palette, shortcuts modal | `features/commands/state.ts` |

Likewise `src/lib/actions.ts` is now `app/actions.ts`, `features/{project,editor,build,boards}/actions.ts`
and `shared/errors.ts`.

## Backend layout (`src-tauri/src/`)

Already modular by domain. Each module owns its data and exposes commands registered in `lib.rs`.

```
src-tauri/src/
  lib.rs           Tauri builder: plugins, managed state, the command registry
  commands/        ping (smoke test)
  project/         Sketch filesystem ops, recent list, profiles, archive. All paths are
                   canonicalised and must resolve inside the sketch folder.
  arduino/         arduino-cli wrapper: compile, upload, boards, cores, libraries, examples
  serial/          One thread per open port; lines streamed as events to the owning window
  corrections/     Fingerprinted overlay files that patch known platform bugs
```

arduino-cli is a Tauri sidecar (`bundle.externalBin`): `scripts/download-arduino-cli.mjs` fetches
`binaries/arduino-cli-<target-triple>` for the host on `pnpm install`, so the app builds on Windows,
macOS and Linux from one tree. Rust is verified with `cargo test` in `src-tauri/` on each OS.

## Tests (`tests/`)

Mirror the source layout: `tests/app`, `tests/shared`, `tests/features/<feature>/`.
Run with `pnpm test`. Pure-logic tests may also sit next to their source as `*.test.ts`.

## Security properties worth preserving

- The capability file (`src-tauri/capabilities/default.json`) is the allow-list of what the
  webview may do. Add to it deliberately.
- Every filesystem command goes through `project/fs.rs::is_within`. Do not bypass it.
- arduino-cli is spawned with an argument list, never a shell string.
- The CSP in `tauri.conf.json` blocks all external loads from the UI.
