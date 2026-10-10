import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Search, SearchX, FileCode2, CornerDownRight } from "lucide-preact";
import { currentSketch, projectSearchQuery, searchFocusRequest } from "@/features/project/state";
import { fileContents } from "@/features/editor/state";
import { openFileAtLine } from "@/features/editor/actions";
import {
  searchFiles,
  segmentLine,
  type SearchableFile,
  type SearchMatch,
} from "@/features/project/project-search";
import "./SearchView.css";

/** Debounce window for the live search as the user types, in milliseconds. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * Find in Project — the Search activity-rail view.
 *
 * Searches every file of the currently-open sketch in memory (sketch contents
 * already live in the `fileContents` map, so no disk read is needed). Results
 * are grouped by file; clicking one opens that file and jumps to the line.
 */
export function SearchView() {
  // Local mirror of the debounced query — the signal holds raw keystrokes so
  // the input stays controlled while the heavy search work is throttled.
  const [debounced, setDebounced] = useState(projectSearchQuery.value.trim());
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the query box when the view mounts and whenever Ctrl+Shift+F fires
  // again (searchFocusRequest is bumped even if the view is already mounted).
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [searchFocusRequest.value]);

  // Debounce keystrokes before running the (cheap, but not free) scan.
  useEffect(() => {
    const q = projectSearchQuery.value;
    const t = setTimeout(() => setDebounced(q.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [projectSearchQuery.value]);

  const sketch = currentSketch.value;

  // The sketch's files paired with their in-memory contents. Recomputed only
  // when the sketch or the contents map identity changes.
  const files = useMemo<SearchableFile[]>(() => {
    if (!sketch) return [];
    const contents = fileContents.value;
    return sketch.files.map((f) => ({
      name: f.name,
      path: f.path,
      content: contents.get(f.path) ?? "",
    }));
  }, [sketch, fileContents.value]);

  // Run the search. Case-insensitive by default (see searchFiles).
  const result = useMemo(
    () => searchFiles(files, debounced),
    [files, debounced],
  );

  const submit = (e: Event) => {
    e.preventDefault();
    // Submitting bypasses the debounce for an immediate result.
    setDebounced(projectSearchQuery.value.trim());
  };

  const hasQuery = debounced.length > 0;

  return (
    <div class="sv">
      <div class="sv-header">
        <span class="sv-title">Search</span>
        {hasQuery && (
          <span class="sv-stats">
            {result.total === 0
              ? "no results"
              : `${result.total} ${result.total === 1 ? "result" : "results"}` +
                ` in ${result.groups.length} ${
                  result.groups.length === 1 ? "file" : "files"
                }`}
          </span>
        )}
      </div>

      <form class="sv-search" onSubmit={submit}>
        <Search class="sv-search-icon" size={14} strokeWidth={1.5} />
        <input
          ref={inputRef}
          class="sv-search-input"
          type="text"
          placeholder="Search in this sketch…"
          value={projectSearchQuery.value}
          onInput={(e) => {
            projectSearchQuery.value = (e.target as HTMLInputElement).value;
          }}
          spellcheck={false}
          autocomplete="off"
        />
      </form>

      <div class="sv-body">
        {!sketch ? (
          <div class="sv-state">
            <Search class="sv-state-icon" size={22} strokeWidth={1.5} />
            <span>No sketch open.</span>
            <span class="sv-state-sub">
              Open a sketch to search across its files.
            </span>
          </div>
        ) : !hasQuery ? (
          <div class="sv-state">
            <Search class="sv-state-icon" size={22} strokeWidth={1.5} />
            <span>Search this sketch</span>
            <span class="sv-state-sub">
              Type above to find text across every file.
            </span>
          </div>
        ) : result.total === 0 ? (
          <div class="sv-state">
            <SearchX class="sv-state-icon" size={22} strokeWidth={1.5} />
            <span>No results</span>
            <span class="sv-state-sub">
              Nothing matches “{debounced}” in this sketch.
            </span>
          </div>
        ) : (
          result.groups.map((group) => (
            <div class="sv-group" key={group.filePath}>
              <div class="sv-file-header">
                <FileCode2 size={13} strokeWidth={1.5} class="sv-file-icon" />
                <span class="sv-file-name">{group.fileName}</span>
                <span class="sv-file-count">{group.matches.length}</span>
              </div>
              {group.matches.map((m, i) => (
                <ResultRow key={`${group.filePath}:${i}`} match={m} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** One matched line — line number, the line text with the match highlighted. */
function ResultRow({ match }: { match: SearchMatch }) {
  const segments = segmentLine(match.lineText, [match]);
  return (
    <button
      class="sv-result"
      title={`${match.fileName}:${match.line}`}
      onClick={() =>
        openFileAtLine(match.filePath, match.line, match.matchStart + 1)
      }
    >
      <CornerDownRight size={11} strokeWidth={1.5} class="sv-result-glyph" />
      <span class="sv-result-line">{match.line}</span>
      <span class="sv-result-text">
        {segments.map((seg, i) =>
          seg.highlight ? (
            <mark class="sv-hit" key={i}>
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </span>
    </button>
  );
}
