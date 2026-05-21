import { useEffect, useRef, useState } from "preact/hooks";
import {
  Search,
  Download,
  Trash2,
  Package,
  FileArchive,
  LoaderCircle,
  RefreshCw,
} from "lucide-preact";
import { open as openNativeDialog } from "@tauri-apps/plugin-dialog";
import { arduinoApi, type Library } from "../ipc/arduino";
import {
  installedLibraries,
  librarySearchQuery,
  librarySearchResults,
  librarySearchPending,
  libraryInstalling,
  libraryInstallProgress,
  toast,
} from "../state/appState";
import "./LibrariesView.css";

/** Debounce window for the registry search, in milliseconds. */
const SEARCH_DEBOUNCE_MS = 350;

export function LibrariesView() {
  // Local mirror of the debounced query — the signal holds the raw keystrokes.
  const [debounced, setDebounced] = useState("");
  // Monotonic token so a slow search response cannot overwrite a newer one.
  const searchSeq = useRef(0);

  // Load the installed set once on mount.
  useEffect(() => {
    void refreshInstalled();
  }, []);

  // Debounce keystrokes in the search box.
  useEffect(() => {
    const q = librarySearchQuery.value;
    const t = setTimeout(() => setDebounced(q.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [librarySearchQuery.value]);

  // Run a registry search whenever the debounced query settles.
  useEffect(() => {
    if (!debounced) {
      librarySearchResults.value = [];
      librarySearchPending.value = false;
      return;
    }
    const seq = ++searchSeq.current;
    librarySearchPending.value = true;
    arduinoApi
      .libSearch(debounced)
      .then((results) => {
        if (seq !== searchSeq.current) return; // a newer search superseded this
        librarySearchResults.value = results;
      })
      .catch((e) => {
        if (seq !== searchSeq.current) return;
        librarySearchResults.value = [];
        toast.value = { kind: "warn", text: `Library search failed: ${String(e)}` };
      })
      .finally(() => {
        if (seq === searchSeq.current) librarySearchPending.value = false;
      });
  }, [debounced]);

  async function refreshInstalled() {
    try {
      installedLibraries.value = await arduinoApi.libListInstalled();
    } catch (e) {
      console.error("LibrariesView: list installed failed:", e);
    }
  }

  /**
   * Run a streaming library operation (install / update / uninstall) for
   * `name`, collecting progress lines and refreshing the installed list.
   * `op` returns the arduino-cli exit code.
   */
  async function runOp(
    name: string,
    label: string,
    op: () => Promise<number>,
  ): Promise<void> {
    if (libraryInstalling.value) return;
    libraryInstalling.value = name;
    libraryInstallProgress.value = [`${label} ${name}…`];
    const unlisten = await arduinoApi.onLibInstallOutput((line) => {
      libraryInstallProgress.value = [...libraryInstallProgress.value, line];
    });
    try {
      const code = await op();
      libraryInstallProgress.value = [
        ...libraryInstallProgress.value,
        code === 0 ? `Done — ${label.toLowerCase()} ${name}` : `Failed (exit ${code})`,
      ];
      if (code === 0) {
        toast.value = { kind: "success", text: `${label} complete: ${name}` };
      } else {
        toast.value = { kind: "warn", text: `${label} failed: ${name}` };
      }
      await refreshInstalled();
    } catch (e) {
      libraryInstallProgress.value = [
        ...libraryInstallProgress.value,
        `Error: ${String(e)}`,
      ];
      toast.value = { kind: "warn", text: `${label} error: ${String(e)}` };
    } finally {
      libraryInstalling.value = null;
      unlisten();
    }
  }

  const install = (lib: Library) =>
    runOp(lib.name, "Installing", () => arduinoApi.libInstall(lib.name));

  /** Update installs the explicit latest version, so arduino-cli upgrades in place. */
  const update = (lib: Library) =>
    runOp(lib.name, "Updating", () =>
      arduinoApi.libInstall(
        lib.latest_version ? `${lib.name}@${lib.latest_version}` : lib.name,
      ),
    );

  const uninstall = (lib: Library) =>
    runOp(lib.name, "Removing", () => arduinoApi.libUninstall(lib.name));

  async function installFromZip() {
    if (libraryInstalling.value) return;
    let picked: string | string[] | null;
    try {
      picked = await openNativeDialog({
        title: "Install library from ZIP",
        multiple: false,
        filters: [{ name: "Library archive", extensions: ["zip"] }],
      });
    } catch (e) {
      toast.value = { kind: "warn", text: `Could not open file picker: ${String(e)}` };
      return;
    }
    if (typeof picked !== "string") return;
    const zipName = picked.split(/[\\/]/).pop() ?? picked;
    await runOp(zipName, "Installing", () => arduinoApi.libInstallZip(picked as string));
  }

  const results = librarySearchResults.value;
  const installed = installedLibraries.value;
  const installedNames = new Set(installed.map((l) => l.name.toLowerCase()));
  const busy = libraryInstalling.value;
  const updatableCount = installed.filter((l) => l.update_available).length;

  return (
    <div class="lv">
      <div class="lv-header">
        <span class="lv-title">Libraries</span>
        <span class="lv-stats">
          installed {installed.length}
          {updatableCount > 0 ? ` · ${updatableCount} updatable` : ""}
        </span>
      </div>

      <div class="lv-search">
        <Search class="lv-search-icon" size={14} strokeWidth={1.5} />
        <input
          class="lv-search-input"
          type="text"
          placeholder="Search the Arduino library registry…"
          value={librarySearchQuery.value}
          onInput={(e) => {
            librarySearchQuery.value = (e.target as HTMLInputElement).value;
          }}
          spellcheck={false}
        />
        {librarySearchPending.value && (
          <LoaderCircle class="lv-spin" size={14} strokeWidth={1.75} />
        )}
        <button
          class="lv-zip-btn"
          title="Install a library from a local .zip archive"
          disabled={!!busy}
          onClick={() => void installFromZip()}
        >
          <FileArchive size={13} strokeWidth={1.5} />
          <span>Install from ZIP…</span>
        </button>
      </div>

      <div class="lv-body">
        {debounced && (
          <>
            <div class="lv-section-label">
              Search results{results.length > 0 ? ` · ${results.length}` : ""}
            </div>
            {librarySearchPending.value && results.length === 0 ? (
              <div class="lv-empty">Searching the registry…</div>
            ) : results.length === 0 ? (
              <div class="lv-empty">No libraries match “{debounced}”.</div>
            ) : (
              results.map((lib) => {
                const installedHere = installedNames.has(lib.name.toLowerCase());
                return (
                  <LibraryRow
                    key={`r-${lib.name}`}
                    lib={lib}
                    installed={installedHere}
                    busy={busy}
                    onInstall={() => void install(lib)}
                  />
                );
              })
            )}
          </>
        )}

        <div class="lv-section-label">Installed · {installed.length}</div>
        {installed.length === 0 ? (
          <div class="lv-empty">
            No libraries installed. Search above to add one from the registry.
          </div>
        ) : (
          installed.map((lib) => (
            <LibraryRow
              key={`i-${lib.name}`}
              lib={lib}
              installed
              busy={busy}
              onUpdate={() => void update(lib)}
              onRemove={() => void uninstall(lib)}
            />
          ))
        )}

        {libraryInstallProgress.value.length > 0 && (
          <div class="lv-install-log">
            <div class="lv-section-label">Activity</div>
            {libraryInstallProgress.value.slice(-14).map((line, i) => (
              <div key={i} class="lv-log-line">
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One library row — used for both registry results and the installed list. */
function LibraryRow({
  lib,
  installed,
  busy,
  onInstall,
  onUpdate,
  onRemove,
}: {
  lib: Library;
  installed: boolean;
  busy: string | null;
  onInstall?: () => void;
  onUpdate?: () => void;
  onRemove?: () => void;
}) {
  const isBusyHere = busy === lib.name;
  const anyBusy = !!busy;
  const desc = lib.sentence ?? lib.paragraph ?? "No description.";
  const version = lib.installed_version ?? lib.latest_version;

  return (
    <div class={`lv-row ${installed ? "lv-row-installed" : ""}`}>
      <span class={`lv-dot ${installed ? "on" : "dim"}`}>
        <Package size={11} strokeWidth={1.75} />
      </span>
      <div class="lv-row-main">
        <div class="lv-row-name">
          {lib.name}
          {version && <span class="lv-row-ver">{version}</span>}
          {lib.update_available && lib.latest_version && (
            <span class="lv-row-badge">update → {lib.latest_version}</span>
          )}
        </div>
        <div class="lv-row-meta">
          {desc}
          {lib.author && <span class="lv-row-author"> · {lib.author}</span>}
        </div>
      </div>

      <div class="lv-row-actions">
        {installed ? (
          <>
            {lib.update_available && onUpdate && (
              <button
                class="lv-btn lv-btn-update"
                disabled={anyBusy}
                onClick={onUpdate}
                title={`Update to ${lib.latest_version}`}
              >
                {isBusyHere ? (
                  <LoaderCircle class="lv-spin" size={12} strokeWidth={2} />
                ) : (
                  <RefreshCw size={12} strokeWidth={1.75} />
                )}
                <span>Update</span>
              </button>
            )}
            {onRemove && (
              <button
                class="lv-btn lv-btn-remove"
                disabled={anyBusy}
                onClick={onRemove}
                title={`Remove ${lib.name}`}
              >
                {isBusyHere && !lib.update_available ? (
                  <LoaderCircle class="lv-spin" size={12} strokeWidth={2} />
                ) : (
                  <Trash2 size={12} strokeWidth={1.75} />
                )}
                <span>Remove</span>
              </button>
            )}
          </>
        ) : onInstall ? (
          <button
            class="lv-btn lv-btn-install"
            disabled={anyBusy}
            onClick={onInstall}
          >
            {isBusyHere ? (
              <LoaderCircle class="lv-spin" size={12} strokeWidth={2} />
            ) : (
              <Download size={12} strokeWidth={1.75} />
            )}
            <span>{isBusyHere ? "Installing…" : "Install"}</span>
          </button>
        ) : (
          <span class="lv-row-status">installed</span>
        )}
      </div>
    </div>
  );
}
