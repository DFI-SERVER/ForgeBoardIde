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
