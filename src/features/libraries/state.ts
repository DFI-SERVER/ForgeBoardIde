/**
 * Library Manager registry/search state and the Examples rail.
 */
import { signal } from "@preact/signals";
import type { Library, LibraryExample } from "@/ipc/arduino";

/** Libraries — full registry browse + installed set (Phase 9 Library Manager). */
export const installedLibraries = signal<Library[]>([]);

/** Raw text in the library search box — filters the cached registry in memory. */
export const librarySearchQuery = signal<string>("");

/**
 * The entire Arduino library registry (~9000 entries), fetched once via
 * `arduino_lib_list_all` and cached. `null` means "not loaded yet" — distinct
 * from `[]`, which would mean "loaded, and empty".
 */
export const libraryRegistry = signal<Library[] | null>(null);

/** Lifecycle of the one-time full-registry fetch. */
export type LibraryRegistryStatus = "idle" | "loading" | "ready" | "error";

export const libraryRegistryStatus = signal<LibraryRegistryStatus>("idle");

/**
 * Search-only fallback results — used when the full-registry fetch failed
 * (e.g. offline) and the user searches the registry the old, per-query way.
 */
export const librarySearchResults = signal<Library[]>([]);

/** True while a fallback registry search request is in flight. */
export const librarySearchPending = signal<boolean>(false);

/** Library Manager browse scope — the All / Installed segmented toggle. */
export type LibraryFilterMode = "all" | "installed" | "updatable";

// Default to "installed" so opening the Libraries rail lands on what the user
// is most likely to manage (their own installed set) rather than the 9000-entry
// registry firehose. New users with nothing installed see an empty-state CTA
// pointing them at the All tab.
export const libraryFilterMode = signal<LibraryFilterMode>("installed");

/** Name of the library whose install / update / remove is currently running. */
export const libraryInstalling = signal<string | null>(null);

/** Streamed progress lines from the active library install/uninstall. */
export const libraryInstallProgress = signal<string[]>([]);

/**
 * Examples — the Examples rail. The curated starter set is static frontend
 * data (see lib/example-catalog.ts); these signals hold the dynamic,
 * installed-library examples and the live filter text.
 */
export const libraryExamples = signal<LibraryExample[]>([]);

/** Raw text in the Examples search box — filters examples by name as you type. */
export const exampleSearchQuery = signal<string>("");

/** True while the installed-library examples scan is in flight. */
export const exampleScanPending = signal<boolean>(false);

/** Name of the example currently being opened as a new sketch, or null. */
export const exampleOpening = signal<string | null>(null);

/** Library Manager facets — Arduino IDE's Type and Topic dropdowns. Empty = any. */
export const libraryTypeFilter = signal<string>("");
export const libraryTopicFilter = signal<string>("");
