import { useEffect } from "preact/hooks";
import {
  Search,
  GraduationCap,
  FileCode2,
  Package,
  LoaderCircle,
} from "lucide-preact";
import {
  libraryExamples,
  exampleSearchQuery,
  exampleScanPending,
  exampleOpening,
  toast,
} from "../state/appState";
import { arduinoApi, type LibraryExample } from "../ipc/arduino";
import { projectApi } from "../ipc/project";
import { openExample } from "../lib/actions";
import {
  CURATED_EXAMPLES,
  STARTER_GROUP_LABEL,
  type CuratedExample,
} from "../lib/example-catalog";
import "./ExamplesView.css";

/**
 * Examples — the Examples activity-rail view.
 *
 * Shows two kinds of example sketch, grouped:
 *   1. The curated starter set — bundled with the app (always available).
 *   2. Examples from each installed library's `examples/` folder — scanned
 *      from disk on mount via the `arduino_list_library_examples` command.
 *
 * A search box filters every example by name. Clicking an example copies it
 * into the sketchbook as a new, editable sketch and opens it (see openExample);
 * the example itself is never modified.
 *
 * Structure and styling mirror the sibling rail views (LibrariesView /
 * SearchView): a header, a search bar, then a scrolling, grouped body.
 */
export function ExamplesView() {
  // Scan installed-library examples once when the view first mounts.
  useEffect(() => {
    let cancelled = false;
    exampleScanPending.value = true;
    arduinoApi
      .listLibraryExamples()
      .then((found) => {
        if (!cancelled) libraryExamples.value = found;
      })
      .catch((e) => {
        if (!cancelled) {
          libraryExamples.value = [];
          console.error("ExamplesView: library example scan failed:", e);
        }
      })
      .finally(() => {
        if (!cancelled) exampleScanPending.value = false;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const query = exampleSearchQuery.value.trim().toLowerCase();
  const matches = (name: string) =>
    query === "" || name.toLowerCase().includes(query);

  // Curated examples that survive the filter, in catalog order.
  const curated = CURATED_EXAMPLES.filter((ex) => matches(ex.name));

  // Library examples that survive the filter, grouped by library name. The
  // backend already sorts by library then example name, so insertion order
  // here is stable and alphabetical.
  const byLibrary = new Map<string, LibraryExample[]>();
  for (const ex of libraryExamples.value) {
    if (!matches(ex.name)) continue;
    const bucket = byLibrary.get(ex.library);
    if (bucket) bucket.push(ex);
    else byLibrary.set(ex.library, [ex]);
  }

  const opening = exampleOpening.value;
  const totalShown =
    curated.length +
    [...byLibrary.values()].reduce((n, list) => n + list.length, 0);
  const hasQuery = query.length > 0;

  /** Open a curated example — its source is bundled, no disk read needed. */
  async function openCurated(ex: CuratedExample) {
    if (opening) return;
    exampleOpening.value = ex.name;
    try {
      await openExample(ex.name, ex.source);
    } finally {
      exampleOpening.value = null;
    }
  }

  /** Open a library example — read its `.ino` from disk, then branch a sketch. */
  async function openLibrary(ex: LibraryExample) {
    if (opening) return;
    exampleOpening.value = ex.ino_path;
    try {
      const source = await projectApi.readFile(ex.ino_path);
      await openExample(ex.name, source);
    } catch (e) {
      toast.value = {
        text: `Couldn't read that example: ${String(e)}`,
        kind: "warn",
      };
    } finally {
      exampleOpening.value = null;
    }
  }

  return (
    <div class="ev">
      <div class="ev-header">
        <span class="ev-title">Examples</span>
        <span class="ev-stats">
          {hasQuery
            ? `${totalShown} ${totalShown === 1 ? "match" : "matches"}`
            : `${CURATED_EXAMPLES.length} starters`}
        </span>
      </div>

      <div class="ev-search">
        <Search class="ev-search-icon" size={14} strokeWidth={1.5} />
        <input
          class="ev-search-input"
          type="text"
          placeholder="Search examples…"
          value={exampleSearchQuery.value}
          onInput={(e) => {
            exampleSearchQuery.value = (e.target as HTMLInputElement).value;
          }}
          spellcheck={false}
          autocomplete="off"
        />
      </div>

      <div class="ev-body">
        {hasQuery && totalShown === 0 ? (
          <div class="ev-state">
            <Search class="ev-state-icon" size={22} strokeWidth={1.5} />
            <span>No examples found</span>
            <span class="ev-state-sub">
              Nothing matches “{exampleSearchQuery.value.trim()}”.
            </span>
          </div>
        ) : (
          <>
            {/* --- Curated starter examples --- */}
            {curated.length > 0 && (
              <div class="ev-group">
                <div class="ev-group-label">
                  <GraduationCap size={12} strokeWidth={2} />
                  <span>{STARTER_GROUP_LABEL}</span>
                  <span class="ev-group-count">{curated.length}</span>
                </div>
                {curated.map((ex) => (
                  <ExampleRow
                    key={`c-${ex.name}`}
                    name={ex.name}
                    description={ex.description}
                    busy={opening === ex.name}
                    disabled={!!opening}
                    onOpen={() => void openCurated(ex)}
                  />
                ))}
              </div>
            )}

            {/* --- One group per installed library --- */}
            {[...byLibrary.entries()].map(([library, list]) => (
              <div class="ev-group" key={`lib-${library}`}>
                <div class="ev-group-label">
                  <Package size={12} strokeWidth={2} />
                  <span class="ev-group-name">{library}</span>
                  <span class="ev-group-count">{list.length}</span>
                </div>
                {list.map((ex) => (
                  <ExampleRow
                    key={ex.ino_path}
                    name={ex.name}
                    description={`From ${ex.library}`}
                    busy={opening === ex.ino_path}
                    disabled={!!opening}
                    onOpen={() => void openLibrary(ex)}
                  />
                ))}
              </div>
            ))}

            {/* --- Library-scan footnote --- */}
            {exampleScanPending.value ? (
              <div class="ev-note">
                <LoaderCircle class="ev-spin" size={12} strokeWidth={2} />
                <span>Scanning installed libraries…</span>
              </div>
            ) : (
              byLibrary.size === 0 &&
              !hasQuery && (
                <div class="ev-note">
                  Install a library to see its examples here.
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** One example sketch — a clickable row with a name and a one-line summary. */
function ExampleRow({
  name,
  description,
  busy,
  disabled,
  onOpen,
}: {
  name: string;
  description: string;
  busy: boolean;
  disabled: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      class="ev-row"
      disabled={disabled}
      onClick={onOpen}
      title={`Open "${name}" as a new sketch`}
    >
      <span class="ev-row-icon">
        {busy ? (
          <LoaderCircle class="ev-spin" size={14} strokeWidth={2} />
        ) : (
          <FileCode2 size={14} strokeWidth={1.5} />
        )}
      </span>
      <span class="ev-row-main">
        <span class="ev-row-name">{name}</span>
        <span class="ev-row-desc">{description}</span>
      </span>
    </button>
  );
}
