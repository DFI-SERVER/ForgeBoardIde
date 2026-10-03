import { describe, it, expect, beforeEach } from "vitest";
import {
  serialLog,
  serialLogTotal,
  appendSerialLog,
  MAX_SERIAL_LOG_ENTRIES,
  type SerialLogEntry,
} from "../../src/state/appState";

function rx(text: string): SerialLogEntry {
  return { ts: 0, text, kind: "rx" };
}

beforeEach(() => {
  serialLog.value = [];
  serialLogTotal.value = 0;
});

describe("appendSerialLog", () => {
  it("appends entries and counts them", () => {
    appendSerialLog(rx("one"));
    appendSerialLog(rx("two"));
    expect(serialLog.value.map((e) => e.text)).toEqual(["one", "two"]);
    expect(serialLogTotal.value).toBe(2);
  });

  it("trims the oldest entries past the cap but keeps the total monotonic", () => {
    for (let i = 0; i < MAX_SERIAL_LOG_ENTRIES + 25; i++) {
      appendSerialLog(rx(`line ${i}`));
    }
    expect(serialLog.value).toHaveLength(MAX_SERIAL_LOG_ENTRIES);
    // The head was dropped: the first retained entry is line 25.
    expect(serialLog.value[0].text).toBe("line 25");
    expect(serialLog.value[serialLog.value.length - 1].text).toBe(
      `line ${MAX_SERIAL_LOG_ENTRIES + 24}`,
    );
    // Total counts every entry ever appended, not just the retained window.
    expect(serialLogTotal.value).toBe(MAX_SERIAL_LOG_ENTRIES + 25);
  });

  it("Clear (emptying the log) does not reset the total", () => {
    appendSerialLog(rx("a"));
    appendSerialLog(rx("b"));
    serialLog.value = []; // what the Serial Monitor Clear button does
    expect(serialLogTotal.value).toBe(2);
    appendSerialLog(rx("c"));
    expect(serialLog.value.map((e) => e.text)).toEqual(["c"]);
    expect(serialLogTotal.value).toBe(3);
  });
});
