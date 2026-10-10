import { describe, it, expect } from "vitest";
import {
  ProgressTracker,
  compileStageFor,
  uploadStageFor,
  isCommandLine,
  isCompilerInvocation,
  loadExpectedInvocations,
  saveExpectedInvocations,
} from "@/features/build/progress";

describe("build progress", () => {
  it("recognises arduino-cli's verbose stage markers", () => {
    expect(compileStageFor("Detecting libraries used...")?.label).toBe("Checking libraries");
    expect(compileStageFor("Compiling core...")?.at).toBe(55);
    expect(compileStageFor("Linking everything together...")?.label).toBe("Linking");
    expect(compileStageFor("Sketch uses 288442 bytes (22%) of program storage space.")?.at).toBe(100);
    expect(compileStageFor("random line")).toBeNull();
  });

  it("reads esptool's real percentage", () => {
    expect(uploadStageFor("Writing at 0x00010000... (42 %)")).toEqual({ label: "Writing firmware", at: 20 + Math.round(42 * 0.72) });
    expect(uploadStageFor("Hash of data verified.")?.label).toBe("Verifying");
    expect(uploadStageFor("Hard resetting via RTS pin...")?.at).toBe(99);
  });

  it("hides raw tool invocations unless verbose", () => {
    expect(isCommandLine("/Users/x/Arduino15/packages/esp32/tools/esp-x32/2601/bin/xtensa-esp32s3-elf-g++ -c @flags")).toBe(true);
    expect(isCommandLine('"C:\\Users\\x\\xtensa-esp32s3-elf-g++.exe" -c foo.cpp')).toBe(true);
    expect(isCommandLine("Using board 'esp32s3' from platform in folder: /x")).toBe(true);
    expect(isCommandLine("Compiling sketch...")).toBe(false);
    expect(isCommandLine("sketch.ino:3:1: error: expected ';'")).toBe(false);
  });

  it("counts compiler invocations and advances within a stage against the expected count", () => {
    const t = new ProgressTracker(4);
    expect(t.feed("Compiling sketch...")).toEqual({ stage: "Compiling sketch", percent: 20 });
    const cmd = "/x/bin/xtensa-esp32s3-elf-g++ -c @/x/flags a.cpp -o a.o";
    expect(isCompilerInvocation(cmd)).toBe(true);
    t.feed(cmd);
    t.feed(cmd);
    const mid = t.feed(cmd)!;
    expect(mid.stage).toBe("Compiling sketch");
    expect(mid.percent).toBeGreaterThan(20);
    expect(mid.percent).toBeLessThan(40);
    expect(t.feed("Compiling core...")!.percent).toBeGreaterThanOrEqual(55);
    expect(t.invocationCount).toBe(3);
  });

  it("holds the stage base when nothing is known about the board yet", () => {
    const t = new ProgressTracker(null);
    t.feed("Compiling core...");
    t.feed("/x/g++ -c a.cpp");
    expect(t.current()).toEqual({ stage: "Compiling core", percent: 55 });
  });

  it("switches to upload stages when the flasher starts on the same stream", () => {
    const t = new ProgressTracker(10);
    t.feed("Sketch uses 1 bytes (1%) of program storage space.");
    expect(t.feed("esptool v5.3.1")).toEqual({ stage: "Connecting to board", percent: 5 });
    expect(t.feed("Writing at 0x00010000... (100 %)")!.percent).toBe(92);
    expect(t.feed("Hard resetting via RTS pin...")!.stage).toBe("Restarting board");
  });

  it("remembers the invocation count per board", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(loadExpectedInvocations("esp32:esp32:esp32s3", storage)).toBeNull();
    saveExpectedInvocations("esp32:esp32:esp32s3", 42, storage);
    expect(loadExpectedInvocations("esp32:esp32:esp32s3", storage)).toBe(42);
    saveExpectedInvocations("esp32:esp32:esp32s3", 0, storage);
    expect(loadExpectedInvocations("esp32:esp32:esp32s3", storage)).toBe(42);
  });
});
