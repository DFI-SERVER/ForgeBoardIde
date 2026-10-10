import { describe, it, expect } from "vitest";
import { pickUploadFailureLine, uploadFailureDiagnostic, UPLOAD_FILE } from "@/features/build/upload-failure";

describe("upload failure → Problems entry", () => {
  it("picks esptool's fatal line over generic noise", () => {
    const out = [
      "Sketch uses 1 bytes (1%) of program storage space.",
      "esptool v5.3.1",
      "A fatal error occurred: Could not open /dev/cu.usbmodem31201, the port is busy or doesn't exist.",
      "Error during Upload: Failed uploading: uploading error: exit status 2",
    ];
    expect(pickUploadFailureLine(out)).toMatch(/^Could not open \/dev\/cu\.usbmodem31201/);
    const d = uploadFailureDiagnostic(out, "")!;
    expect(d.file).toBe(UPLOAD_FILE);
    expect(d.severity).toBe("error");
  });

  it("falls back to arduino-cli's own error line, and to null when nothing matches", () => {
    expect(pickUploadFailureLine(["Error during Upload: Failed uploading: no upload port provided"])).toBe(
      "Failed uploading: no upload port provided",
    );
    expect(pickUploadFailureLine(["all good"])).toBeNull();
    expect(uploadFailureDiagnostic([], "")).toBeNull();
  });
});
