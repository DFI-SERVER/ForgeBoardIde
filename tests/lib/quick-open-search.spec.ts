import { describe, it, expect } from "vitest";
import { scoreMatch, rankFiles } from "../../src/lib/quick-open-search";

describe("scoreMatch", () => {
  it("returns 0 when the query is not a subsequence of the name", () => {
    expect(scoreMatch("xyz", "sketch.ino")).toBe(0);
  });

  it("returns a positive score for a subsequence match", () => {
    expect(scoreMatch("skt", "sketch.ino")).toBeGreaterThan(0);
  });

  it("rewards matches that start at the beginning of the name", () => {
    const startBonus = scoreMatch("ske", "sketch.ino");
    const midMatch = scoreMatch("ske", "my-sketch.ino");
    expect(startBonus).toBeGreaterThan(midMatch);
  });

  it("rewards matches at token boundaries (after _ - .)", () => {
    const atBoundary = scoreMatch("c", "my-config.h");
    const inMiddle = scoreMatch("c", "matrix.h");
    expect(atBoundary).toBeGreaterThan(inMiddle);
  });

  it("rewards consecutive runs of matched characters", () => {
    const consecutive = scoreMatch("blink", "blink.ino");
    const gappy = scoreMatch("blnk", "blink.ino");
    expect(consecutive).toBeGreaterThan(gappy);
  });

  it("rewards a query that prefix-matches the extension", () => {
    const extMatch = scoreMatch("ino", "sketch.ino");
    const noExt = scoreMatch("ino", "innominate.h");
    expect(extMatch).toBeGreaterThan(noExt);
  });

  it("is case-insensitive", () => {
    expect(scoreMatch("SKE", "sketch.ino")).toBe(scoreMatch("ske", "sketch.ino"));
  });

  it("treats an empty query as a no-op (returns 0)", () => {
    expect(scoreMatch("", "anything.ino")).toBe(0);
  });
});

describe("rankFiles", () => {
  const files = [
    { path: "/s/blink.ino", name: "blink.ino" },
    { path: "/s/secrets.h", name: "secrets.h" },
    { path: "/s/util.cpp", name: "util.cpp" },
    { path: "/s/README.md", name: "README.md" },
  ];

  it("returns the input unchanged for an empty query", () => {
    const result = rankFiles(files, "");
    expect(result).toEqual(files);
  });

  it("filters out non-matches", () => {
    const result = rankFiles(files, "zzz");
    expect(result).toEqual([]);
  });

  it("ranks better matches higher", () => {
    const result = rankFiles(files, "ut");
    expect(result[0]!.name).toBe("util.cpp");
  });

  it("breaks ties by filename ascending", () => {
    const dups = [
      { path: "/s/b.ino", name: "b.ino" },
      { path: "/s/a.ino", name: "a.ino" },
    ];
    const result = rankFiles(dups, "ino");
    expect(result.map((f) => f.name)).toEqual(["a.ino", "b.ino"]);
  });

  it("caps results at 50", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      path: `/s/file_${i}.ino`,
      name: `file_${i}.ino`,
    }));
    const result = rankFiles(many, "ino");
    expect(result.length).toBe(50);
  });
});
