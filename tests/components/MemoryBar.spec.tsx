import { render, screen } from "@testing-library/preact";
import { describe, it, expect, beforeEach } from "vitest";
import { MemoryBar, formatBytes } from "../../src/components/MemoryBar";
import {
  lastCompileSize,
  compileSizeHistory,
  selectedFqbn,
  activeProfile,
  sketchProfiles,
} from "../../src/state/appState";

beforeEach(() => {
  lastCompileSize.value = null;
  compileSizeHistory.value = new Map();
  selectedFqbn.value = "esp32:esp32:esp32s3";
  activeProfile.value = null;
  sketchProfiles.value = [];
});

describe("formatBytes", () => {
  it("reports values under 1 KiB in bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("reports a value at 1 KiB and above in KB, one decimal under 100 KB", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(32768)).toBe("32.0 KB");
  });

  it("rounds to whole KB at 100 KB and above", () => {
    expect(formatBytes(102400)).toBe("100 KB");
    expect(formatBytes(262144)).toBe("256 KB");
    expect(formatBytes(1310720)).toBe("1280 KB");
  });

  it("guards against non-finite and negative input", () => {
    expect(formatBytes(NaN)).toBe("0 B");
    expect(formatBytes(Infinity)).toBe("0 B");
    expect(formatBytes(-5)).toBe("0 B");
  });
});

