import { describe, it, expect } from "vitest";
import { shouldAutoOpen, warnIds, readDismissed, writeDismissed } from "@/app/setup-check";
import type { SetupCheck } from "@/ipc/setup";

const check = (id: string, status: SetupCheck["status"]): SetupCheck => ({
  id,
  title: id,
  status,
  detail: "",
  fix: null,
});

describe("setup check auto-open", () => {
  it("opens when something blocks the build", () => {
    expect(shouldAutoOpen([check("rosetta", "fail"), check("disk", "ok")], [])).toBe(true);
  });

  it("opens for an action item the user has not dismissed", () => {
    expect(shouldAutoOpen([check("core", "warn")], [])).toBe(true);
  });

  it("stays closed for a dismissed action item", () => {
    expect(shouldAutoOpen([check("core", "warn")], ["core"])).toBe(false);
  });

  it("never opens for ok or info only", () => {
    expect(shouldAutoOpen([check("internet", "ok"), check("usb-permission", "info")], [])).toBe(false);
  });

  it("a blocker always opens even if a warn was dismissed", () => {
    expect(shouldAutoOpen([check("core", "warn"), check("rosetta", "fail")], ["core"])).toBe(true);
  });

  it("remembers only warn ids", () => {
    expect(warnIds([check("a", "warn"), check("b", "fail"), check("c", "warn"), check("d", "ok")])).toEqual([
      "a",
      "c",
    ]);
  });

  it("round-trips dismissed ids through storage and survives garbage", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    writeDismissed(["core"], storage);
    expect(readDismissed(storage)).toEqual(["core"]);
    store.set("fb-setup-dismissed", "{not json");
    expect(readDismissed(storage)).toEqual([]);
  });
});
