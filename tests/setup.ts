import "@testing-library/jest-dom";

// Monaco's clipboard module probes document.queryCommandSupported at import
// time; jsdom does not implement it. Stub it so components that transitively
// import monaco-editor can be rendered in tests.
if (typeof document !== "undefined" && !document.queryCommandSupported) {
  document.queryCommandSupported = () => false;
}

// The test runner can expose a partial / non-functional `localStorage` (Node's
// experimental Web Storage, left inert without `--localstorage-file`). Code
// under test persists preferences to localStorage, so install a small, fully
// in-memory implementation whenever the ambient one is missing a core method.
if (
  typeof globalThis.localStorage === "undefined" ||
  typeof globalThis.localStorage.getItem !== "function" ||
  typeof globalThis.localStorage.setItem !== "function" ||
  typeof globalThis.localStorage.removeItem !== "function" ||
  typeof globalThis.localStorage.clear !== "function"
) {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: memoryStorage,
    configurable: true,
    writable: true,
  });
}

// jsdom does not implement ResizeObserver; the virtualized library list
// constructs one on mount to track its viewport height. A no-op stub lets
// such size-aware components render in tests — the windowing maths itself
// is unit-tested directly in src/lib/library-filter.test.ts.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom does not implement matchMedia; Monaco's StandaloneThemeService probes
// `(forced-colors: active)` on a deferred timer (constructed lazily when the
// first monaco.editor.createModel is called). Without a stub the timer fires
// after the test suite finishes and reports a sea of red on otherwise green
// runs. The fix mirrors the no-op `MediaQueryList` shape Monaco expects.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) => {
    const listeners = new Set<(e: MediaQueryListEvent) => void>();
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      dispatchEvent: () => false,
    } as MediaQueryList;
  };
}

// jsdom does not implement navigator.clipboard nor ClipboardItem, but
// Monaco installs a body-level click handler at import time that constructs
// `new ClipboardItem(...)` and then calls `navigator.clipboard.write(...)`.
// In a test the next fireEvent.click on a button bubbles to that handler
// and crashes with a noisy uncaught error unrelated to anything under
// test. No-op stubs keep the handler quiet.
if (typeof navigator !== "undefined" && !navigator.clipboard) {
  Object.defineProperty(navigator, "clipboard", {
    value: {
      write: async () => {},
      writeText: async () => {},
      read: async () => [],
      readText: async () => "",
    },
    configurable: true,
    writable: true,
  });
}
if (typeof globalThis.ClipboardItem === "undefined") {
  class ClipboardItemStub {
    constructor(_: Record<string, unknown>) {}
  }
  globalThis.ClipboardItem =
    ClipboardItemStub as unknown as typeof ClipboardItem;
}

// Monaco's clipboard module installs a body-level click handler whose chain
// creates DeferredPromises and cancels superseded ones. The cancel path
// rejects with a CancellationError that has no .catch attached, surfacing
// as an unhandled rejection. Filter only that specific Monaco-internal
// rejection so genuine test failures still bubble up.
if (typeof process !== "undefined" && typeof process.on === "function") {
  process.on("unhandledRejection", (reason) => {
    if (
      reason &&
      typeof reason === "object" &&
      "name" in reason &&
      (reason as { name?: unknown }).name === "Canceled"
    ) {
      return;
    }
    // Anything else is a real failure — re-throw to keep the default behavior.
    throw reason;
  });
}