describe("MemoryBar", () => {
  it("renders nothing until the first successful compile has produced a size", () => {
    const { container } = render(<MemoryBar />);
    expect(container.firstChild).toBeNull();
  });

  it("renders both bars and a labelled region once a size is available", () => {
    lastCompileSize.value = {
      flashUsed: 40192,
      flashTotal: 262144,
      ramUsed: 4012,
      ramTotal: 32768,
    };
    render(<MemoryBar />);
    expect(screen.getByText("Flash")).toBeInTheDocument();
    expect(screen.getByText("RAM")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /memory/i })).toBeInTheDocument();
  });

  it("reports each bar's percentage with the used / total byte summary", () => {
    lastCompileSize.value = {
      flashUsed: 40192,
      flashTotal: 262144,
      ramUsed: 4012,
      ramTotal: 32768,
    };
    const { container } = render(<MemoryBar />);
    // Flash: 40192 / 262144 = 15.3%; RAM: 4012 / 32768 = 12.2%.
    expect(screen.getByText("15.3%")).toBeInTheDocument();
    expect(screen.getByText("12.2%")).toBeInTheDocument();
    // The bytes summary is rendered as three sibling text nodes inside one
    // span — assert against the span's textContent rather than asking
    // getByText to match across split nodes.
    const byteSpans = container.querySelectorAll(".memory-bar-bytes");
    expect(byteSpans.length).toBe(2);
    // 40192 / 1024 = 39.25 → toFixed(1) = "39.3" (banker-of-half is toward +Inf).
    expect(byteSpans[0].textContent?.replace(/\s+/g, " ").trim()).toBe(
      "39.3 KB / 256 KB",
    );
    expect(byteSpans[1].textContent?.replace(/\s+/g, " ").trim()).toBe(
      "3.9 KB / 32.0 KB",
    );
  });

  it("paints the success-zone class while usage is under 80%", () => {
    lastCompileSize.value = {
      flashUsed: 50000,
      flashTotal: 100000,
      ramUsed: 500,
      ramTotal: 2000,
    };
    const { container } = render(<MemoryBar />);
    const fills = container.querySelectorAll(".memory-bar-fill");
    expect(fills.length).toBe(2);
    fills.forEach((fill) =>
      expect(fill.classList.contains("memory-bar-fill-success")).toBe(true),
    );
  });

  it("switches the bar to the warning zone class at 80% usage", () => {
    lastCompileSize.value = {
      flashUsed: 80000,
      flashTotal: 100000,
      ramUsed: 1700,
      ramTotal: 2000,
    };
    const { container } = render(<MemoryBar />);
    const fills = container.querySelectorAll(".memory-bar-fill");
    // Flash @ 80% → warning; RAM @ 85% → warning.
    fills.forEach((fill) =>
      expect(fill.classList.contains("memory-bar-fill-warning")).toBe(true),
    );
  });

  it("switches the bar to the error zone class at 90% usage", () => {
    lastCompileSize.value = {
      flashUsed: 95000,
      flashTotal: 100000,
      ramUsed: 1900,
      ramTotal: 2000,
    };
    const { container } = render(<MemoryBar />);
    const fills = container.querySelectorAll(".memory-bar-fill");
    fills.forEach((fill) =>
      expect(fill.classList.contains("memory-bar-fill-error")).toBe(true),
    );
  });

  it("hides the sparkline when there is no history for the active board", () => {
    lastCompileSize.value = {
      flashUsed: 1000,
      flashTotal: 10000,
      ramUsed: 200,
      ramTotal: 2000,
    };
    const { container } = render(<MemoryBar />);
    expect(container.querySelector(".memory-bar-sparkline")).toBeNull();
  });

  it("renders one spark bar per history entry, in oldest-first order", () => {
    lastCompileSize.value = {
      flashUsed: 1000,
      flashTotal: 10000,
      ramUsed: 200,
      ramTotal: 2000,
    };
    compileSizeHistory.value = new Map([
      ["esp32:esp32:esp32s3", [10, 20, 30, 40, 50]],
    ]);
    const { container } = render(<MemoryBar />);
    const bars = container.querySelectorAll(".memory-bar-spark-bar");
    expect(bars.length).toBe(5);
  });

  it("isolates each board's sparkline by FQBN", () => {
    lastCompileSize.value = {
      flashUsed: 1000,
      flashTotal: 10000,
      ramUsed: 200,
      ramTotal: 2000,
    };
    compileSizeHistory.value = new Map([
      ["avr:avr:uno", [10, 20]],
      ["esp32:esp32:esp32s3", [80, 90, 95]],
    ]);
    selectedFqbn.value = "esp32:esp32:esp32s3";
    const { container } = render(<MemoryBar />);
    const bars = container.querySelectorAll(".memory-bar-spark-bar");
    expect(bars.length).toBe(3); // the ESP32's history, not the Uno's
  });

  it("widths the fill div proportionally to usage", () => {
    lastCompileSize.value = {
      flashUsed: 25000,
      flashTotal: 100000,
      ramUsed: 1000,
      ramTotal: 2000,
    };
    const { container } = render(<MemoryBar />);
    const fills = container.querySelectorAll(".memory-bar-fill") as NodeListOf<HTMLElement>;
    // Flash → 25%.
    expect(fills[0].style.width).toMatch(/^25(?:\.0+)?%$/);
    // RAM → 50%.
    expect(fills[1].style.width).toMatch(/^50(?:\.0+)?%$/);
  });

  it("reads the sparkline bucket under the active profile's FQBN, not the global selector's", () => {
    // recordCompileSize buckets history under effectiveFqbn(); MemoryBar
    // must read the same bucket. When a profile is active, the global
    // selector's value should be ignored — otherwise we'd plot history
    // from the wrong board (or nothing at all).
    lastCompileSize.value = {
      flashUsed: 1000,
      flashTotal: 10000,
      ramUsed: 200,
      ramTotal: 2000,
    };
    selectedFqbn.value = "arduino:avr:uno";
    sketchProfiles.value = [
      { name: "release", fqbn: "esp32:esp32:esp32s3" },
    ];
    activeProfile.value = "release";
    compileSizeHistory.value = new Map([
      ["arduino:avr:uno", [10, 20]],
      ["esp32:esp32:esp32s3", [55, 60, 65, 70]],
    ]);
    const { container } = render(<MemoryBar />);
    const bars = container.querySelectorAll(".memory-bar-spark-bar");
    // The profile's bucket has 4 entries, not the Uno's 2.
    expect(bars.length).toBe(4);
  });
});
