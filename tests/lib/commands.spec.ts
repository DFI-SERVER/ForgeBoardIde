import { describe, it, expect, beforeEach } from "vitest";
import { commands, filterCommands } from "../../src/lib/commands";
import { activeRail } from "../../src/state/appState";

beforeEach(() => {
  activeRail.value = "files";
});

describe("command registry", () => {
  it("exposes commands across the five categories", () => {
    const categories = new Set(commands.map((c) => c.category));
    for (const name of ["File", "Sketch", "Edit", "View", "Go"]) {
      expect(categories.has(name)).toBe(true);
    }
  });

  it("gives every command a unique id", () => {
    const ids = commands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("Go commands switch the activeRail signal", () => {
    const goBoards = commands.find((c) => c.id === "go.boards")!;
    goBoards.run();
    expect(activeRail.value).toBe("boards");
  });
});

describe("filterCommands", () => {
  it("returns every command for an empty query", () => {
    expect(filterCommands("")).toHaveLength(commands.length);
    expect(filterCommands("   ")).toHaveLength(commands.length);
  });

  it("matches a substring of the title", () => {
    const hits = filterCommands("upload");
    expect(hits.some((c) => c.id === "sketch.upload")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(filterCommands("SAVE").some((c) => c.id === "file.save")).toBe(true);
  });

  it("ranks an exact/prefix title match first", () => {
    // "save" is the whole title of file.save — it must outrank fuzzy matches.
    expect(filterCommands("save")[0].id).toBe("file.save");
  });

  it("supports subsequence (fuzzy) matching", () => {
    // n-s-k → "New Sketch"
    expect(filterCommands("nsk").some((c) => c.id === "file.new")).toBe(true);
  });

  it("surfaces commands by category name", () => {
    const hits = filterCommands("sketch");
    expect(hits.some((c) => c.category === "Sketch")).toBe(true);
  });

  it("returns nothing for an unmatched query", () => {
    expect(filterCommands("zzzznomatch")).toHaveLength(0);
  });
});
