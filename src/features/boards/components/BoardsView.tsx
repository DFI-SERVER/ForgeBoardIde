import { useEffect, useRef, useState } from "preact/hooks";
import { Search, LoaderCircle } from "lucide-preact";
import { openUrl } from "@tauri-apps/plugin-opener";
import { arduinoApi, type Core } from "@/ipc/arduino";
import {
  installedCores,
  installedBoards,
  detectedPorts,
  coreInstallProgress,
  coreInstallRunning,
} from "@/features/boards/state";
import { connectToPort } from "@/features/boards/connection";
import { CURATED_CATALOG, boardIndexUrls } from "@/features/boards/index-urls";
import { activeRail, toast } from "@/app/state";
import "./BoardsView.css";

type Tab = "popular" | "installed" | "all";

/**
 * Boards view — connected hardware plus the Boards Manager: the curated
 * Popular list, everything installed (with Update / Remove / version
 * switch), and the full board index searchable across every configured
 * vendor URL. Mirrors Arduino IDE's Boards Manager feature for feature.
 */
export function BoardsView() {
  const [tab, setTab] = useState<Tab>("popular");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<Core[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // The "All" tab lists the whole index; a query narrows it. Searching
  // from Popular/Installed switches to All so results have somewhere to go.
  useEffect(() => {
    if (tab !== "all") return;
    const seq = ++searchSeq.current;
    setSearching(true);
    arduinoApi
      .searchCores(debounced, boardIndexUrls())
      .then((r) => {
        if (seq === searchSeq.current) setResults(r);
      })
      .catch((e) => {
        if (seq === searchSeq.current) {
          setResults([]);
          toast.value = { kind: "warn", text: `Board index search failed: ${String(e)}` };
        }
      })
      .finally(() => {
        if (seq === searchSeq.current) setSearching(false);
      });
  }, [tab, debounced]);

  async function refresh() {
    try {
      installedCores.value = await arduinoApi.listCores(boardIndexUrls());
      installedBoards.value = await arduinoApi.listBoards();
      detectedPorts.value = await arduinoApi.detectPorts();
    } catch (e) {
      console.error("BoardsView refresh failed:", e);
    }
  }

  /** Run one streaming core operation with the install log and lock. */
  async function runOp(label: string, coreId: string, op: () => Promise<number>) {
    if (coreInstallRunning.value) return;
    coreInstallRunning.value = coreId;
    coreInstallProgress.value = [`${label} ${coreId}…`];
    let unlisten: () => void = () => {};
    try {
      unlisten = await arduinoApi.onCoreInstallOutput((line) => {
        coreInstallProgress.value = [...coreInstallProgress.value, line];
      });
      const code = await op();
      coreInstallProgress.value = [
        ...coreInstallProgress.value,
        code === 0 ? `✓ ${label} ${coreId} done` : `✗ ${label} failed (exit ${code})`,
      ];
      toast.value =
        code === 0
          ? { kind: "success", text: `${label} complete: ${coreId}` }
          : { kind: "warn", text: `${label} failed: ${coreId}` };
      await refresh();
      if (tab === "all") setDebounced((d) => d + ""); // refetch results with new installed state
    } catch (e) {
      coreInstallProgress.value = [...coreInstallProgress.value, `✗ Error: ${String(e)}`];
      toast.value = { kind: "warn", text: `${label} error: ${String(e)}` };
    } finally {
      unlisten();
      coreInstallRunning.value = null;
    }
  }

  const install = (id: string, version?: string) =>
    runOp("Install", id, () => arduinoApi.installCore(version ? `${id}@${version}` : id, boardIndexUrls()));
  const remove = (id: string) => runOp("Remove", id, () => arduinoApi.uninstallCore(id));

  const installedIds = new Set(installedCores.value.map((c) => c.id));
  const busy = coreInstallRunning.value;

  return (
    <div class="bv">
      <div class="bv-header">
        <span class="bv-title">Boards</span>
        <span class="bv-stats">
          connected {detectedPorts.value.length} · installed {installedCores.value.length}
          {installedCores.value.some((c) => c.update_available) ? " · updates available" : ""}
        </span>
      </div>

      <div class="bv-body">
        <div class="bv-section-label">CONNECTED</div>
        {detectedPorts.value.length === 0 ? (
          <div class="bv-empty">No boards plugged in.</div>
        ) : (
          detectedPorts.value.map((p) => (
            <div key={p.port} class="bv-row bv-row-connected">
              <span class="bv-dot connected" />
              <div class="bv-row-main">
                <div class="bv-row-name">{p.name ?? p.fqbn ?? "Unknown board"}</div>
                <div class="bv-row-meta">
                  {p.port}
                  {p.fqbn ? " · " + p.fqbn : ""}
                </div>
              </div>
              <button class="bv-row-action" onClick={() => void connectToPort(p.port)}>
                select
              </button>
            </div>
          ))
        )}

        <div class="bv-section-label">BOARDS MANAGER</div>
        <div class="bv-search">
          <div class="bv-search-field">
            <Search class="bv-search-icon" size={15} strokeWidth={1.75} />
            <input
              class="bv-search-input"
              type="text"
              placeholder="Search the board index (every vendor)…"
              value={query}
              onInput={(e) => {
                setQuery((e.target as HTMLInputElement).value);
                if (tab !== "all") setTab("all");
              }}
              spellcheck={false}
            />
            {searching && <LoaderCircle class="bv-spin" size={14} strokeWidth={1.75} />}
          </div>
          <button class="bv-link" onClick={() => (activeRail.value = "settings")} title="Add vendor index URLs">
            Index URLs…
          </button>
        </div>
        <div class="bv-tabs" role="tablist">
          {(
            [
              ["popular", "Popular"],
              ["installed", `Installed (${installedCores.value.length})`],
              ["all", "All"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              class={`bv-tab ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "popular" &&
          CURATED_CATALOG.map((c) => {
            const inst = installedCores.value.find((x) => x.id === c.id);
            return inst ? (
              <CoreRow key={c.id} core={inst} busy={busy} onInstall={install} onRemove={remove}
                confirmRemove={confirmRemove} setConfirmRemove={setConfirmRemove} />
            ) : (
              <div key={c.id} class="bv-row">
                <span class="bv-dot dim" />
                <div class="bv-row-main">
                  <div class="bv-row-name">{c.name}</div>
                  <div class="bv-row-meta">
                    {c.platform} · {c.id}
                  </div>
                </div>
                <button class="bv-row-install" disabled={!!busy} onClick={() => install(c.id)}>
                  {busy === c.id ? "installing…" : "install core →"}
                </button>
              </div>
            );
          })}

        {tab === "installed" &&
          (installedCores.value.length === 0 ? (
            <div class="bv-empty">No cores installed. Pick one under Popular, or search the index.</div>
          ) : (
            installedCores.value.map((c) => (
              <CoreRow key={c.id} core={c} busy={busy} onInstall={install} onRemove={remove}
                confirmRemove={confirmRemove} setConfirmRemove={setConfirmRemove} />
            ))
          ))}

        {tab === "all" &&
          (results === null ? (
            <div class="bv-empty">Loading the board index…</div>
          ) : results.length === 0 ? (
            <div class="bv-empty">{debounced ? `No cores match “${debounced}”.` : "The board index is empty."}</div>
          ) : (
            results.map((c) => (
              <CoreRow
                key={c.id}
                core={installedIds.has(c.id) ? { ...c, ...installedCores.value.find((x) => x.id === c.id) } : c}
                busy={busy}
                onInstall={install}
                onRemove={remove}
                confirmRemove={confirmRemove}
                setConfirmRemove={setConfirmRemove}
              />
            ))
          ))}

        {coreInstallProgress.value.length > 0 && (
          <div class="bv-install-log">
            <div class="bv-section-label">INSTALL LOG</div>
            {coreInstallProgress.value.slice(-14).map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One core from the index or the installed set, with a version picker and
 *  Install / Update / Remove / More info. */
function CoreRow({
  core,
  busy,
  onInstall,
  onRemove,
  confirmRemove,
  setConfirmRemove,
}: {
  core: Core;
  busy: string | null;
  onInstall: (id: string, version?: string) => void;
  onRemove: (id: string) => void;
  confirmRemove: string | null;
  setConfirmRemove: (id: string | null) => void;
}) {
  const versions = core.versions.length ? core.versions : [core.latest_version ?? core.version ?? ""].filter(Boolean);
  const [picked, setPicked] = useState(core.installed_version ?? core.latest_version ?? versions[0] ?? "");
  const isBusy = busy === core.id;
  const asking = confirmRemove === core.id;
  const pickedIsInstalled = core.installed && picked === core.installed_version;

  return (
    <div class={`bv-row ${core.installed ? "" : ""}`}>
      <span class={`bv-dot ${core.installed ? "idle" : "dim"}`} />
      <div class="bv-row-main">
        <div class="bv-row-name">
          {core.name}
          {core.update_available && <span class="bv-badge">update {core.latest_version}</span>}
        </div>
        <div class="bv-row-meta">
          {core.id}
          {core.maintainer ? ` · ${core.maintainer}` : ""}
          {core.installed_version ? ` · installed ${core.installed_version}` : ""}
          {core.website && (
            <>
              {" · "}
              <a
                class="bv-more"
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  openUrl(core.website!).catch(() => {
                    toast.value = { kind: "warn", text: `Couldn't open the link. The address is ${core.website}` };
                  });
                }}
              >
                more info
              </a>
            </>
          )}
        </div>
      </div>
      {versions.length > 1 && (
        <select
          class="bv-version"
          title="Version"
          value={picked}
          disabled={!!busy}
          onChange={(e) => setPicked((e.target as HTMLSelectElement).value)}
        >
          {versions.map((v) => (
            <option key={v} value={v}>
              {v}
              {v === core.installed_version ? " (installed)" : v === core.latest_version ? " (latest)" : ""}
            </option>
          ))}
        </select>
      )}
      {core.installed ? (
        <>
          {core.update_available && (
            <button class="bv-row-install" disabled={!!busy} onClick={() => onInstall(core.id, core.latest_version)}>
              {isBusy ? "updating…" : "update"}
            </button>
          )}
          {!pickedIsInstalled && !core.update_available && picked && (
            <button class="bv-row-install" disabled={!!busy} onClick={() => onInstall(core.id, picked)}>
              {isBusy ? "installing…" : `switch to ${picked}`}
            </button>
          )}
          {!pickedIsInstalled && core.update_available && picked !== core.latest_version && picked && (
            <button class="bv-row-install" disabled={!!busy} onClick={() => onInstall(core.id, picked)}>
              {isBusy ? "installing…" : `switch to ${picked}`}
            </button>
          )}
          {asking ? (
            <span class="bv-confirm">
              <button class="bv-row-remove" disabled={!!busy} onClick={() => { setConfirmRemove(null); onRemove(core.id); }}>
                confirm remove
              </button>
              <button class="bv-row-action" onClick={() => setConfirmRemove(null)}>keep</button>
            </span>
          ) : (
            <button class="bv-row-remove" disabled={!!busy} onClick={() => setConfirmRemove(core.id)} title={`Remove ${core.id}`}>
              remove
            </button>
          )}
        </>
      ) : (
        <button class="bv-row-install" disabled={!!busy} onClick={() => onInstall(core.id, picked || undefined)}>
          {isBusy ? "installing…" : "install core →"}
        </button>
      )}
    </div>
  );
}
