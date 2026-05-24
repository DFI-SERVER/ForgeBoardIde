import { describe, it, expect, beforeEach } from "vitest";
import {
  pushRecentFilePath,
  recentFilePaths,
  MAX_RECENT_FILE_PATHS,
} from "../../src/state/appState";

beforeEach(() => {
  recentFilePaths.value = [];
});

describe("pushRecentFilePath", () => {
  it("pushes a new path to the front", () => {
    pushRecentFilePath("/s/a.ino");
    pushRecentFilePath("/s/b.h");
    expect(recentFilePaths.value).toEqual(["/s/b.h", "/s/a.ino"]);
  });

  it("dedups — pushing an existing path moves it to the front without growing", () => {
    pushRecentFilePath("/s/a.ino");
    pushRecentFilePath("/s/b.h");
    pushRecentFilePath("/s/a.ino");
    expect(recentFilePaths.value).toEqual(["/s/a.ino", "/s/b.h"]);
  });

  it("trims to the documented cap", () => {
    for (let i = 0; i < MAX_RECENT_FILE_PATHS + 4; i++) {
      pushRecentFilePath(`/s/f${i}.ino`);
    }
    expect(recentFilePaths.value.length).toBe(MAX_RECENT_FILE_PATHS);
    expect(recentFilePaths.value[0]).toBe(`/s/f${MAX_RECENT_FILE_PATHS + 3}.ino`);
  });

  it("ignores an empty path", () => {
    pushRecentFilePath("");
    expect(recentFilePaths.value).toEqual([]);
  });
});
