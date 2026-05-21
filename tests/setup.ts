import "@testing-library/jest-dom";

// Monaco's clipboard module probes document.queryCommandSupported at import
// time; jsdom does not implement it. Stub it so components that transitively
// import monaco-editor can be rendered in tests.
if (typeof document !== "undefined" && !document.queryCommandSupported) {
  document.queryCommandSupported = () => false;
}
