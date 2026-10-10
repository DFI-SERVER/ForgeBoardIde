import { describe, it, expect } from "vitest";
import { mergeIndexUrls, CURATED_CATALOG } from "@/features/boards/index-urls";
import { urlList } from "@/features/settings/settings";

describe("board index URLs", () => {
  it("merges curated and user URLs without duplicates, skipping blanks", () => {
    const esp = CURATED_CATALOG.find((c) => c.id === "esp32:esp32")!.url!;
    const merged = mergeIndexUrls(CURATED_CATALOG, [" " + esp + " ", "https://x/y.json", ""]);
    expect(merged.filter((u) => u === esp)).toHaveLength(1);
    expect(merged[merged.length - 1]).toBe("https://x/y.json");
    expect(merged.every((u) => u.length > 0)).toBe(true);
  });

  it("settings keep only well-formed http(s) URLs", () => {
    expect(urlList(["https://a/b.json", "ftp://no", "garbage", " https://a/b.json ", 7])).toEqual([
      "https://a/b.json",
    ]);
    expect(urlList("nope")).toEqual([]);
  });
});
