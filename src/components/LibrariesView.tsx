import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  Search,
  Download,
  Trash2,
  FileArchive,
  LoaderCircle,
  RefreshCw,
  WifiOff,
} from "lucide-preact";
import { open as openNativeDialog } from "@tauri-apps/plugin-dialog";
import { arduinoApi, type Library } from "../ipc/arduino";
import {
  installedLibraries,
  librarySearchQuery,
  libraryRegistry,
  libraryRegistryStatus,
  librarySearchResults,
  librarySearchPending,
  libraryFilterMode,
  libraryInstalling,
  libraryInstallProgress,
  toast,
} from "../state/appState";
import { filterLibraries, computeWindow } from "../lib/library-filter";
import "./LibrariesView.css";

/**
 * Debounce window for the search box, in milliseconds. Filtering is now an
 * in-memory pass over the cached registry, so this only exists to avoid
 * re-deriving the (large) filtered list on literally every keystroke — it is
 * deliberately short.
 */
const SEARCH_DEBOUNCE_MS = 90;

/**
 * Debounce window for the offline-fallback registry search. When the full
 * registry could not be fetched we fall back to per-query backend searches,
 * which are real round-trips and want a longer settle time.
 */
const FALLBACK_SEARCH_DEBOUNCE_MS = 350;

/** Fixed height of one virtualized registry row, in pixels — must match `.lv-row` in CSS. */
const ROW_HEIGHT = 100;

/** Rows mounted beyond each edge of the viewport, so fast scrolls don't flash blank. */
const OVERSCAN = 8;

