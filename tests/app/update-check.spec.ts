import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isNewer,
  runUpdateCheck,
  skipUpdateForNow,
  installAvailableUpdate,
  availableUpdate,
  updateDialogOpen,
  updateProgress,
  _resetUpdateState,
} from "@/app/update-check";
import { updaterApi, type AvailableUpdate } from "@/ipc/updater";
import { toast } from "@/app/state";

function update(version: string, install: AvailableUpdate["install"] = async () => {}): AvailableUpdate {
  return { version, currentVersion: "0.2.0", notes: "Fixes", date: "2026-10-12T00:00:00Z", install };
}

beforeEach(() => {
  _resetUpdateState();
  toast.value = null;
  vi.restoreAllMocks();
});

describe("version compare", () => {
  it("compares numerically, segment by segment", () => {
    expect(isNewer("0.2.1", "0.2.0")).toBe(true);
    expect(isNewer("0.10.0", "0.9.9")).toBe(true);
    expect(isNewer("v1.0.0", "0.99.0")).toBe(true);
    expect(isNewer("0.2.0", "0.2.0")).toBe(false);
    expect(isNewer("0.1.9", "0.2.0")).toBe(false);
  });
});

describe("update check", () => {
  it("opens the consent dialog when a newer release exists", async () => {
    vi.spyOn(updaterApi, "check").mockResolvedValue(update("0.3.0"));
    await runUpdateCheck(false);
    expect(availableUpdate.value?.version).toBe("0.3.0");
    expect(updateDialogOpen.value).toBe(true);
  });

  it("stays silent at startup when up to date, but says so on a manual check", async () => {
    vi.spyOn(updaterApi, "check").mockResolvedValue(null);
    await runUpdateCheck(false);
    expect(toast.value).toBeNull();
    await runUpdateCheck(true);
    expect(toast.value?.text).toMatch(/up to date/i);
  });

  it("ignores a release that is not newer, whatever the server says", async () => {
    vi.spyOn(updaterApi, "check").mockResolvedValue(update("0.1.0"));
    await runUpdateCheck(false);
    expect(updateDialogOpen.value).toBe(false);
  });

  it("'Later' hides the offer for this session only; a manual check shows it again", async () => {
    vi.spyOn(updaterApi, "check").mockResolvedValue(update("0.3.0"));
    await runUpdateCheck(false);
    skipUpdateForNow();
    expect(updateDialogOpen.value).toBe(false);
    await runUpdateCheck(false);
    expect(updateDialogOpen.value).toBe(false);
    await runUpdateCheck(true);
    expect(updateDialogOpen.value).toBe(true);
  });

  it("swallows errors at startup and reports them on a manual check", async () => {
    vi.spyOn(updaterApi, "check").mockRejectedValue(new Error("offline"));
    await runUpdateCheck(false);
    expect(toast.value).toBeNull();
    await runUpdateCheck(true);
    expect(toast.value?.text).toMatch(/Couldn't check/);
  });

  it("installs only on consent, reports progress, then relaunches", async () => {
    const install = vi.fn(async (onProgress: (d: number, t: number | null) => void) => {
      onProgress(0, 100);
      onProgress(50, 100);
      onProgress(100, 100);
    });
    vi.spyOn(updaterApi, "check").mockResolvedValue(update("0.3.0", install));
    const relaunch = vi.spyOn(updaterApi, "relaunch").mockResolvedValue(undefined);
    await runUpdateCheck(false);
    expect(install).not.toHaveBeenCalled();
    await installAvailableUpdate();
    expect(install).toHaveBeenCalledTimes(1);
    expect(updateProgress.value).toEqual({ downloaded: 100, total: 100 });
    expect(relaunch).toHaveBeenCalled();
  });

  it("a failed install leaves the app untouched and the dialog open", async () => {
    vi.spyOn(updaterApi, "check").mockResolvedValue(update("0.3.0", async () => { throw new Error("signature mismatch"); }));
    const relaunch = vi.spyOn(updaterApi, "relaunch").mockResolvedValue(undefined);
    await runUpdateCheck(false);
    await installAvailableUpdate();
    expect(relaunch).not.toHaveBeenCalled();
    expect(updateDialogOpen.value).toBe(true);
    expect(toast.value?.text).toMatch(/Nothing was changed/);
  });
});