export function LibrariesView() {
  // Local mirror of the debounced query — the signal holds raw keystrokes.
  const [debounced, setDebounced] = useState("");
  // Monotonic token so a slow fallback search cannot overwrite a newer one.
  const searchSeq = useRef(0);

  // --- Load the installed set + the full registry once on mount. ---
  useEffect(() => {
    void refreshInstalled();
    void loadRegistry();
  }, []);

  // Debounce keystrokes in the search box. The window is short when filtering
  // locally, longer when we've fallen back to per-query backend searches.
  useEffect(() => {
    const q = librarySearchQuery.value;
    const offline = libraryRegistryStatus.value === "error";
    const wait = offline ? FALLBACK_SEARCH_DEBOUNCE_MS : SEARCH_DEBOUNCE_MS;
    const t = setTimeout(() => setDebounced(q.trim()), wait);
    return () => clearTimeout(t);
  }, [librarySearchQuery.value, libraryRegistryStatus.value]);

  // Offline fallback: when the registry failed to load, the debounced query
  // drives a real backend search (the old search-only behaviour).
  useEffect(() => {
    if (libraryRegistryStatus.value !== "error") return;
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
  }, [debounced, libraryRegistryStatus.value]);

  async function refreshInstalled() {
    try {
      installedLibraries.value = await arduinoApi.libListInstalled();
    } catch (e) {
      console.error("LibrariesView: list installed failed:", e);
    }
  }

  /** Fetch the entire registry once and cache it. Failure is non-fatal —
   *  the view falls back to per-query backend searches.
   *
   *  Skipped when the registry is already loaded OR in flight, so navigating
   *  back to the Libraries rail doesn't trigger a fresh fetch of the 9000-
   *  entry index every time. The user-facing Retry button passes
   *  through here too, so an error state still allows a retry. */
  async function loadRegistry() {
    if (
      libraryRegistryStatus.value === "loading" ||
      libraryRegistryStatus.value === "ready"
    ) {
      return;
    }
    libraryRegistryStatus.value = "loading";
    try {
      libraryRegistry.value = await arduinoApi.libListAll();
      libraryRegistryStatus.value = "ready";
    } catch (e) {
      console.error("LibrariesView: registry load failed:", e);
      libraryRegistry.value = null;
      libraryRegistryStatus.value = "error";
    }
  }

  /**
   * Run a streaming library operation (install / update / uninstall) for
   * `name`, collecting progress lines and refreshing the installed list.
   * `op` returns the arduino-cli exit code.
   *
   * The listener subscription is attached INSIDE the try so a failing
   * `onLibInstallOutput` (e.g. Tauri IPC error) still releases the install
   * lock through `finally`. The unlisten handle starts as a no-op, which is
   * what gets called when the subscription never completed.
   */
  async function runOp(
    name: string,
    label: string,
    op: () => Promise<number>,
  ): Promise<void> {
    if (libraryInstalling.value) return;
    libraryInstalling.value = name;
    libraryInstallProgress.value = [`${label} ${name}…`];
    let unlisten: () => void = () => {};
    try {
      unlisten = await arduinoApi.onLibInstallOutput((line) => {
        libraryInstallProgress.value = [...libraryInstallProgress.value, line];
      });
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
      unlisten();
      libraryInstalling.value = null;
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

  const installed = installedLibraries.value;
  const installedNames = useMemo(
    () => new Set(installed.map((l) => l.name.toLowerCase())),
    [installed],
  );
  const busy = libraryInstalling.value;
  const updatableCount = installed.filter((l) => l.update_available).length;
  const status = libraryRegistryStatus.value;
  const registry = libraryRegistry.value;
  const mode = libraryFilterMode.value;
  const offline = status === "error";

  // The list shown when browsing "All" — the cached registry filtered in
  // memory. Recomputed only when the registry or the debounced query changes.
  const filteredRegistry = useMemo(
    () => (registry ? filterLibraries(registry, debounced) : []),
    [registry, debounced],
  );

  // The list shown when browsing "Installed" — the installed set, filtered in
  // memory by the same query.
  const filteredInstalled = useMemo(
    () => filterLibraries(installed, debounced),
    [installed, debounced],
  );

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
        <div class="lv-search-field">
          <Search class="lv-search-icon" size={15} strokeWidth={1.75} />
          <input
            class="lv-search-input"
            type="text"
            placeholder={
              offline
                ? "Search the Arduino library registry…"
                : "Filter the Arduino library registry…"
            }
            value={librarySearchQuery.value}
            onInput={(e) => {
              librarySearchQuery.value = (e.target as HTMLInputElement).value;
            }}
            spellcheck={false}
            autocomplete="off"
          />
          {(librarySearchPending.value || status === "loading") && (
            <LoaderCircle
              class="lv-spin lv-search-spin"
              size={14}
              strokeWidth={1.75}
            />
          )}
        </div>
        <button
          class="lv-zip-btn"
          title="Install a library from a local .zip archive"
          disabled={!!busy}
          onClick={() => void installFromZip()}
        >
          <FileArchive size={15} strokeWidth={1.5} />
        </button>
      </div>

      {/* All / Installed scope toggle — hidden in the offline fallback,
          where there is no cached registry to browse. */}
      {!offline && (
        <div class="lv-tabs" role="tablist">
          <button
            class={`lv-tab ${mode === "all" ? "active" : ""}`}
            role="tab"
            aria-selected={mode === "all"}
            onClick={() => {
              libraryFilterMode.value = "all";
            }}
          >
            All
            {registry && <span class="lv-tab-count">{registry.length}</span>}
          </button>
          <button
            class={`lv-tab ${mode === "installed" ? "active" : ""}`}
            role="tab"
            aria-selected={mode === "installed"}
            onClick={() => {
              libraryFilterMode.value = "installed";
            }}
          >
            Installed
            <span class="lv-tab-count">{installed.length}</span>
          </button>
        </div>
      )}

      <div class="lv-body">
        {offline ? (
          <OfflineBody
            debounced={debounced}
            installed={installed}
            installedNames={installedNames}
            busy={busy}
            pending={librarySearchPending.value}
            onInstall={install}
            onUpdate={update}
            onRemove={uninstall}
            onRetry={() => void loadRegistry()}
          />
        ) : mode === "installed" ? (
          <InstalledBody
            installed={installed}
            filtered={filteredInstalled}
            debounced={debounced}
            busy={busy}
            onUpdate={update}
            onRemove={uninstall}
          />
        ) : (
          <RegistryBody
            status={status}
            registry={registry}
            filtered={filteredRegistry}
            debounced={debounced}
            installedNames={installedNames}
            busy={busy}
            onInstall={install}
          />
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

/* ------------------------------------------------------------------ */
/* "All" — the virtualized full-registry browser                       */
/* ------------------------------------------------------------------ */

function RegistryBody({
  status,
  registry,
  filtered,
  debounced,
  installedNames,
  busy,
  onInstall,
}: {
  status: string;
  registry: Library[] | null;
  filtered: Library[];
  debounced: string;
  installedNames: Set<string>;
  busy: string | null;
  onInstall: (lib: Library) => void;
}) {
  if (status === "loading" || (status === "idle" && registry === null)) {
    return (
      <div class="lv-state">
        <LoaderCircle class="lv-spin lv-state-icon" size={22} strokeWidth={1.75} />
        <span>Loading the Arduino library registry…</span>
        <span class="lv-state-sub">This is fetched once, then filtered instantly.</span>
      </div>
    );
  }

  return (
    <>
      <div class="lv-section-label">
        Registry · {filtered.length.toLocaleString()}
        {debounced ? ` of ${(registry?.length ?? 0).toLocaleString()}` : ""}
      </div>
      {filtered.length === 0 ? (
        <div class="lv-empty">
          {debounced
            ? `No libraries match “${debounced}”.`
            : "The registry is empty."}
        </div>
      ) : (
        <VirtualLibraryList
          libraries={filtered}
          installedNames={installedNames}
          busy={busy}
          onInstall={onInstall}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* "Installed" — the installed set (small; not virtualized)            */
/* ------------------------------------------------------------------ */

function InstalledBody({
  installed,
  filtered,
  debounced,
  busy,
  onUpdate,
  onRemove,
}: {
  installed: Library[];
  filtered: Library[];
  debounced: string;
  busy: string | null;
  onUpdate: (lib: Library) => void;
  onRemove: (lib: Library) => void;
}) {
  return (
    <>
      <div class="lv-section-label">Installed · {filtered.length}</div>
      {installed.length === 0 ? (
        <div class="lv-empty">
          No libraries installed. Switch to All to add one from the registry.
        </div>
      ) : filtered.length === 0 ? (
        <div class="lv-empty">No installed libraries match “{debounced}”.</div>
      ) : (
        filtered.map((lib) => (
          <LibraryRow
            key={`i-${lib.name}`}
            lib={lib}
            installed
            busy={busy}
            onUpdate={() => onUpdate(lib)}
            onRemove={() => onRemove(lib)}
          />
        ))
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Offline fallback — per-query backend search (the old behaviour)     */
/* ------------------------------------------------------------------ */

function OfflineBody({
  debounced,
  installed,
  installedNames,
  busy,
  pending,
  onInstall,
  onUpdate,
  onRemove,
  onRetry,
}: {
  debounced: string;
  installed: Library[];
  installedNames: Set<string>;
  busy: string | null;
  pending: boolean;
  onInstall: (lib: Library) => void;
  onUpdate: (lib: Library) => void;
  onRemove: (lib: Library) => void;
  onRetry: () => void;
}) {
  const results = librarySearchResults.value;
  return (
    <>
      <div class="lv-offline-note">
        <WifiOff size={13} strokeWidth={1.75} />
        <span>
          Couldn't load the full registry. Searching it directly instead.
        </span>
        <button class="lv-retry-btn" onClick={onRetry}>
          <RefreshCw size={11} strokeWidth={1.75} />
          <span>Retry</span>
        </button>
      </div>

      {debounced && (
        <>
          <div class="lv-section-label">
            Search results{results.length > 0 ? ` · ${results.length}` : ""}
          </div>
          {pending && results.length === 0 ? (
            <div class="lv-empty">Searching the registry…</div>
          ) : results.length === 0 ? (
            <div class="lv-empty">No libraries match “{debounced}”.</div>
          ) : (
            results.map((lib) => (
              <LibraryRow
                key={`r-${lib.name}`}
                lib={lib}
                installed={installedNames.has(lib.name.toLowerCase())}
                busy={busy}
                onInstall={() => onInstall(lib)}
              />
            ))
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
            onUpdate={() => onUpdate(lib)}
            onRemove={() => onRemove(lib)}
          />
        ))
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Virtualized list                                                    */
/* ------------------------------------------------------------------ */

/**
 * A virtualized scrolling list of `LibraryRow`s. Only the rows in (and a small
 * overscan margin around) the viewport are mounted; spacer divs above and
 * below stand in for the off-screen rows so the scrollbar stays correct.
 *
 * The windowing maths lives in `lib/library-filter.ts` (`computeWindow`) and
 * is unit-tested there.
 */
function VirtualLibraryList({
  libraries,
  installedNames,
  busy,
  onInstall,
}: {
  libraries: Library[];
  installedNames: Set<string>;
  busy: string | null;
  onInstall: (lib: Library) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  // Measure the scroll viewport, and keep the measurement current as the
  // window (and so the panel) resizes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // When the filtered list shrinks under the current scroll offset (e.g. the
  // user types and far fewer rows remain), pull the scroll position back into
  // range so the list isn't stuck showing blank space.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, libraries.length * ROW_HEIGHT - el.clientHeight);
    if (el.scrollTop > maxScroll) {
      el.scrollTop = maxScroll;
      setScrollTop(maxScroll);
    }
  }, [libraries.length]);

  const win = computeWindow(
    libraries.length,
    ROW_HEIGHT,
    scrollTop,
    viewportH,
    OVERSCAN,
  );
  const visible = libraries.slice(win.startIndex, win.endIndex);

  return (
    <div
      class="lv-virt"
      ref={scrollRef}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
    >
      {/* Top spacer — reserves the height of the rows scrolled off the top. */}
      <div style={{ height: `${win.topPad}px` }} />
      {visible.map((lib) => (
        <LibraryRow
          key={`r-${lib.name}`}
          lib={lib}
          installed={installedNames.has(lib.name.toLowerCase())}
          busy={busy}
          onInstall={() => onInstall(lib)}
        />
      ))}
      {/* Bottom spacer — reserves the height of the rows below the viewport. */}
      <div style={{ height: `${win.bottomPad}px` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Library row                                                         */
/* ------------------------------------------------------------------ */

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
      <div class="lv-row-main">
        <div class="lv-row-head">
          <span class="lv-row-name">{lib.name}</span>
          {version && <span class="lv-row-ver">{version}</span>}
        </div>
        <div class="lv-row-desc">{desc}</div>
        {lib.author && <div class="lv-row-by">by {lib.author}</div>}
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
